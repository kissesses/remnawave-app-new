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
import { useUserStatus, useCabinetConfig } from "@/hooks/use-cabinet";
import { Badge } from "@/components/ui/badge";
import { api, getUserId } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { motion } from "framer-motion";
import type { ShopHost, ShopPlan } from "@/types/api";

interface PurchaseSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  showPromo?: boolean;
}

export function PurchaseSheet({ open, onOpenChange, showPromo }: PurchaseSheetProps) {
  const userId = getUserId();
  const qc = useQueryClient();
  const { data: status } = useUserStatus();
  const { data: config } = useCabinetConfig();
  const sellerDiscount = config?.seller_discount ?? 0;
  const { data, isLoading } = useQuery({
    queryKey: ["shop", "purchase-catalog", userId],
    queryFn: () => api.getPurchaseCatalog(userId),
    enabled: open,
  });
  const [host, setHost] = useState<ShopHost | null>(null);
  const [plan, setPlan] = useState<ShopPlan | null>(null);
  const [methodId, setMethodId] = useState<string | null>(null);
  const { methods, loadingMethods, paying, loadMethods, pay, pickDefaultMethod } =
    usePaymentFlow();

  const hosts = data?.hosts ?? [];
  const activeHost = host ?? hosts[0] ?? null;
  const balance = status?.balance ?? 0;

  useEffect(() => {
    if (open) loadMethods();
  }, [open, loadMethods]);

  useEffect(() => {
    if (methods.length && plan) {
      setMethodId(pickDefaultMethod(plan.price, balance));
    }
  }, [methods, plan, balance, pickDefaultMethod]);

  const handlePay = async () => {
    if (!activeHost || !plan || !methodId) return;
    await pay(
      {
        action: "new",
        plan_id: plan.plan_id,
        host_name: activeHost.host_name,
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
          <SheetTitle className="text-gradient-primary flex items-center gap-2">
            Купить VPN
            {sellerDiscount > 0 ? (
              <Badge variant="success" className="text-[10px]">
                −{sellerDiscount}%
              </Badge>
            ) : null}
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-5 px-5 pb-8">
          {isLoading ? (
            <Skeleton className="h-40 w-full rounded-2xl" />
          ) : !hosts.length ? (
            <p className="text-sm text-muted-foreground">Нет доступных серверов</p>
          ) : (
            <>
              <div>
                <SectionHeader title="Сервер" />
                <div className="flex flex-wrap gap-2">
                  {hosts.map((h) => (
                    <Button
                      key={h.host_name}
                      size="sm"
                      variant={activeHost?.host_name === h.host_name ? "tg" : "secondary"}
                      className="rounded-full flex-col h-auto py-2 px-3"
                      onClick={() => {
                        setHost(h);
                        setPlan(null);
                      }}
                    >
                      <span>{h.host_name}</span>
                      {h.speedtest?.download_mbps ? (
                        <span className="text-[10px] opacity-70 mt-0.5 font-normal">
                          ↓ {Math.round(h.speedtest.download_mbps)} Mbps ·{" "}
                          {Math.round(h.speedtest.ping_ms)} ms
                        </span>
                      ) : null}
                    </Button>
                  ))}
                </div>
              </div>

              <div>
                <SectionHeader title="Тариф" />
                <div className="grid gap-2">
                  {activeHost?.plans.map((p) => (
                    <motion.button
                      key={p.plan_id}
                      whileTap={{ scale: 0.98 }}
                      type="button"
                      onClick={() => setPlan(p)}
                      className={`rounded-2xl border p-4 text-left transition-all ${
                        plan?.plan_id === p.plan_id
                          ? "border-primary/50 bg-primary/10"
                          : "border-border/50 premium-glass"
                      }`}
                    >
                      <div className="font-semibold">{p.label}</div>
                      <div className="text-sm text-muted-foreground">{p.months} мес.</div>
                      <div className="mt-1 text-xl font-bold text-primary">
                        {formatMoney(p.price)}
                      </div>
                    </motion.button>
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
                className="w-full rounded-2xl h-12 text-base"
                disabled={!plan || !methodId || paying}
                onClick={handlePay}
              >
                {paying ? "Обработка…" : plan ? `Оплатить ${formatMoney(plan.price)}` : "Выберите тариф"}
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
