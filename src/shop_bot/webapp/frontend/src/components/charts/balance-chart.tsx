import { lazy, Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Transaction } from "@/types/api";

const AreaChartLazy = lazy(() =>
  import("recharts").then((m) => ({
    default: function BalanceAreaChart({
      data,
    }: {
      data: { date: string; amount: number }[];
    }) {
      const { ResponsiveContainer, AreaChart, Area, XAxis, Tooltip } = m;
      return (
        <ResponsiveContainer width="100%" height={160}>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="balanceGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3390EC" stopOpacity={0.35} />
                <stop offset="100%" stopColor="#3390EC" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            />
            <Tooltip
              contentStyle={{
                borderRadius: 12,
                border: "1px solid hsl(var(--border))",
                background: "hsl(var(--card))",
              }}
            />
            <Area
              type="monotone"
              dataKey="amount"
              stroke="#3390EC"
              strokeWidth={2}
              fill="url(#balanceGrad)"
            />
          </AreaChart>
        </ResponsiveContainer>
      );
    },
  })),
);

export function buildChartData(transactions: Transaction[]) {
  const map = new Map<string, number>();
  const now = new Date();
  for (let i = 29; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    const key = d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
    map.set(key, 0);
  }
  for (const t of transactions) {
    if (!t.success) continue;
    try {
      const d = new Date(t.date.replace(" ", "T"));
      const key = d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
      if (map.has(key)) {
        map.set(key, (map.get(key) ?? 0) + Math.abs(t.amount));
      }
    } catch {
      /* ignore */
    }
  }
  return Array.from(map.entries()).map(([date, amount]) => ({ date, amount }));
}

export function BalanceChart({ transactions }: { transactions: Transaction[] }) {
  const data = buildChartData(transactions);
  return (
    <Suspense fallback={<Skeleton className="h-40 w-full" />}>
      <AreaChartLazy data={data} />
    </Suspense>
  );
}
