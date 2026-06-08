import { useQuery } from "@tanstack/react-query";
import { CreditCard, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useTelegram } from "@/hooks/use-telegram";
import { api, getUserId } from "@/lib/api";
import { formatMoney } from "@/lib/utils";

export function PendingPaymentBanner() {
  const userId = getUserId();
  const { openLink, haptic } = useTelegram();
  const [dismissed, setDismissed] = useState(false);

  const { data } = useQuery({
    queryKey: ["payment", "pending", userId],
    queryFn: () => api.getPendingPayment(userId),
    enabled: userId > 0,
    staleTime: 30_000,
  });

  const pending = data?.pending;
  if (!pending || dismissed) return null;

  const resume = async () => {
    const res = await api.resumePayment(userId, pending.payment_id);
    if (!res.ok || !res.payment_url) {
      toast.error(res.error ?? "Не удалось продолжить оплату");
      return;
    }
    haptic("success");
    if (openLink) openLink(res.payment_url);
    else window.location.href = res.payment_url;
  };

  return (
    <div className="premium-glass relative flex items-start gap-3 p-4 border border-amber-500/30 bg-amber-500/5">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-amber-500/15">
        <CreditCard className="h-4 w-4 text-amber-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Незавершённый платёж</p>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {pending.action_label} · {formatMoney(pending.price)}
          {pending.payment_method ? ` · ${pending.payment_method}` : ""}
        </p>
        <Button size="sm" variant="tg" className="mt-2 rounded-xl h-8" onClick={resume}>
          Продолжить оплату
        </Button>
      </div>
      <button
        type="button"
        className="text-muted-foreground p-1"
        onClick={() => setDismissed(true)}
        aria-label="Скрыть"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
