import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Share2, Users, Wallet, ArrowRightLeft, Banknote } from "lucide-react";
import { Header } from "@/components/layout/header";
import { SectionHeader } from "@/components/premium/section-header";
import { PageSkeleton } from "@/components/feedback/page-skeleton";
import { Button } from "@/components/ui/button";
import { useTelegram } from "@/hooks/use-telegram";
import { api, getUserId } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/utils";

export function ReferralsPage() {
  const userId = getUserId();
  const qc = useQueryClient();
  const { haptic, openLink } = useTelegram();
  const [busy, setBusy] = useState<"transfer" | "withdraw" | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["referrals", "stats", userId],
    queryFn: () => api.getReferralStats(userId),
  });

  const copyLink = () => {
    if (!data?.link) return;
    navigator.clipboard.writeText(data.link);
    haptic("success");
    toast.success("Ссылка скопирована");
  };

  const share = () => {
    if (!data?.link) return;
    const text = `Присоединяйся по моей ссылке: ${data.link}`;
    if (navigator.share) {
      void navigator.share({ title: "Реферальная программа", text, url: data.link });
    } else if (openLink) {
      openLink(`https://t.me/share/url?url=${encodeURIComponent(data.link)}`);
    } else {
      copyLink();
    }
  };

  const transferToBalance = async () => {
    setBusy("transfer");
    try {
      const res = await api.transferReferralBalance(userId);
      if (res.ok) {
        haptic("success");
        toast.success(`Переведено ${formatMoney(res.transferred ?? 0)} на баланс`);
        await qc.invalidateQueries({ queryKey: ["referrals", "stats", userId] });
        await qc.invalidateQueries({ queryKey: ["user", "status"] });
      } else {
        toast.error(res.error ?? "Не удалось перевести");
      }
    } finally {
      setBusy(null);
    }
  };

  const requestWithdraw = async () => {
    setBusy("withdraw");
    try {
      const res = await api.requestReferralWithdraw(userId);
      if (res.ok) {
        haptic("success");
        toast.success(res.message ?? "Заявка отправлена");
      } else {
        toast.error(res.error ?? "Не удалось отправить заявку");
      }
    } finally {
      setBusy(null);
    }
  };

  const showRefBalance = data?.payout_mode === "referral_balance";
  const withdrawable = data?.withdrawable ?? 0;
  const minWithdraw = data?.min_withdraw ?? 100;

  if (isLoading) {
    return (
      <>
        <Header title="Рефералы" showBack />
        <PageSkeleton variant="hero" />
      </>
    );
  }

  return (
    <>
      <Header title="Рефералы" showBack />
      <div className="page-scroll space-y-5 p-4">
        <div className="premium-hero">
          <div className="relative z-10 grid grid-cols-2 gap-3">
            <div className="premium-stat-pill">
              <Users className="h-4 w-4 text-primary mb-1" />
              <span className="text-[10px] text-muted-foreground">Приглашено</span>
              <span className="text-lg font-bold">{data?.count ?? 0}</span>
            </div>
            <div className="premium-stat-pill">
              <Wallet className="h-4 w-4 text-primary mb-1" />
              <span className="text-[10px] text-muted-foreground">Заработано</span>
              <span className="text-lg font-bold">{formatMoney(data?.earned ?? 0)}</span>
            </div>
          </div>
          {showRefBalance ? (
            <div className="relative z-10 mt-3 premium-stat-pill">
              <span className="text-[10px] text-muted-foreground">К выводу</span>
              <span className="text-base font-bold">{formatMoney(withdrawable)}</span>
            </div>
          ) : null}
          {(data?.discount_percent ?? 0) > 0 || (data?.reward_percent ?? 0) > 0 ? (
            <p className="relative z-10 mt-3 text-xs text-muted-foreground">
              {data?.discount_percent ? `Скидка рефералу: −${data.discount_percent}%` : null}
              {data?.discount_percent && data?.reward_percent ? " · " : null}
              {data?.reward_percent ? `Ваш бонус: ${data.reward_percent}%` : null}
            </p>
          ) : null}
        </div>

        <div className="flex gap-2">
          <Button variant="tg" className="flex-1 rounded-2xl" onClick={copyLink}>
            <Copy className="h-4 w-4 mr-2" />
            Копировать
          </Button>
          <Button variant="secondary" className="flex-1 rounded-2xl" onClick={share}>
            <Share2 className="h-4 w-4 mr-2" />
            Поделиться
          </Button>
        </div>

        {showRefBalance && withdrawable > 0 ? (
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              className="rounded-2xl h-11"
              disabled={busy !== null}
              onClick={transferToBalance}
            >
              <ArrowRightLeft className="h-4 w-4 mr-2" />
              На баланс
            </Button>
            <Button
              variant="secondary"
              className="rounded-2xl h-11"
              disabled={busy !== null || withdrawable < minWithdraw}
              onClick={requestWithdraw}
            >
              <Banknote className="h-4 w-4 mr-2" />
              Вывод
            </Button>
          </div>
        ) : null}

        {showRefBalance && withdrawable > 0 && withdrawable < minWithdraw ? (
          <p className="text-xs text-muted-foreground px-1">
            Минимум для вывода — {formatMoney(minWithdraw)}
          </p>
        ) : null}

        <div>
          <SectionHeader title="Приглашённые" />
          {(data?.referrals?.length ?? 0) === 0 ? (
            <p className="text-sm text-muted-foreground px-1">
              Пока никого нет — отправьте ссылку друзьям
            </p>
          ) : (
            <div className="premium-glass divide-y divide-border/40 overflow-hidden rounded-2xl">
              {data?.referrals?.map((ref) => (
                <div key={ref.user_id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <div className="text-sm font-medium">
                      {ref.username ? `@${ref.username}` : `ID ${ref.user_id}`}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(ref.registered_at)}
                    </div>
                  </div>
                  {ref.total_spent > 0 ? (
                    <span className="text-xs font-semibold text-success">
                      {formatMoney(ref.total_spent)}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">новый</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
