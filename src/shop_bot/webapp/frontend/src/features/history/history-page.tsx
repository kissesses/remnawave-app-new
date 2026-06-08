import { useMemo, useState, useRef } from "react";
import { Receipt, ArrowDownLeft, ArrowUpRight, Wallet } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { motion } from "framer-motion";
import { Header } from "@/components/layout/header";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PageSkeleton } from "@/components/feedback/page-skeleton";
import { EmptyState } from "@/components/feedback/empty-state";
import { PullRefreshIndicator } from "@/components/feedback/pull-refresh";
import { Badge } from "@/components/ui/badge";
import { usePaymentHistory, useRefreshCabinet } from "@/hooks/use-cabinet";
import { usePullRefresh } from "@/hooks/use-pull-refresh";
import { formatMoney, formatDateGroup, formatTime } from "@/lib/utils";
import type { Transaction } from "@/types/api";

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

function txIcon(item: Transaction) {
  const label = item.label.toLowerCase();
  if (label.includes("пополн") || label.includes("top")) return ArrowDownLeft;
  if (label.includes("баланс")) return Wallet;
  return ArrowUpRight;
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

  const stats = useMemo(() => {
    const payments = data?.payments ?? [];
    const balance = data?.balance ?? [];
    const spent = payments.filter((t) => t.success).reduce((s, t) => s + t.amount, 0);
    const topped = balance
      .filter((t) => t.success && t.label.toLowerCase().includes("пополн"))
      .reduce((s, t) => s + t.amount, 0);
    return { spent, topped, count: items.length };
  }, [data, items.length]);

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
    estimateSize: (i) => (flatRows[i]?.type === "header" ? 36 : 72),
    overscan: 8,
  });

  return (
    <>
      <Header title="История" showBack />
      <div className="px-4 pb-3 space-y-3">
        {!isLoading && items.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="grid grid-cols-3 gap-2"
          >
            {[
              { label: "Операций", value: String(stats.count) },
              { label: "Пополнено", value: formatMoney(stats.topped) },
              { label: "Потрачено", value: formatMoney(stats.spent) },
            ].map((s) => (
              <div key={s.label} className="premium-stat-pill">
                <span className="text-[10px] text-muted-foreground uppercase tracking-wide">
                  {s.label}
                </span>
                <span className="mt-1 text-sm font-bold truncate w-full">{s.value}</span>
              </div>
            ))}
          </motion.div>
        )}

        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList className="premium-glass h-11 p-1 border-0">
            <TabsTrigger value="all" className="rounded-xl text-xs">
              Все
            </TabsTrigger>
            <TabsTrigger value="payments" className="rounded-xl text-xs">
              Покупки
            </TabsTrigger>
            <TabsTrigger value="balance" className="rounded-xl text-xs">
              Баланс
            </TabsTrigger>
          </TabsList>
        </Tabs>
      </div>

      <div className="page-scroll" {...pullProps} ref={parentRef}>
        <PullRefreshIndicator offset={pullOffset} />
        {isLoading ? (
          <PageSkeleton variant="list" rows={6} />
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
                    <div className="py-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {row.date}
                    </div>
                  ) : (
                    <div className="flex items-center gap-3 premium-glass px-4 py-3 mb-2">
                      {(() => {
                        const Icon = txIcon(row.item);
                        return (
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                            <Icon className="h-4 w-4 text-primary" />
                          </div>
                        );
                      })()}
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate">{row.item.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {formatTime(row.item.date)} · {row.item.method}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div
                          className={`font-semibold text-sm ${
                            row.item.success ? "text-foreground" : "text-muted-foreground"
                          }`}
                        >
                          {formatMoney(row.item.amount)}
                        </div>
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
