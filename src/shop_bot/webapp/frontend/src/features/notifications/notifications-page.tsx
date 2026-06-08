import { useEffect } from "react";
import { Bell, CreditCard, MessageCircle, Shield, Users } from "lucide-react";
import { motion } from "framer-motion";
import { Header } from "@/components/layout/header";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/feedback/empty-state";
import { PullRefreshIndicator } from "@/components/feedback/pull-refresh";
import { useNotifications, useRefreshCabinet } from "@/hooks/use-cabinet";
import { usePullRefresh } from "@/hooks/use-pull-refresh";
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

  useEffect(() => {
    const unread = (data ?? []).filter((n) => !n.read).length;
    setUnread(unread);
  }, [data, setUnread]);

  useEffect(() => {
    const unreadIds = (data ?? []).filter((n) => !n.read).map((n) => n.id);
    if (unreadIds.length) {
      api.markNotificationsRead(getUserId(), unreadIds).then(() => refetch());
    }
  }, [data, refetch]);

  return (
    <>
      <Header title="Уведомления" showBack />
      <div className="page-scroll pb-8" {...pullProps}>
        <PullRefreshIndicator offset={pullOffset} />
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-20 w-full rounded-2xl" />
            ))}
          </div>
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
                <motion.div
                  key={n.id}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  className={`rounded-2xl border p-4 ${
                    n.read ? "border-border/40 bg-card/50" : "border-primary/30 bg-primary/5"
                  }`}
                >
                  <div className="flex gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <Icon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium">{n.title}</div>
                      <p className="mt-1 text-sm text-muted-foreground">{n.body}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{formatDate(n.date)}</p>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
