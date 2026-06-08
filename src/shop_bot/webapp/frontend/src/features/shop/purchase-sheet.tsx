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
import { motion } from "framer-motion";
import type { ShopHost, ShopPlan } from "@/types/api";

interface PurchaseSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function PurchaseSheet({ open, onOpenChange }: PurchaseSheetProps) {
  const userId = getUserId();
  const { data, isLoading } = useQuery({
    queryKey: ["shop", "purchase-catalog", userId],
    queryFn: () => api.getPurchaseCatalog(userId),
    enabled: open,
  });
  const [host, setHost] = useState<ShopHost | null>(null);
  const [plan, setPlan] = useState<ShopPlan | null>(null);
  const [paying, setPaying] = useState(false);

  const hosts = data?.hosts ?? [];
  const activeHost = host ?? hosts[0] ?? null;

  const pay = async () => {
    if (!activeHost || !plan) return;
    setPaying(true);
    try {
      const methods = await api.getPaymentMethods(userId);
      if (!methods.ok || !methods.methods?.length) {
        toast.error("Нет доступных способов оплаты");
        return;
      }
      const method = methods.methods[0].id;
      const res = await api.createPayment({
        user_id: userId,
        action: "new",
        plan_id: plan.plan_id,
        host_name: activeHost.host_name,
        payment_method: method,
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
          <SheetTitle>Купить VPN</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-5 pb-8">
          {isLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : !hosts.length ? (
            <p className="text-sm text-muted-foreground">Нет доступных серверов</p>
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Сервер</p>
                <div className="flex flex-wrap gap-2">
                  {hosts.map((h) => (
                    <Button
                      key={h.host_name}
                      size="sm"
                      variant={activeHost?.host_name === h.host_name ? "tg" : "secondary"}
                      onClick={() => {
                        setHost(h);
                        setPlan(null);
                      }}
                    >
                      {h.host_name}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Тариф</p>
                <div className="grid gap-2">
                  {activeHost?.plans.map((p) => (
                    <motion.button
                      key={p.plan_id}
                      whileTap={{ scale: 0.98 }}
                      type="button"
                      onClick={() => setPlan(p)}
                      className={`rounded-2xl border p-4 text-left transition-colors ${
                        plan?.plan_id === p.plan_id
                          ? "border-primary bg-primary/10"
                          : "border-border bg-card"
                      }`}
                    >
                      <div className="font-semibold">{p.label}</div>
                      <div className="text-sm text-muted-foreground">{p.months} мес.</div>
                      <div className="mt-1 text-lg font-bold text-primary">
                        {formatMoney(p.price)}
                      </div>
                    </motion.button>
                  ))}
                </div>
              </div>
              <Button
                variant="tg"
                className="w-full"
                disabled={!plan || paying}
                onClick={pay}
              >
                {paying ? "Создание..." : "Оплатить"}
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
