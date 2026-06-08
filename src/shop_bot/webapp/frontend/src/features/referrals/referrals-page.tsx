import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Copy, Share2, Users, Wallet } from "lucide-react";
import { Header } from "@/components/layout/header";
import { SectionHeader } from "@/components/premium/section-header";
import { PageSkeleton } from "@/components/feedback/page-skeleton";
import { Button } from "@/components/ui/button";
import { useTelegram } from "@/hooks/use-telegram";
import { api, getUserId } from "@/lib/api";
import { formatDate, formatMoney } from "@/lib/utils";

export function ReferralsPage() {
  const userId = getUserId();
  const { haptic, openLink } = useTelegram();

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
