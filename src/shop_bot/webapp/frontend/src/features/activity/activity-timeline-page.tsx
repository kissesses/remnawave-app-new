import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Activity,
  ChevronRight,
  Headphones,
  Loader2,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { PageSkeleton } from "@/components/feedback/page-skeleton";
import { EmptyState } from "@/components/feedback/empty-state";
import { PullRefreshIndicator } from "@/components/feedback/pull-refresh";
import { StudioChip, StudioChipRow } from "@/components/studio/studio-chip";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { usePullRefresh } from "@/hooks/use-pull-refresh";
import { useTelegram } from "@/hooks/use-telegram";
import { api, getUserId } from "@/lib/api";
import { formatMoney, cn } from "@/lib/utils";
import {
  ACTIVITY_FILTERS,
  formatActivityAmount,
  formatActivityDay,
  formatActivityTime,
  getActivityAccent,
  getActivityIcon,
  getEventDescription,
  getEventSubtitle,
  getEventTitle,
} from "@/lib/activity-timeline";
import type {
  ActivityTimelineCategory,
  ActivityTimelineDay,
  ActivityTimelineEvent,
  ActivityTimelineResponse,
} from "@/types/api";

const PAGE_SIZE = 40;

function mergeDays(existing: ActivityTimelineDay[], incoming: ActivityTimelineDay[]) {
  const map = new Map<string, ActivityTimelineEvent[]>();
  for (const group of existing) {
    map.set(group.day, [...(map.get(group.day) ?? []), ...group.events]);
  }
  for (const group of incoming) {
    const prev = map.get(group.day) ?? [];
    const ids = new Set(prev.map((e) => e.id));
    map.set(group.day, [...prev, ...group.events.filter((e) => !ids.has(e.id))]);
  }
  return [...map.entries()].map(([day, events]) => ({ day, events }));
}

