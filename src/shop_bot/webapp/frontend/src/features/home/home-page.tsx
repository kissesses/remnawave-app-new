import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Activity, ChevronRight, Shield } from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/header";
import { SectionHeader } from "@/components/premium/section-header";
import { SubscriptionRing } from "@/components/premium/subscription-ring";
import { StudioHub, StudioStat } from "@/components/studio/studio-hub";
import { StudioBoard } from "@/components/studio/studio-board";
import { StudioChip, StudioChipRow } from "@/components/studio/studio-chip";
import { StudioOverviewCard, StudioOverviewGrid } from "@/components/studio/studio-overview-card";
import { PageSkeleton } from "@/components/feedback/page-skeleton";
import { PullRefreshIndicator } from "@/components/feedback/pull-refresh";
import { useCabinetBootstrap, useRefreshCabinet, usePaymentHistory } from "@/hooks/use-cabinet";
import { usePullRefresh } from "@/hooks/use-pull-refresh";
import { useBranding } from "@/hooks/use-branding";
import { useTelegram } from "@/hooks/use-telegram";
import { formatMoney, formatDate } from "@/lib/utils";
import { formatWelcomeText } from "@/lib/branding-text";
import { buildQuickActions } from "@/lib/quick-actions";
import { PurchaseSheet } from "@/features/shop/purchase-sheet";
import { RenewSheet } from "@/features/shop/renew-sheet";
import { TrialSheet } from "@/features/shop/trial-sheet";
import { api, getUserId } from "@/lib/api";

export function HomePage() {
  const navigate = useNavigate();
  const refresh = useRefreshCabinet();
  const { pullProps, pullOffset } = usePullRefresh(refresh);
  const { data, isLoading } = useCabinetBootstrap();
  const { data: history } = usePaymentHistory(5);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const [trialOpen, setTrialOpen] = useState(false);
  const [trialHosts, setTrialHosts] = useState<{ host_name: string }[] | undefined>();
  const branding = useBranding();
  const { displayName, haptic } = useTelegram();

  const status = data?.status;
  const config = data?.config;
  const keys = status?.keys ?? [];
  const key = keys.find((k) => k.days_left > 0) ?? keys[0];
  const percent = key ? parseInt(key.percent_str.replace("%", ""), 10) || 0 : 0;
  const heroSub = config?.content_overrides?.hero_sub;

  const recent = [...(history?.payments ?? []), ...(history?.balance ?? [])]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 3);

  const openTrial = async () => {
    const trialHostsList = config?.trial?.hosts ?? [];
    if (trialHostsList.length > 1) {
      setTrialHosts(trialHostsList);
      setTrialOpen(true);
      return;
    }
    const res = await api.activateTrial(getUserId(), trialHostsList[0]?.host_name);
    if (res.ok) {
      haptic("success");
      toast.success("Пробный период активирован");
      await refresh();
    } else if (res.needs_host && res.hosts?.length) {
      setTrialHosts(res.hosts);
      setTrialOpen(true);
    } else {
      toast.error(res.error ?? "Не удалось активировать");
    }
  };

  const quickActions = buildQuickActions(config, {
    onBuy: () => setPurchaseOpen(true),
    onRenew: () => setRenewOpen(true),
    onTrial: openTrial,
    onReferrals: () => navigate("/profile"),
    onHowto: () => navigate("/vpn/setup"),
    onTopup: () => navigate("/wallet"),
    onPromo: () => setPurchaseOpen(true),
    onSupport: () => navigate("/support"),
  });

  const headerTitle = formatWelcomeText(branding.welcome_text, displayName);

  return (
    <>
      <Header title={headerTitle} showNotifications logo={branding.logo} />
      <div className="page-scroll" {...pullProps}>
        <PullRefreshIndicator offset={pullOffset} />
        {isLoading ? (
          <PageSkeleton variant="hero" />
        ) : (
        <div className="space-y-4 p-4">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <StudioHub
                icon={Shield}
                title={key ? key.host_name || key.name : "Нет подписки"}
                description={
                  key
                    ? key.days_left > 0
                      ? `Активна · ${key.days_left} дн.`
                      : "Истекла — продлите"
                    : heroSub || "Оформите доступ к VPN"
                }
                onClick={() => key && navigate(`/keys/${key.key_id}`)}
                stats={
                  key ? (
                    <>
                      <StudioStat variant={key.days_left > 0 ? "ok" : "warn"}>
                        {key.status_text}
                      </StudioStat>
                      {key.expire_date_str && (
                        <StudioStat>до {formatDate(key.expire_date_str)}</StudioStat>
                      )}
                      {key.traffic_info && <StudioStat>{key.traffic_info}</StudioStat>}
                    </>
                  ) : undefined
                }
              >
                <div className="flex items-center gap-4">
                  <SubscriptionRing percent={percent} size={88} />
                  <div className="min-w-0 flex-1">
                    <p className="studio-label">Подписка VPN</p>
                    {displayName && !branding.welcome_text?.includes("{name}") && (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Привет, <span className="text-foreground font-medium">{displayName}</span>
                      </p>
                    )}
                  </div>
                  {key && <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />}
                </div>
              </StudioHub>
            </motion.div>

          {keys.length > 1 && (
            <StudioChipRow>
              {keys.map((k) => (
                <StudioChip
                  key={k.key_id}
                  active={k.key_id === key?.key_id}
                  onClick={() => navigate(`/keys/${k.key_id}`)}
                >
                  {k.name || k.host_name}
                </StudioChip>
              ))}
            </StudioChipRow>
          )}

          <div>
            <SectionHeader title="Быстрые действия" />
            <StudioOverviewGrid>
              {quickActions.map((action, i) => (
                <motion.div
                  key={action.id}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.04 }}
                >
                  <StudioOverviewCard
                    icon={action.icon}
                    title={action.label}
                    onClick={() => {
                      haptic("selection");
                      action.onClick();
                    }}
                  />
                </motion.div>
              ))}
            </StudioOverviewGrid>
          </div>

          <StudioBoard
            toolbar={
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <Activity className="h-4 w-4 text-primary" />
                  Активность
                </div>
                <button
                  type="button"
                  className="text-xs font-semibold text-primary"
                  onClick={() => navigate("/history")}
                >
                  Все →
                </button>
              </div>
            }
          >
            {recent.length === 0 ? (
              <p className="py-2 text-sm text-muted-foreground">Пока нет операций</p>
            ) : (
              <div className="space-y-0">
                {recent.map((item, i) => (
                  <button
                    key={String(item.id)}
                    type="button"
                    className={`flex w-full items-center justify-between py-2.5 text-left text-sm active:opacity-70 ${
                      i > 0 ? "border-t border-border/30" : ""
                    }`}
                    onClick={() => navigate("/history")}
                  >
                    <div>
                      <div className="font-medium">{item.label}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(item.date)}</div>
                    </div>
                    <span
                      className={
                        item.success ? "font-semibold text-emerald-500" : "text-muted-foreground"
                      }
                    >
                      {formatMoney(item.amount)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </StudioBoard>
        </div>
        )}
      </div>
      <PurchaseSheet open={purchaseOpen} onOpenChange={setPurchaseOpen} showPromo={config?.modules?.promo} />
      <RenewSheet open={renewOpen} onOpenChange={setRenewOpen} />
      <TrialSheet open={trialOpen} onOpenChange={setTrialOpen} hosts={trialHosts} />
    </>
  );
}
