import { useNavigate } from "react-router-dom";
import { Settings, Users, Key, Copy } from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ListCell, ListGroup } from "@/components/layout/list-cell";
import { PullRefreshIndicator } from "@/components/feedback/pull-refresh";
import {
  useUserStatus,
  useCabinetConfig,
  useRefreshCabinet,
  useUserId,
} from "@/hooks/use-cabinet";
import { usePullRefresh } from "@/hooks/use-pull-refresh";
import { api } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import { motion } from "framer-motion";

export function ProfilePage() {
  const navigate = useNavigate();
  const userId = useUserId();
  const refresh = useRefreshCabinet();
  const { pullProps, pullOffset } = usePullRefresh(refresh);
  const { data: status, isLoading } = useUserStatus();
  const { data: config } = useCabinetConfig();

  const copyReferral = () => {
    const link = status?.referral_link ?? config?.referrals?.link;
    if (link) {
      navigator.clipboard.writeText(link);
      toast.success("Ссылка скопирована");
    }
  };

  return (
    <>
      <Header title="Профиль" />
      <div className="page-scroll pb-24" {...pullProps}>
        <PullRefreshIndicator offset={pullOffset} />
        <div className="space-y-4 p-4">
          <Card>
            <CardContent className="flex items-center gap-4 pt-6">
              {isLoading ? (
                <Skeleton className="h-14 w-14 rounded-full" />
              ) : (
                <Avatar className="h-16 w-16">
                  <AvatarImage src={api.getAvatarUrl(userId)} alt="Avatar" />
                  <AvatarFallback>{String(userId).slice(-2)}</AvatarFallback>
                </Avatar>
              )}
              <div>
                <div className="text-lg font-semibold">ID {userId}</div>
                <div className="text-sm text-muted-foreground">
                  Баланс {formatMoney(status?.balance ?? 0)}
                </div>
              </div>
            </CardContent>
          </Card>

          <div>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Ключи VPN
            </h2>
            {isLoading ? (
              <Skeleton className="h-24 w-full rounded-2xl" />
            ) : (status?.keys?.length ?? 0) === 0 ? (
              <Card className="p-4 text-sm text-muted-foreground text-center">
                Нет активных ключей
              </Card>
            ) : (
              <div className="space-y-2">
                {status?.keys?.map((key) => (
                  <motion.div key={key.key_id} whileTap={{ scale: 0.99 }}>
                    <Card className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{key.name || key.host_name}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            {key.expire_date_str} · {key.days_left} дн.
                          </div>
                          {key.traffic_info && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {key.traffic_info}
                            </div>
                          )}
                        </div>
                        <Badge variant={key.days_left > 0 ? "success" : "warning"}>
                          {key.status_text}
                        </Badge>
                      </div>
                    </Card>
                  </motion.div>
                ))}
              </div>
            )}
          </div>

          {config?.referrals?.enabled && (
            <ListGroup>
              <ListCell
                icon={Users}
                title="Реферальная программа"
                subtitle={`${config.referrals.count} приглашений · ${formatMoney(config.referrals.earned)}`}
                onClick={copyReferral}
                value={<Copy className="h-4 w-4" />}
                showChevron={false}
              />
            </ListGroup>
          )}

          <ListGroup>
            <ListCell
              icon={Key}
              title="Мои ключи"
              subtitle={`${status?.keys?.length ?? 0} шт.`}
              showChevron={false}
            />
            <div className="tg-cell-divider" />
            <ListCell
              icon={Settings}
              title="Настройки"
              onClick={() => navigate("/settings")}
            />
          </ListGroup>
        </div>
      </div>
    </>
  );
}
