import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Gift, History } from "lucide-react";
import { Header } from "@/components/layout/header";
import { SectionHeader } from "@/components/premium/section-header";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/feedback/page-skeleton";
import { useTelegram } from "@/hooks/use-telegram";
import { api, getUserId } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/utils";

export function PromoPage() {
  const userId = getUserId();
  const { haptic } = useTelegram();
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const { data: history, isLoading } = useQuery({
    queryKey: ["promo", "history", userId],
    queryFn: () => api.getPromoHistory(userId),
  });

  const apply = async () => {
    const trimmed = code.trim();
    if (!trimmed) return;
    setLoading(true);
    const res = await api.applyPromo(userId, trimmed);
    setLoading(false);
    if (res.ok) {
      haptic("success");
      toast.success(res.message ?? "Промокод применён");
      setCode("");
    } else {
      toast.error(res.error ?? "Не удалось применить");
    }
  };

  return (
    <>
      <Header title="Промокод" showBack />
      <div className="page-scroll space-y-5 p-4">
        <div className="premium-hero">
          <div className="relative z-10 flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-primary">
              <Gift className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-lg font-bold">Активация промокода</h1>
              <p className="text-sm text-muted-foreground">
                Баланс, скидка или дни к подписке
              </p>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <input
            className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30 uppercase"
            placeholder="Введите код"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void apply()}
          />
          <Button
            variant="tg"
            className="w-full rounded-2xl h-12"
            disabled={!code.trim() || loading}
            onClick={() => void apply()}
          >
            {loading ? "Проверка…" : "Применить"}
          </Button>
        </div>

        <div>
          <SectionHeader title="История" action={<History className="h-4 w-4 text-muted-foreground" />} />
          {isLoading ? (
            <PageSkeleton variant="list" />
          ) : (history?.items?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground px-1">Пока нет применений</p>
          ) : (
            <div className="premium-glass divide-y divide-border/40 overflow-hidden rounded-2xl">
              {history?.items?.map((item) => (
                <div key={item.id} className="px-4 py-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">{item.title}</span>
                    {item.amount != null ? (
                      <span className="text-sm font-semibold text-success">
                        {formatMoney(item.amount)}
                      </span>
                    ) : null}
                  </div>
                  {item.body ? (
                    <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{item.body}</p>
                  ) : null}
                  <p className="mt-1 text-[10px] text-muted-foreground">{formatDate(item.date)}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
