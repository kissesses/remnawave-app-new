import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bell } from "lucide-react";
import { motion } from "framer-motion";
import { Header } from "@/components/layout/header";
import { PageSkeleton } from "@/components/feedback/page-skeleton";
import { EmptyState } from "@/components/feedback/empty-state";
import { PullRefreshIndicator } from "@/components/feedback/pull-refresh";
import { StudioChip, StudioChipRow } from "@/components/studio/studio-chip";
import { useNotifications, useRefreshCabinet } from "@/hooks/use-cabinet";
import { usePullRefresh } from "@/hooks/use-pull-refresh";
import { useTelegram } from "@/hooks/use-telegram";
import { useUiStore } from "@/stores/ui-store";
import { formatDate, formatMoney, cn } from "@/lib/utils";
import { api, getUserId } from "@/lib/api";
import type { Notification, NotificationCategory } from "@/types/api";
import {
  NOTIFICATION_FILTERS,
  filterNotifications,
  getNotificationMeta,
  groupNotificationsByDay,
} from "@/lib/notifications";

export function NotificationsPage() {
  const navigate = useNavigate();
  const refresh = useRefreshCabinet();
  const { pullProps, pullOffset } = usePullRefresh(refresh);
  const { data, isLoading, refetch } = useNotifications();
  const setUnread = useUiStore((s) => s.setUnreadNotifications);
  const { haptic } = useTelegram();
  const [filter, setFilter] = useState<NotificationCategory | "all">("all");

  useEffect(() => {
    const unread = (data ?? []).filter((n) => !n.read).length;
    setUnread(unread);
  }, [data, setUnread]);

  const filtered = useMemo(
    () => filterNotifications(data ?? [], filter),
    [data, filter],
  );
  const groups = useMemo(() => groupNotificationsByDay(filtered), [filtered]);

  const markRead = async (n: Notification) => {
    if (!n.read) {
      haptic("selection");
      await api.markNotificationsRead(getUserId(), [n.id]);
      await refetch();
    }
    if (n.href) navigate(n.href);
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
      <div className="page-scroll" {...pullProps}>
        <PullRefreshIndicator offset={pullOffset} />
        {isLoading ? (
          <PageSkeleton variant="list" rows={5} />
        ) : !data?.length ? (
          <EmptyState
            icon={Bell}
            title="Нет уведомлений"
            description="Здесь появятся покупки, продления, пополнения, промокоды и напоминания о подписке"
          />
        ) : (
          <div className="space-y-3 p-4">
            <StudioChipRow className="flex-wrap">
              {NOTIFICATION_FILTERS.map((f) => (
                <StudioChip
                  key={f.id}
                  active={filter === f.id}
                  onClick={() => {
                    haptic("selection");
                    setFilter(f.id);
                  }}
                >
                  {f.label}
                </StudioChip>
              ))}
            </StudioChipRow>

            {filtered.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Нет уведомлений в этой категории
              </p>
            ) : (
              groups.map((group) => (
                <div key={group.label} className="space-y-2">
                  <p className="px-1 text-xs font-semibold text-muted-foreground">
                    {group.label}
                  </p>
                  {group.items.map((n, i) => {
                    const meta = getNotificationMeta(n.type);
                    const Icon = meta.icon;
                    return (
                      <motion.button
                        key={n.id}
                        type="button"
                        initial={{ opacity: 0, x: -12 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        onClick={() => markRead(n)}
                        className={cn(
                          "w-full rounded-2xl border p-4 text-left transition-colors active:scale-[0.99]",
                          n.read
                            ? "border-white/10 bg-black/15"
                            : "border-primary/25 bg-primary/8",
                        )}
                      >
                        <div className="flex gap-3">
                          <div
                            className={cn(
                              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl",
                              meta.accentClass,
                            )}
                          >
                            <Icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <span className="font-semibold text-sm">{n.title}</span>
                                {!n.read && (
                                  <span className="h-2 w-2 shrink-0 rounded-full bg-primary" />
                                )}
                              </div>
                              {n.amount != null && n.amount > 0 && (
                                <span
                                  className={cn(
                                    "shrink-0 text-sm font-semibold tabular-nums",
                                    n.severity === "warning"
                                      ? "text-warning"
                                      : "text-success",
                                  )}
                                >
                                  {formatMoney(n.amount)}
                                </span>
                              )}
                            </div>
                            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                              {n.body}
                            </p>
                            <div className="mt-2 flex items-center justify-between gap-2">
                              <p className="text-[11px] text-muted-foreground">
                                {formatDate(n.date)}
                              </p>
                              {(n.cta_label || n.href) && (
                                <span className="text-[11px] font-semibold text-primary">
                                  {n.cta_label || "Открыть"} →
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </>
  );
}
