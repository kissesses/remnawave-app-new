import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";
import { api, getUserId } from "@/lib/api";
import { useTelegram } from "./use-telegram";

export interface PaymentMethod {
  id: string;
  name: string;
  icon?: string;
  balance?: number;
}

export function usePaymentFlow() {
  const userId = getUserId();
  const { haptic, openLink } = useTelegram();
  const [methods, setMethods] = useState<PaymentMethod[]>([]);
  const [loadingMethods, setLoadingMethods] = useState(false);
  const [paying, setPaying] = useState(false);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const loadMethods = useCallback(async () => {
    setLoadingMethods(true);
    try {
      const res = await api.getPaymentMethods(userId);
      if (res.ok) setMethods(res.methods ?? []);
      return res;
    } finally {
      setLoadingMethods(false);
    }
  }, [userId]);

  const pollPayment = useCallback(
    (paymentId: string, onSuccess?: () => void) => {
      stopPoll();
      let attempts = 0;
      pollRef.current = setInterval(async () => {
        attempts += 1;
        if (attempts > 60) {
          stopPoll();
          return;
        }
        try {
          const res = await api.checkPayment(userId, paymentId);
          if (res.ok && res.paid) {
            stopPoll();
            haptic("success");
            toast.success("Оплата прошла успешно");
            onSuccess?.();
          }
        } catch {
          /* ignore */
        }
      }, 3000);
    },
    [userId, haptic, stopPoll],
  );

  const pay = useCallback(
    async (
      payload: Record<string, unknown>,
      methodId: string,
      onSuccess?: () => void,
    ) => {
      setPaying(true);
      try {
        const res = await api.createPayment({ ...payload, user_id: userId, payment_method: methodId });
        if (res.ok && res.paid) {
          haptic("success");
          toast.success(res.message ?? "Оплачено");
          onSuccess?.();
          return res;
        }
        if (res.ok && res.payment_url) {
          if (openLink) openLink(res.payment_url);
          else window.open(res.payment_url, "_blank");
          if (res.payment_id) pollPayment(res.payment_id, onSuccess);
          toast.info("Завершите оплату в открывшемся окне");
          return res;
        }
        toast.error(res.error ?? "Ошибка оплаты");
        haptic("error");
        return res;
      } finally {
        setPaying(false);
      }
    },
    [userId, haptic, openLink, pollPayment],
  );

  return {
    methods,
    loadingMethods,
    paying,
    loadMethods,
    pay,
    stopPoll,
    pickDefaultMethod: (amount: number, balance: number) => {
      const balanceMethod = methods.find((m) => m.id === "pay_balance");
      if (balanceMethod && balance >= amount) return "pay_balance";
      return methods.find((m) => m.id !== "pay_balance")?.id ?? methods[0]?.id;
    },
  };
}
