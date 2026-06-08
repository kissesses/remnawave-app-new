import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api, getUserId } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import type { ShopPlan } from "@/types/api";

interface RenewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function RenewSheet({ open, onOpenChange }: RenewSheetProps) {
  const userId = getUserId();
  const { data, isLoading } = useQuery({
    queryKey: ["shop", "renew-catalog", userId],
    queryFn: () => api.getRenewCatalog(userId),
    enabled: open,
  });
  const [keyId, setKeyId] = useState<number | null>(null);
  const [plan, setPlan] = useState<ShopPlan | null>(null);
  const [paying, setPaying] = useState(false);

  const keys = data?.keys ?? [];
  const activeKey = keys.find((k) => k.key_id === keyId) ?? keys[0];
  const plans = activeKey ? (data?.plans_by_key?.[String(activeKey.key_id)] ?? []) : [];

  const pay = async () => {
    if (!activeKey || !plan) return;
    setPaying(true);
    try {
      const methods = await api.getPaymentMethods(userId);
      if (!methods.ok || !methods.methods?.length) {
        toast.error("Нет доступных способов оплаты");
        return;
      }
      const res = await api.createPayment({
        user_id: userId,
        action: "extend",
        key_id: activeKey.key_id,
        plan_id: plan.plan_id,
        host_name: activeKey.host_name,
        payment_method: methods.methods[0].id,
      });
      if (res.ok && res.paid) {
        toast.success(res.message ?? "Оплачено!");
        onOpenChange(false);
      } else if (res.ok && res.payment_url) {
        window.open(res.payment_url, "_blank");
        toast.success("Перейдите к оплате");
        onOpenChange(false);
      } else {
        toast.error(res.error ?? "Ошибка создания платежа");
      }
    } finally {
      setPaying(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="max-h-[90vh] overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Продлить подписку</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-5 pb-8">
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !keys.length ? (
            <p className="text-sm text-muted-foreground">Нет ключей для продления</p>
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Ключ</p>
                {keys.map((k) => (
                  <Button
                    key={k.key_id}
                    variant={activeKey?.key_id === k.key_id ? "tg" : "secondary"}
                    className="w-full justify-start"
                    onClick={() => {
                      setKeyId(k.key_id);
                      setPlan(null);
                    }}
                  >
                    {k.name || k.host_name}
                  </Button>
                ))}
              </div>
              <div className="grid gap-2">
                {plans.map((p) => (
                  <button
                    key={p.plan_id}
                    type="button"
                    onClick={() => setPlan(p)}
                    className={`rounded-2xl border p-4 text-left ${
                      plan?.plan_id === p.plan_id
                        ? "border-primary bg-primary/10"
                        : "border-border"
                    }`}
                  >
                    <div className="font-semibold">{p.label}</div>
                    <div className="text-primary font-bold">{formatMoney(p.price)}</div>
                  </button>
                ))}
              </div>
              <Button variant="tg" className="w-full" disabled={!plan || paying} onClick={pay}>
                Продлить
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
