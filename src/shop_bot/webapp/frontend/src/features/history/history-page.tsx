import { useMemo, useState } from "react";
import { Receipt } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useRef } from "react";
import { Header } from "@/components/layout/header";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/feedback/empty-state";
import { PullRefreshIndicator } from "@/components/feedback/pull-refresh";
import { usePaymentHistory, useRefreshCabinet } from "@/hooks/use-cabinet";
import { usePullRefresh } from "@/hooks/use-pull-refresh";
import { formatMoney, formatDateGroup, formatTime } from "@/lib/utils";
import type { Transaction } from "@/types/api";
import { Badge } from "@/components/ui/badge";

type Filter = "all" | "payments" | "balance";

function groupTransactions(items: Transaction[]) {
  const groups: { date: string; items: Transaction[] }[] = [];
  let current = "";
  for (const item of items) {
    const g = formatDateGroup(item.date);
    if (g !== current) {
      current = g;
      groups.push({ date: g, items: [] });
    }
    groups[groups.length - 1].items.push(item);
  }
  return groups;
}

export function HistoryPage() {
  const [filter, setFilter] = useState<Filter>("all");
  const refresh = useRefreshCabinet();
  const { pullProps, pullOffset } = usePullRefresh(refresh);
  const { data, isLoading } = usePaymentHistory(100);
  const parentRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    if (!data) return [];
    if (filter === "payments") return data.payments ?? [];
    if (filter === "balance") return data.balance ?? [];
    return [...(data.payments ?? []), ...(data.balance ?? [])].sort((a, b) =>
      a.date < b.date ? 1 : -1,
    );
  }, [data, filter]);

  const flatRows = useMemo(() => {
    const groups = groupTransactions(items);
    const rows: ({ type: "header"; date: string } | { type: "item"; item: Transaction })[] = [];
    for (const g of groups) {
      rows.push({ type: "header", date: g.date });
      for (const item of g.items) {
        rows.push({ type: "item", item });
      }
    }
    return rows;
  }, [items]);

  const virtualizer = useVirtualizer({
    count: flatRows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: (i) => (flatRows[i]?.type === "header" ? 36 : 64),
    overscan: 8,
  });

  return (
    <>
      <Header title="История" showBack />
      <div className="px-4 pb-2">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList>
            <TabsTrigger value="all">Все</TabsTrigger>
            <TabsTrigger value="payments">Покупки</TabsTrigger>
            <TabsTrigger value="balance">Баланс</TabsTrigger>
          </TabsList>
        </Tabs>
      </div>
      <div className="page-scroll pb-8" {...pullProps} ref={parentRef}>
        <PullRefreshIndicator offset={pullOffset} />
        {isLoading ? (
          <div className="space-y-2 p-4">
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title="Операций пока нет"
            description="Здесь появятся платежи и пополнения баланса"
          />
        ) : (
          <div
            style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}
            className="px-4"
          >
            {virtualizer.getVirtualItems().map((vRow) => {
              const row = flatRows[vRow.index];
              return (
                <div
                  key={vRow.key}
                  style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: "100%",
                    height: `${vRow.size}px`,
                    transform: `translateY(${vRow.start}px)`,
                  }}
                >
                  {row.type === "header" ? (
                    <div className="py-2 text-xs font-semibold uppercase text-muted-foreground">
                      {row.date}
                    </div>
                  ) : (
                    <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card px-4 py-3 mb-2">
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{row.item.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatTime(row.item.date)} · {row.item.method}
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-2">
                        <div className="font-semibold text-sm">{formatMoney(row.item.amount)}</div>
                        <Badge
                          variant={row.item.success ? "success" : "secondary"}
                          className="mt-0.5 text-[10px]"
                        >
                          {row.item.success ? "Успешно" : row.item.status}
                        </Badge>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
}
