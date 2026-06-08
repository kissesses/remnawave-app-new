import { useNavigate } from "react-router-dom";
import { useSpring, useMotionValueEvent } from "framer-motion";
import { useEffect, useState } from "react";
import { ArrowUpRight, History } from "lucide-react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PullRefreshIndicator } from "@/components/feedback/pull-refresh";
import { BalanceChart } from "@/components/charts/balance-chart";
import { ListCell, ListGroup } from "@/components/layout/list-cell";
import {
  useUserStatus,
  usePaymentHistory,
  useCabinetConfig,
  useRefreshCabinet,
} from "@/hooks/use-cabinet";
import { usePullRefresh } from "@/hooks/use-pull-refresh";
import { formatMoney } from "@/lib/utils";
import { TopUpSheet } from "@/features/shop/topup-sheet";
import { useState } from "react";

function AnimatedBalance({ value }: { value: number }) {
  const spring = useSpring(0, { stiffness: 80, damping: 20 });
  const [display, setDisplay] = useState(formatMoney(0));
  useMotionValueEvent(spring, "change", (v) => setDisplay(formatMoney(Math.round(v))));
  useEffect(() => {
    spring.set(value);
  }, [value, spring]);
  return <span className="text-4xl font-bold tracking-tight">{display}</span>;
}

export function WalletPage() {
  const navigate = useNavigate();
  const refresh = useRefreshCabinet();
  const { pullProps, pullOffset } = usePullRefresh(refresh);
  const { data: status, isLoading: statusLoading } = useUserStatus();
  const { data: history, isLoading: histLoading } = usePaymentHistory(50);
  const { data: config } = useCabinetConfig();
  const [topupOpen, setTopupOpen] = useState(false);

  const balance = status?.balance ?? config?.balance ?? 0;
  const allTx = [...(history?.payments ?? []), ...(history?.balance ?? [])];
  const spent = (history?.payments ?? [])
    .filter((t) => t.success)
    .reduce((s, t) => s + t.amount, 0);
  const topped = (history?.balance ?? [])
    .filter((t) => t.success && t.label.toLowerCase().includes("пополн"))
    .reduce((s, t) => s + t.amount, 0);
  const referral = status?.referral_earned ?? 0;

  return (
    <>
      <Header title="Кошелёк" />
      <div className="page-scroll pb-24" {...pullProps}>
        <PullRefreshIndicator offset={pullOffset} />
        <div className="space-y-4 p-4">
          <Card className="border-primary/20 bg-gradient-to-br from-primary/5 to-transparent">
            <CardContent className="pt-6 pb-6 text-center">
              <p className="text-sm text-muted-foreground mb-1">Баланс</p>
              {statusLoading ? (
                <Skeleton className="mx-auto h-10 w-40" />
              ) : (
                <AnimatedBalance value={balance} />
              )}
              {config?.topup?.enabled && (
                <Button
                  variant="tg"
                  className="mt-4 w-full max-w-xs"
                  onClick={() => setTopupOpen(true)}
                >
                  <ArrowUpRight className="h-4 w-4 mr-2" />
                  Пополнить
                </Button>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-0">
              <CardTitle className="text-base">Расходы за 30 дней</CardTitle>
            </CardHeader>
            <CardContent>
              {histLoading ? (
                <Skeleton className="h-40 w-full" />
              ) : (
                <BalanceChart transactions={allTx} />
              )}
            </CardContent>
          </Card>

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Пополнено", value: topped },
              { label: "Потрачено", value: spent },
              { label: "Рефералы", value: referral },
            ].map((stat) => (
              <Card key={stat.label} className="text-center p-3">
                <div className="text-xs text-muted-foreground">{stat.label}</div>
                <div className="mt-1 text-sm font-semibold">{formatMoney(stat.value)}</div>
              </Card>
            ))}
          </div>

          <ListGroup>
            <ListCell
              icon={History}
              title="История операций"
              subtitle="Все платежи и пополнения"
              onClick={() => navigate("/history")}
            />
          </ListGroup>
        </div>
      </div>
      <TopUpSheet open={topupOpen} onOpenChange={setTopupOpen} />
    </>
  );
}
