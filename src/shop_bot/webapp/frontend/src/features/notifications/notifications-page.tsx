import { useEffect } from "react";
import { Bell, CreditCard, MessageCircle, Shield, Users } from "lucide-react";
import { motion } from "framer-motion";
import { Header } from "@/components/layout/header";
import { PageSkeleton } from "@/components/feedback/page-skeleton";
import { EmptyState } from "@/components/feedback/empty-state";
import { PullRefreshIndicator } from "@/components/feedback/pull-refresh";
import { useNotifications, useRefreshCabinet } from "@/hooks/use-cabinet";
import { usePullRefresh } from "@/hooks/use-pull-refresh";
import { useTelegram } from "@/hooks/use-telegram";
import { useUiStore } from "@/stores/ui-store";
import { formatDate } from "@/lib/utils";
import { api, getUserId } from "@/lib/api";
import type { Notification } from "@/types/api";
import { LucideIcon } from "lucide-react";

const iconMap: Record<Notification["type"], LucideIcon> = {
  subscription: Shield,
  payment: CreditCard,
  support: MessageCircle,
  referral: Users,
  system: Bell,
};

export function NotificationsPage() {
  const refresh = useRefreshCabinet();
  const { pullProps, pullOffset } = usePullRefresh(refresh);
  const { data, isLoading, refetch } = useNotifications();
  const setUnread = useUiStore((s) => s.setUnreadNotifications);
  const { haptic } = useTelegram();

  useEffect(() => {
    const unread = (data ?? []).filter((n) => !n.read).length;
    setUnread(unread);
  }, [data, setUnread]);

  const markRead = async (n: Notification) => {
    if (n.read) return;
    haptic("selection");
    await api.markNotificationsRead(getUserId(), [n.id]);
    await refetch();
  };

  const markAllRead = async () => {
    const unreadIds = (data ?? []).filter((n) => !n.read).map((n) => n.id);
    if (!unreadIds.length) return;
    haptic("success");
    await api.markNotificationsRead(getUserId(), unreadIds);
    await refetch();
  };

  const unreadCount = (data ?? []).filter((n) => !n.read).length;

  return (
    <>
      <Header
        title="Уведомления"
        showBack
        action={
          unreadCount > 0 ? (
            <button
              type="button"
              className="text-xs font-medium text-primary"
              onClick={markAllRead}
            >
              Прочитать все
            </button>
          ) : undefined
        }
      />
      <div className="page-scroll pb-8" {...pullProps}>
        <PullRefreshIndicator offset={pullOffset} />
        {isLoading ? (
          <PageSkeleton variant="list" rows={5} />
        ) : !data?.length ? (
          <EmptyState
            icon={Bell}
            title="Нет уведомлений"
            description="Здесь появятся важные события по подписке и платежам"
          />
        ) : (
          <div className="space-y-2 p-4">
            {data.map((n, i) => {
              const Icon = iconMap[n.type] ?? Bell;
              return (
                <motion.button
                  key={n.id}
                  type="button"
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  onClick={() => markRead(n)}
                  className={`w-full rounded-2xl border p-4 text-left transition-colors active:scale-[0.99] ${
                    n.read
                      ? "border-border/40 bg-card/50"
                      : "border-primary/30 bg-primary/5 shadow-[0_0_20px_hsl(var(--primary)/0.08)]"
                  }`}
                >
                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{n.title}</span>
                        {!n.read && (
                          <span className="h-2 w-2 rounded-full bg-primary shrink-0" />
                        )}
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{formatDate(n.date)}</p>
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
