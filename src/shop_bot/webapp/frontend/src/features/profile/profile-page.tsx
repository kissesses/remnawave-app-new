import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Settings, Users, Copy, ChevronRight, Shield } from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/header";
import { SectionHeader } from "@/components/premium/section-header";
import { SubscriptionRing } from "@/components/premium/subscription-ring";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { PageSkeleton } from "@/components/feedback/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import { ListCell, ListGroup } from "@/components/layout/list-cell";
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
import { formatMoney } from "@/lib/utils";

export function ProfilePage() {
  const navigate = useNavigate();
  const userId = useUserId();
  const refresh = useRefreshCabinet();
  const { pullProps, pullOffset } = usePullRefresh(refresh);
  const { data: status, isLoading } = useUserStatus();
  const { data: config } = useCabinetConfig();
  const { displayName, user: tgUser, haptic } = useTelegram();

  const avatarUrl = tgUser?.photo_url || api.getAvatarUrl(userId);
  const initials = displayName?.slice(0, 2).toUpperCase() || String(userId).slice(-2);

  const copyReferral = () => {
    const link = status?.referral_link ?? config?.referrals?.link;
    if (link) {
      navigator.clipboard.writeText(link);
      haptic("success");
      toast.success("Ссылка скопирована");
    }
  };

  return (
    <>
      <Header title="Профиль" />
      <div className="page-scroll pb-24" {...pullProps}>
        <PullRefreshIndicator offset={pullOffset} />
        {isLoading && !status ? (
          <PageSkeleton variant="profile" />
        ) : (
        <div className="space-y-5 p-4">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="premium-hero"
          >
            <div className="relative z-10 flex items-center gap-4">
              {isLoading ? (
                <Skeleton className="h-16 w-16 rounded-2xl" />
              ) : (
                <Avatar className="h-16 w-16 rounded-2xl border-2 border-primary/30 shadow-lg">
                  <AvatarImage src={avatarUrl} alt="" />
                  <AvatarFallback className="rounded-2xl text-lg">{initials}</AvatarFallback>
                </Avatar>
              )}
              <div className="min-w-0 flex-1">
                <h2 className="text-lg font-bold truncate">
                  {displayName ?? `ID ${userId}`}
                </h2>
                <p className="text-sm text-muted-foreground mt-0.5">
                  Баланс{" "}
                  <span className="text-foreground font-semibold">
                    {formatMoney(status?.balance ?? 0)}
                  </span>
                </p>
                {config?.referrals?.enabled && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {config.referrals.count} рефералов · {formatMoney(config.referrals.earned)}
                  </p>
                )}
              </div>
            </div>
          </motion.div>

          <div>
            <SectionHeader
              title="Мои подписки"
              action={
                <span className="text-xs text-muted-foreground">
                  {status?.keys?.length ?? 0} шт.
                </span>
              }
            />
            {(status?.keys?.length ?? 0) === 0 ? (
              <div className="premium-glass p-6 text-center text-sm text-muted-foreground">
                Нет активных ключей
              </div>
            ) : (
              <div className="space-y-2">
                {status?.keys?.map((key, i) => {
                  const percent = parseInt(key.percent_str.replace("%", ""), 10) || 0;
                  return (
                    <motion.button
                      key={key.key_id}
                      type="button"
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      whileTap={{ scale: 0.99 }}
                      className="premium-glass flex w-full items-center gap-3 p-4 text-left"
                      onClick={() => {
                        haptic("selection");
                        navigate(`/keys/${key.key_id}`);
                      }}
                    >
                      <SubscriptionRing percent={percent} size={56} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <Shield className="h-3.5 w-3.5 text-primary shrink-0" />
                          <span className="font-semibold truncate">
                            {key.name || key.host_name}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-1">
                          {key.expire_date_str} · {key.days_left} дн.
                        </p>
                        {key.traffic_info && (
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            {key.traffic_info}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col items-end gap-1 shrink-0">
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
          </div>

          {config?.referrals?.enabled && (
            <ListGroup>
              <ListCell
                icon={Users}
                title="Реферальная программа"
                subtitle="Пригласите друзей и получайте бонусы"
                onClick={copyReferral}
                value={<Copy className="h-4 w-4 text-primary" />}
                showChevron={false}
              />
            </ListGroup>
          )}

          <ListGroup>
            <ListCell
              icon={Settings}
              title="Настройки"
              subtitle="Тема, уведомления, язык"
              onClick={() => navigate("/settings")}
            />
          </ListGroup>
        </div>
        )}
      </div>
    </>
  );
}
