import { useNavigate } from "react-router-dom";
import { useSpring, useMotionValueEvent } from "framer-motion";
import { useEffect, useState } from "react";
import { ArrowUpRight, History, TrendingUp } from "lucide-react";
import { Header } from "@/components/layout/header";
import { SectionHeader } from "@/components/premium/section-header";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/feedback/page-skeleton";
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
import { motion } from "framer-motion";

function AnimatedBalance({ value }: { value: number }) {
  const spring = useSpring(0, { stiffness: 80, damping: 20 });
  const [display, setDisplay] = useState(formatMoney(0));
  useMotionValueEvent(spring, "change", (v) => setDisplay(formatMoney(Math.round(v))));
  useEffect(() => {
    spring.set(value);
  }, [value, spring]);
  return <span className="text-4xl font-bold tracking-tight text-gradient-primary">{display}</span>;
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
  const loading = statusLoading && histLoading;
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
      <div className="page-scroll" {...pullProps}>
        <PullRefreshIndicator offset={pullOffset} />
        {loading ? (
          <PageSkeleton variant="wallet" />
        ) : (
        <div className="space-y-5 p-4">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="premium-hero text-center"
          >
            <div className="premium-hero-shine" aria-hidden />
            <p className="relative z-10 text-[10px] font-bold uppercase tracking-[0.14em] text-primary/70 mb-1">
              Баланс
            </p>
            <div className="relative z-10">
              {statusLoading ? (
                <Skeleton className="mx-auto h-10 w-40" />
              ) : (
                <AnimatedBalance value={balance} />
              )}
            </div>
            {config?.topup?.enabled && (
              <Button
                variant="tg"
                className="relative z-10 mt-4 w-full max-w-xs rounded-2xl"
                onClick={() => setTopupOpen(true)}
              >
                <ArrowUpRight className="h-4 w-4 mr-2" />
                Пополнить
              </Button>
            )}
          </motion.div>

          <div className="premium-glass p-4">
            <SectionHeader
              title="Расходы за 30 дней"
              action={<TrendingUp className="h-4 w-4 text-primary" />}
            />
            {histLoading ? (
              <Skeleton className="h-40 w-full rounded-xl" />
            ) : (
              <BalanceChart transactions={allTx} />
            )}
          </div>

          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Пополнено", value: topped },
              { label: "Потрачено", value: spent },
              { label: "Рефералы", value: referral },
            ].map((stat, i) => (
              <motion.div
                key={stat.label}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                className="premium-stat-pill"
              >
                <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  {stat.label}
                </div>
                <div className="mt-1 text-sm font-bold">{formatMoney(stat.value)}</div>
              </motion.div>
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
        )}
      </div>
      <TopUpSheet open={topupOpen} onOpenChange={setTopupOpen} />
    </>
  );
}
