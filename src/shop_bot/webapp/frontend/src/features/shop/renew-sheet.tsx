import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PaymentMethodPicker } from "@/components/premium/payment-method-picker";
import { PromoField } from "@/components/premium/promo-field";
import { SectionHeader } from "@/components/premium/section-header";
import { usePaymentFlow } from "@/hooks/use-payment-flow";
import { useUserStatus } from "@/hooks/use-cabinet";
import { api, getUserId } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import type { ShopPlan } from "@/types/api";

interface RenewSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialKeyId?: number;
  showPromo?: boolean;
}

export function RenewSheet({ open, onOpenChange, initialKeyId, showPromo }: RenewSheetProps) {
  const userId = getUserId();
  const qc = useQueryClient();
  const { data: status } = useUserStatus();
  const { data, isLoading } = useQuery({
    queryKey: ["shop", "renew-catalog", userId],
    queryFn: () => api.getRenewCatalog(userId),
    enabled: open,
  });
  const [keyId, setKeyId] = useState<number | null>(initialKeyId ?? null);
  const [plan, setPlan] = useState<ShopPlan | null>(null);
  const [methodId, setMethodId] = useState<string | null>(null);
  const { methods, loadingMethods, paying, loadMethods, pay, pickDefaultMethod } =
    usePaymentFlow();

  const keys = data?.keys ?? [];
  const activeKey = keys.find((k) => k.key_id === keyId) ?? keys[0];
  const plans = activeKey ? (data?.plans_by_key?.[String(activeKey.key_id)] ?? []) : [];
  const balance = status?.balance ?? 0;
  const singleKey = keys.length <= 1;

  useEffect(() => {
    if (open && initialKeyId) setKeyId(initialKeyId);
  }, [open, initialKeyId]);

  useEffect(() => {
    if (open) loadMethods();
  }, [open, loadMethods]);

  useEffect(() => {
    if (methods.length && plan) {
      setMethodId(pickDefaultMethod(plan.price, balance));
    }
  }, [methods, plan, balance, pickDefaultMethod]);

  const handlePay = async () => {
    if (!activeKey || !plan || !methodId) return;
    await pay(
      {
        action: "extend",
        key_id: activeKey.key_id,
        plan_id: plan.plan_id,
        host_name: activeKey.host_name,
      },
      methodId,
      async () => {
        onOpenChange(false);
        await qc.invalidateQueries({ queryKey: ["user", "status"] });
        await qc.invalidateQueries({ queryKey: ["cabinet", "bootstrap"] });
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="max-h-[92vh] overflow-y-auto rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-gradient-primary">Продлить подписку</SheetTitle>
        </SheetHeader>
        <div className="space-y-5 px-5 pb-8">
          {isLoading ? (
            <Skeleton className="h-40 w-full rounded-2xl" />
          ) : !keys.length ? (
            <p className="text-sm text-muted-foreground">Нет ключей для продления</p>
          ) : (
            <>
              {!singleKey && (
                <div>
                  <SectionHeader title="Подписка" />
                  <div className="space-y-2">
                    {keys.map((k) => (
                      <Button
                        key={k.key_id}
                        variant={activeKey?.key_id === k.key_id ? "tg" : "secondary"}
                        className="w-full justify-start rounded-2xl"
                        onClick={() => {
                          setKeyId(k.key_id);
                          setPlan(null);
                        }}
                      >
                        {k.name || k.host_name}
                      </Button>
                    ))}
                  </div>
                </div>
              )}

              {singleKey && activeKey && (
                <div className="premium-glass p-4">
                  <p className="text-sm font-semibold">{activeKey.name || activeKey.host_name}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Истекает {activeKey.expire_date_str}
                  </p>
                </div>
              )}

              <div>
                <SectionHeader title="Период" />
                <div className="grid gap-2">
                  {plans.map((p) => (
                    <button
                      key={p.plan_id}
                      type="button"
                      onClick={() => setPlan(p)}
                      className={`rounded-2xl border p-4 text-left transition-all ${
                        plan?.plan_id === p.plan_id
                          ? "border-primary bg-primary/10"
                          : "border-border/50 premium-glass"
                      }`}
                    >
                      <div className="font-semibold">{p.label}</div>
                      {p.description && (
                        <p className="text-xs text-muted-foreground mt-0.5">{p.description}</p>
                      )}
                      <div className="text-primary font-bold text-lg mt-1">
                        {formatMoney(p.price)}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {showPromo && plan && (
                <div>
                  <SectionHeader title="Промокод" />
                  <PromoField planId={plan.plan_id} />
                </div>
              )}

              {plan && (
                <div>
                  <SectionHeader title="Способ оплаты" />
                  {loadingMethods ? (
                    <Skeleton className="h-16 w-full rounded-2xl" />
                  ) : (
                    <PaymentMethodPicker
                      methods={methods}
                      selected={methodId}
                      onSelect={setMethodId}
                      balance={balance}
                    />
                  )}
                </div>
              )}

              <Button
                variant="tg"
                className="w-full rounded-2xl h-12"
                disabled={!plan || !methodId || paying}
                onClick={handlePay}
              >
                {paying
                  ? "Обработка…"
                  : plan
                    ? `Продлить за ${formatMoney(plan.price)}`
                    : "Продлить"}
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
