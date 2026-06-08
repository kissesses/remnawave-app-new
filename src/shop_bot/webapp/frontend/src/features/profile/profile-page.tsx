import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Settings,
  Users,
  Copy,
  ChevronRight,
  Shield,
  Wallet,
  History,
  Headphones,
  Wrench,
  Share2,
  Calendar,
  TrendingUp,
  Bell,
} from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/header";
import { SectionHeader } from "@/components/premium/section-header";
import { ProfileHeroCard } from "@/components/premium/profile-hero-card";
import { StudioBoard } from "@/components/studio/studio-board";
import { StudioChip, StudioChipRow } from "@/components/studio/studio-chip";
import {
  StudioOverviewCard,
  StudioOverviewGrid,
} from "@/components/studio/studio-overview-card";
import { SubscriptionRing } from "@/components/premium/subscription-ring";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/feedback/page-skeleton";
import { PullRefreshIndicator } from "@/components/feedback/pull-refresh";
import {
  useUserStatus,
  useCabinetConfig,
  useRefreshCabinet,
  useUserId,
} from "@/hooks/use-cabinet";
import { usePullRefresh } from "@/hooks/use-pull-refresh";
import { useTelegram } from "@/hooks/use-telegram";
import { api } from "@/lib/api";
import { formatMoney, formatDate, cn } from "@/lib/utils";
import type { VpnKey } from "@/types/api";

type KeyFilter = "all" | "active" | "expired";

function filterKeys(keys: VpnKey[], filter: KeyFilter) {
  if (filter === "active") return keys.filter((k) => k.days_left > 0);
  if (filter === "expired") return keys.filter((k) => k.days_left <= 0);
  return keys;
}