export function ActivityTimelinePage() {
  const navigate = useNavigate();
  const userId = getUserId();
  const { haptic } = useTelegram();
  const [filter, setFilter] = useState<ActivityTimelineCategory>("all");
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [data, setData] = useState<ActivityTimelineResponse | null>(null);
  const [days, setDays] = useState<ActivityTimelineDay[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const offsetRef = useRef(0);

  const fetchTimeline = useCallback(
    async (
      append: boolean,
      category: ActivityTimelineCategory,
      q: string,
      from: string,
      to: string,
    ) => {
      const requestOffset = append ? offsetRef.current : 0;
      if (append) setLoadingMore(true);
      else setLoading(true);

      try {
        const res = await api.getActivityTimeline(userId, {
          category,
          q,
          limit: PAGE_SIZE,
          offset: requestOffset,
          date_from: from,
          date_to: to,
        });
        if (!res.ok) {
          if (!append) setData(res);
          return;
        }
        setData(res);
        setDays((prev) => (append ? mergeDays(prev, res.days ?? []) : res.days ?? []));
        offsetRef.current = append
          ? requestOffset + (res.events?.length ?? 0)
          : (res.events?.length ?? 0);
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [userId],
  );

  const refresh = useCallback(async () => {
    await fetchTimeline(false, filter, search, dateFrom, dateTo);
  }, [fetchTimeline, filter, search, dateFrom, dateTo]);

  const { pullProps, pullOffset } = usePullRefresh(refresh);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    offsetRef.current = 0;
    fetchTimeline(false, filter, search, dateFrom, dateTo);
  }, [filter, search, dateFrom, dateTo, userId, fetchTimeline]);

  const stats = data?.stats;
  const categoryCounts = data?.category_counts ?? {};
  const totalShown = useMemo(
    () => days.reduce((n, d) => n + d.events.length, 0),
    [days],
  );

  const openEvent = (event: ActivityTimelineEvent) => {
    if (!event.href) return;
    haptic("selection");
    navigate(event.href);
  };

  return (
    <>
      <Header title="Лента активности" showBack />
      <div className="page-scroll" {...pullProps}>
        <PullRefreshIndicator offset={pullOffset} />
        {loading && !data ? (
          <PageSkeleton variant="list" rows={6} />
        ) : (
          <div className="space-y-4 p-4 pb-8">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="activity-hero surface-elevated overflow-hidden rounded-xl"
            >
              <div className="activity-hero__glow" />
              <div className="relative p-4">
                <div className="flex items-center gap-3">
                  <div className="activity-hero__icon">
                    <Activity className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <h2 className="text-base font-bold">Ваша история</h2>
                    <p className="text-xs text-muted-foreground">
                      Платежи, ключи, поддержка и другие события
                    </p>
                  </div>
                  <Sparkles className="h-5 w-5 shrink-0 text-primary/70" />
                </div>
                {stats && (
                  <div className="mt-4 grid grid-cols-3 gap-2">
                    <div className="activity-stat-pill">
                      <p className="activity-stat-pill__value">{stats.total_events}</p>
                      <p className="activity-stat-pill__label">Событий</p>
                    </div>
                    <div className="activity-stat-pill">
                      <p className="activity-stat-pill__value">{stats.payments_count}</p>
                      <p className="activity-stat-pill__label">Платежей</p>
                    </div>
                    <div className="activity-stat-pill">
                      <p className="activity-stat-pill__value">
                        {formatMoney(stats.payments_sum || stats.total_spent)}
                      </p>
                      <p className="activity-stat-pill__label">Сумма</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                className="h-10 w-full rounded-xl border border-white/10 bg-black/20 pl-9 pr-9 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Поиск по событиям..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
              {query && (
                <button
                  type="button"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg p-1 text-muted-foreground"
                  onClick={() => setQuery("")}
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <input
                type="date"
                className="h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-xs outline-none"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                aria-label="Дата с"
              />
              <input
                type="date"
                className="h-10 rounded-xl border border-white/10 bg-black/20 px-3 text-xs outline-none"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                aria-label="Дата по"
              />
            </div>

            <StudioChipRow className="flex-wrap">
              {ACTIVITY_FILTERS.map((f) => {
                const count = categoryCounts[f.id];
                return (
                  <StudioChip
                    key={f.id}
                    active={filter === f.id}
                    onClick={() => {
                      haptic("selection");
                      setFilter(f.id);
                    }}
                  >
                    {f.label}
                    {typeof count === "number" && count > 0 && f.id !== "all" && (
                      <span className="ml-1 opacity-70">· {count}</span>
                    )}
                  </StudioChip>
                );
              })}
            </StudioChipRow>

            {days.length === 0 ? (
              <EmptyState
                icon={Activity}
                title="Пока нет событий"
                description={
                  search
                    ? "Ничего не найдено — попробуйте другой запрос"
                    : "Здесь появятся покупки, продления, обращения в поддержку и другие действия"
                }
              />
            ) : (
              <div className="activity-timeline">
                {days.map((group, gi) => (
                  <section key={`${group.day}-${gi}`} className="activity-timeline__day">
                    <div className="activity-timeline__day-label">
                      {formatActivityDay(group.day)}
                    </div>
                    <div className="activity-timeline__events">
                      {group.events.map((event, ei) => {
                        const Icon = getActivityIcon(event.kind);
                        const accent = getActivityAccent(event.accent);
                        const amount = formatActivityAmount(event);
                        const title = getEventTitle(event);
                        const subtitle = getEventSubtitle(event);
                        const description = getEventDescription(event);
                        const clickable = Boolean(event.href);
                        const CardTag = clickable ? motion.button : motion.div;
                        return (
                          <CardTag
                            key={event.id}
                            type={clickable ? "button" : undefined}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: Math.min(ei * 0.03, 0.2) }}
                            className={cn(
                              "activity-timeline__card w-full text-left",
                              clickable && "cursor-pointer active:scale-[0.99]",
                            )}
                            onClick={clickable ? () => openEvent(event) : undefined}
                          >
                            <div className="activity-timeline__rail">
                              <span
                                className={cn(
                                  "activity-timeline__dot",
                                  accent.dot,
                                  accent.glow,
                                )}
                              />
                            </div>
                            <div className="activity-timeline__body surface-glass rounded-2xl p-3.5">
                              <div className="flex items-start gap-3">
                                <div
                                  className={cn(
                                    "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-black/25",
                                    accent.icon,
                                  )}
                                >
                                  <Icon className="h-4 w-4" />
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-start justify-between gap-2">
                                    <p className="font-semibold leading-snug">{title}</p>
                                    {amount && (
                                      <span
                                        className={cn(
                                          "shrink-0 text-xs font-bold tabular-nums",
                                          event.amount_signed && Number(event.amount) > 0
                                            ? "text-success"
                                            : event.amount_signed && Number(event.amount) < 0
                                              ? "text-destructive"
                                              : "text-foreground",
                                        )}
                                      >
                                        {amount}
                                      </span>
                                    )}
                                  </div>
                                  {subtitle && (
                                    <p className="mt-0.5 text-xs text-muted-foreground">
                                      {subtitle}
                                    </p>
                                  )}
                                  {description && (
                                    <p className="activity-timeline__desc">{description}</p>
                                  )}
                                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                    {event.status_label && (
                                      <Badge
                                        variant={
                                          event.status_label === "Закрыт"
                                            ? "secondary"
                                            : event.status_label === "Открыт"
                                              ? "success"
                                              : "secondary"
                                        }
                                        className="text-[10px]"
                                      >
                                        {event.status_label}
                                      </Badge>
                                    )}
                                    {event.badges.slice(0, 2).map((badge) => (
                                      <Badge
                                        key={badge}
                                        variant="outline"
                                        className="border-white/10 text-[10px]"
                                      >
                                        {badge}
                                      </Badge>
                                    ))}
                                    {event.ts && (
                                      <span className="ml-auto text-[10px] tabular-nums text-muted-foreground">
                                        {formatActivityTime(event.ts)}
                                      </span>
                                    )}
                                  </div>
                                </div>
                                {clickable && (
                                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
                                )}
                              </div>
                            </div>
                          </CardTag>
                        );
                      })}
                    </div>
                  </section>
                ))}
              </div>
            )}

            {data?.has_more && (
              <div className="flex justify-center pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 rounded-xl border-white/15 px-4 text-xs"
                  disabled={loadingMore}
                  onClick={() => {
                    haptic("selection");
                    fetchTimeline(true, filter, search, dateFrom, dateTo);
                  }}
                >
                  {loadingMore ? (
                    <>
                      <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
                      Загрузка...
                    </>
                  ) : (
                    <>Показать ещё · {totalShown} из {data.total}</>
                  )}
                </Button>
              </div>
            )}

            {stats && stats.support_tickets > 0 && filter !== "support" && (
              <button
                type="button"
                className="ml-8 studio-board flex w-[calc(100%-2rem)] items-center gap-3 p-3 text-left active:opacity-80"
                onClick={() => navigate("/app/support")}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15">
                  <Headphones className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Открыть поддержку</p>
                  <p className="text-xs text-muted-foreground">
                    {stats.support_tickets} обращений в истории
                  </p>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </button>
            )}
          </div>
        )}
      </div>
    </>
  );
}
