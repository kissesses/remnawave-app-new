import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Activity, ChevronRight } from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/header";
import { SectionHeader } from "@/components/premium/section-header";
import { SubscriptionRing } from "@/components/premium/subscription-ring";
import { Badge } from "@/components/ui/badge";
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
      <div className="page-scroll pb-24" {...pullProps}>
        <PullRefreshIndicator offset={pullOffset} />
        {isLoading ? (
          <PageSkeleton variant="hero" />
        ) : (
        <div className="space-y-5 p-4">
            <motion.button
              type="button"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              whileTap={{ scale: 0.99 }}
              className="premium-hero w-full text-left"
              onClick={() => key && navigate(`/keys/${key.key_id}`)}
              disabled={!key}
            >
              <div className="relative z-10">
                {displayName && !branding.welcome_text?.includes("{name}") && (
                  <p className="text-xs text-muted-foreground mb-2">
                    Привет, <span className="text-foreground font-medium">{displayName}</span>
                  </p>
                )}
                <div className="flex items-center gap-4">
                  <SubscriptionRing percent={percent} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] font-semibold uppercase tracking-widest text-primary/70">
                      Подписка VPN
                    </p>
                    <h2 className="mt-0.5 text-lg font-bold truncate">
                      {key ? key.host_name || key.name : "Нет подписки"}
                    </h2>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {key
                        ? key.days_left > 0
                          ? `Активна · ${key.days_left} дн.`
                          : "Истекла — продлите"
                        : heroSub || "Оформите доступ"}
                    </p>
                    {key && (
                      <Badge variant={key.days_left > 0 ? "success" : "destructive"} className="mt-2">
                        {key.status_text}
                      </Badge>
                    )}
                  </div>
                  {key && <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />}
                </div>
                {key?.expire_date_str && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    До {formatDate(key.expire_date_str)}
                    {key.traffic_info ? ` · ${key.traffic_info}` : ""}
                  </p>
                )}
              </div>
            </motion.button>

          {keys.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none">
              {keys.map((k) => (
                <button
                  key={k.key_id}
                  type="button"
                  onClick={() => navigate(`/keys/${k.key_id}`)}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium border transition-colors ${
                    k.key_id === key?.key_id
                      ? "border-primary bg-primary/15 text-primary"
                      : "border-border bg-card/50 text-muted-foreground"
                  }`}
                >
                  {k.name || k.host_name}
                </button>
              ))}
            </div>
          )}

          <div>
            <SectionHeader title="Быстрые действия" />
            <div className="grid grid-cols-2 gap-2.5">
              {quickActions.map((action, i) => (
                <motion.button
                  key={action.id}
                  type="button"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: i * 0.04 }}
                  whileTap={{ scale: 0.97 }}
                  className="premium-action-tile"
                  onClick={() => {
                    haptic("selection");
                    action.onClick();
                  }}
                >
                  <action.icon className="h-6 w-6 text-primary" />
                  <span className="text-sm font-medium">{action.label}</span>
                </motion.button>
              ))}
            </div>
          </div>

          <div className="premium-glass overflow-hidden">
            <div className="flex items-center justify-between px-4 pt-4 pb-2">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Activity className="h-4 w-4 text-primary" />
                Активность
              </div>
              <button
                type="button"
                className="text-xs text-primary font-medium"
                onClick={() => navigate("/history")}
              >
                Все →
              </button>
            </div>
            <div className="px-4 pb-4 space-y-3">
              {recent.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Пока нет операций</p>
              ) : (
                recent.map((item) => (
                  <button
                    key={String(item.id)}
                    type="button"
                    className="flex w-full items-center justify-between text-sm text-left active:opacity-70"
                    onClick={() => navigate("/history")}
                  >
                    <div>
                      <div className="font-medium">{item.label}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(item.date)}</div>
                    </div>
                    <span
                      className={
                        item.success ? "text-emerald-500 font-semibold" : "text-muted-foreground"
                      }
                    >
                      {formatMoney(item.amount)}
                    </span>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
        )}
      </div>
      <PurchaseSheet open={purchaseOpen} onOpenChange={setPurchaseOpen} showPromo={config?.modules?.promo} />
      <RenewSheet open={renewOpen} onOpenChange={setRenewOpen} />
      <TrialSheet open={trialOpen} onOpenChange={setTrialOpen} hosts={trialHosts} />
    </>
  );
}