export function ProfilePage() {
  const navigate = useNavigate();
  const userId = useUserId();
  const refresh = useRefreshCabinet();
  const { pullProps, pullOffset } = usePullRefresh(refresh);
  const { data: status, isLoading } = useUserStatus();
  const { data: config } = useCabinetConfig();
  const { displayName, user: tgUser, haptic, openLink } = useTelegram();
  const [keyFilter, setKeyFilter] = useState<KeyFilter>("all");

  const avatarUrl = tgUser?.photo_url || api.getAvatarUrl(userId);
  const initials = displayName?.slice(0, 2).toUpperCase() || String(userId).slice(-2);
  const profile = status?.profile;
  const username = tgUser?.username || profile?.username;
  const referralLink = status?.referral_link ?? config?.referrals?.link;
  const referralCount = status?.referral_count ?? config?.referrals?.count ?? 0;
  const referralEarned = status?.referral_earned ?? config?.referrals?.earned ?? 0;

  const keys = status?.keys ?? [];
  const filteredKeys = useMemo(() => filterKeys(keys, keyFilter), [keys, keyFilter]);
  const activeCount = profile?.active_keys ?? keys.filter((k) => k.days_left > 0).length;
  const totalCount = profile?.total_keys ?? keys.length;

  const copyReferral = async () => {
    if (!referralLink) return;
    await navigator.clipboard.writeText(referralLink);
    haptic("success");
    toast.success("Реферальная ссылка скопирована");
  };

  const shareReferral = () => {
    if (!referralLink) return;
    haptic("selection");
    const text = encodeURIComponent("Подключайся к VPN — бонус по моей ссылке");
    const url = encodeURIComponent(referralLink);
    openLink?.(`https://t.me/share/url?url=${url}&text=${text}`);
  };

  const quickActions = [
    {
      id: "wallet",
      icon: Wallet,
      label: "Кошелёк",
      meta: formatMoney(status?.balance ?? 0),
      onClick: () => navigate("/wallet"),
      show: true,
    },
    {
      id: "history",
      icon: History,
      label: "История",
      onClick: () => navigate("/history"),
      show: true,
    },
    {
      id: "vpn",
      icon: Wrench,
      label: "Настройка VPN",
      onClick: () => navigate("/vpn/setup"),
      show: config?.modules?.howto !== false,
    },
    {
      id: "support",
      icon: Headphones,
      label: "Поддержка",
      onClick: () => navigate("/support"),
      show: config?.modules?.support,
    },
    {
      id: "notifications",
      icon: Bell,
      label: "Уведомления",
      onClick: () => navigate("/notifications"),
      show: true,
    },
    {
      id: "settings",
      icon: Settings,
      label: "Настройки",
      onClick: () => navigate("/settings"),
      show: true,
    },
  ].filter((a) => a.show);

  return (
    <>
      <Header title="Профиль" />
      <div className="page-scroll" {...pullProps}>
        <PullRefreshIndicator offset={pullOffset} />
        {isLoading && !status ? (
          <PageSkeleton variant="profile" />
        ) : (
          <div className="space-y-4 p-4">
            <ProfileHeroCard
              displayName={displayName ?? `ID ${userId}`}
              username={username}
              userId={userId}
              avatarUrl={avatarUrl}
              initials={initials}
              balance={status?.balance ?? 0}
              activeKeys={activeCount}
              totalKeys={totalCount}
              referralCount={referralCount}
              trialUsed={status?.trial_used}
              trialAvailable={status?.trial_available}
            />

            <div>
              <SectionHeader title="Быстрые действия" />
              <StudioOverviewGrid>
                {quickActions.map((action, i) => (
                  <motion.div
                    key={action.id}
                    className="h-full"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: i * 0.04 }}
                  >
                    <StudioOverviewCard
                      icon={action.icon}
                      title={action.label}
                      meta={action.meta}
                      onClick={() => {
                        haptic("selection");
                        action.onClick();
                      }}
                    />
                  </motion.div>
                ))}
              </StudioOverviewGrid>
            </div>

            <div>
              <SectionHeader
                title="Мои подписки"
                action={
                  <button
                    type="button"
                    className="text-xs font-semibold text-primary"
                    onClick={() => navigate("/")}
                  >
                    Главная →
                  </button>
                }
              />
              <StudioChipRow className="mb-2">
                {(
                  [
                    ["all", `Все (${totalCount})`],
                    ["active", `Активные (${activeCount})`],
                    ["expired", `Истекшие (${totalCount - activeCount})`],
                  ] as const
                ).map(([id, label]) => (
                  <StudioChip
                    key={id}
                    active={keyFilter === id}
                    onClick={() => {
                      haptic("selection");
                      setKeyFilter(id);
                    }}
                  >
                    {label}
                  </StudioChip>
                ))}
              </StudioChipRow>

              <StudioBoard>
                {filteredKeys.length === 0 ? (
                  <p className="py-6 text-center text-sm text-muted-foreground">
                    {keyFilter === "all"
                      ? "Нет ключей — оформите подписку на главной"
                      : "Нет ключей в этой категории"}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {filteredKeys.map((key, i) => {
                      const percent = parseInt(key.percent_str.replace("%", ""), 10) || 0;
                      return (
                        <motion.button
                          key={key.key_id}
                          type="button"
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: i * 0.04 }}
                          whileTap={{ scale: 0.99 }}
                          className="studio-card flex w-full items-center gap-3 text-left !p-3"
                          onClick={() => {
                            haptic("selection");
                            navigate(`/keys/${key.key_id}`);
                          }}
                        >
                          <SubscriptionRing percent={percent} size={52} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <Shield className="h-3.5 w-3.5 shrink-0 text-primary" />
                              <span className="truncate font-semibold">
                                {key.name || key.host_name}
                              </span>
                            </div>
                            <p className="mt-1 text-xs text-muted-foreground">
                              {key.host_name} · до {key.expire_date_str}
                            </p>
                            <div className="mt-1 flex flex-wrap gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                              <span>{key.days_left} дн.</span>
                              {key.traffic_info && <span>{key.traffic_info}</span>}
                              {key.hwid_info && <span>{key.hwid_info}</span>}
                            </div>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <Badge variant={key.days_left > 0 ? "success" : "warning"}>
                              {key.status_text}
                            </Badge>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                )}
              </StudioBoard>
            </div>

            {config?.referrals?.enabled && (
              <StudioBoard className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="studio-hub__icon flex items-center justify-center">
                    <Users className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">Реферальная программа</p>
                    <p className="text-xs text-muted-foreground">
                      {referralCount} приглашено · {formatMoney(referralEarned)} заработано
                    </p>
                  </div>
                </div>
                {referralLink && (
                  <div className="rounded-xl border border-white/10 bg-black/20 px-3 py-2.5">
                    <p className="truncate font-mono text-[11px] text-muted-foreground">
                      {referralLink}
                    </p>
                  </div>
                )}
                <div className="flex gap-2">
                  <Button
                    variant="tg"
                    className="h-10 flex-1 rounded-xl text-sm"
                    onClick={copyReferral}
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Копировать
                  </Button>
                  <Button
                    variant="outline"
                    className="h-10 flex-1 rounded-xl border-white/15 text-sm"
                    onClick={shareReferral}
                  >
                    <Share2 className="mr-2 h-4 w-4" />
                    Поделиться
                  </Button>
                </div>
              </StudioBoard>
            )}

            <StudioBoard>
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                Об аккаунте
              </p>
              <div className="space-y-2.5">
                {profile?.registration_date && (
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      С нами с
                    </span>
                    <span className="font-medium">{formatDate(profile.registration_date)}</span>
                  </div>
                )}
                {(profile?.total_spent ?? 0) > 0 && (
                  <div className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 text-muted-foreground">
                      <TrendingUp className="h-4 w-4" />
                      Всего потрачено
                    </span>
                    <span className="font-medium">{formatMoney(profile!.total_spent)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between gap-2 text-sm">
                  <span className="text-muted-foreground">Пробный период</span>
                  <span
                    className={cn(
                      "font-medium",
                      status?.trial_available ? "text-success" : "text-muted-foreground",
                    )}
                  >
                    {status?.trial_available
                      ? "Доступен"
                      : status?.trial_used
                        ? "Использован"
                        : "Недоступен"}
                  </span>
                </div>
              </div>
            </StudioBoard>
          </div>
        )}
      </div>
    </>
  );
}
