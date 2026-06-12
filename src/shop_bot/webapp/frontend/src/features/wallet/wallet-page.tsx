import { useNavigate } from "react-router-dom";
import { useSpring, useMotionValueEvent } from "framer-motion";
import { useEffect, useState } from "react";
import { ArrowUpRight, History, TrendingUp, Wallet } from "lucide-react";
import { Header } from "@/components/layout/header";
import { SectionHeader } from "@/components/premium/section-header";
import { StudioHub, StudioStat } from "@/components/studio/studio-hub";
import { StudioBoard } from "@/components/studio/studio-board";
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
  return <span className="text-4xl font-bold tracking-tight text-foreground">{display}</span>;
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
        <div className="space-y-4 p-4">
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
            <StudioHub
              icon={Wallet}
              title="Кошелёк"
              description="Баланс и операции"
              stats={
                <>
                  <StudioStat>Пополнено {formatMoney(topped)}</StudioStat>
                  <StudioStat>Потрачено {formatMoney(spent)}</StudioStat>
                  {referral > 0 && <StudioStat variant="ok">Реф. {formatMoney(referral)}</StudioStat>}
                </>
              }
            >
              <div className="text-center py-1">
                <p className="studio-label mb-1">Текущий баланс</p>
                {statusLoading ? (
                  <Skeleton className="mx-auto h-10 w-40" />
                ) : (
                  <AnimatedBalance value={balance} />
                )}
                {config?.topup?.enabled && (
                  <Button
                    variant="tg"
                    className="mt-4 w-full max-w-xs rounded-xl"
                    onClick={() => setTopupOpen(true)}
                  >
                    <ArrowUpRight className="h-4 w-4 mr-2" />
                    Пополнить
                  </Button>
                )}
              </div>
            </StudioHub>
          </motion.div>

          <StudioBoard
            toolbar={
              <SectionHeader
                title="Расходы за 30 дней"
                action={<TrendingUp className="h-4 w-4 text-primary" />}
              />
            }
          >
            {histLoading ? (
              <Skeleton className="h-40 w-full rounded-xl" />
            ) : (
              <BalanceChart transactions={allTx} />
            )}
          </StudioBoard>

          <ListGroup>
            <ListCell
              icon={History}
              title="История операций"
              subtitle="Все платежи и пополнения"
              onClick={() => navigate("/app/history")}
            />
          </ListGroup>
        </div>
        )}
      </div>
      <TopUpSheet open={topupOpen} onOpenChange={setTopupOpen} />
    </>
  );
}
