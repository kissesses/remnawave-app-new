import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ShoppingCart,
  RefreshCw,
  Settings2,
  Gift,
  Activity,
} from "lucide-react";
import { Header } from "@/components/layout/header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { PullRefreshIndicator } from "@/components/feedback/pull-refresh";
import { useCabinetBootstrap, useRefreshCabinet } from "@/hooks/use-cabinet";
import { usePullRefresh } from "@/hooks/use-pull-refresh";
import { usePaymentHistory } from "@/hooks/use-cabinet";
import { formatMoney, formatDate } from "@/lib/utils";
import { getBootstrap } from "@/lib/api";
import { PurchaseSheet } from "@/features/shop/purchase-sheet";
import { RenewSheet } from "@/features/shop/renew-sheet";
import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { getUserId } from "@/lib/api";

function SubscriptionRing({ percent }: { percent: number }) {
  const p = Math.min(100, Math.max(0, percent));
  const r = 42;
  const c = 2 * Math.PI * r;
  const offset = c - (p / 100) * c;
  return (
    <div className="relative h-24 w-24 shrink-0">
      <svg className="h-24 w-24 -rotate-90" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r={r} fill="none" stroke="hsl(var(--border))" strokeWidth="8" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke="#3390EC"
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={offset}
          className="transition-all duration-700"
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-bold">{p}%</span>
      </div>
    </div>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const refresh = useRefreshCabinet();
  const { pullProps, pullOffset } = usePullRefresh(refresh);
  const { data, isLoading } = useCabinetBootstrap();
  const { data: history } = usePaymentHistory(5);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  const [renewOpen, setRenewOpen] = useState(false);
  const branding = getBootstrap().branding;

  const status = data?.status;
  const config = data?.config;
  const key = status?.keys?.find((k) => k.days_left > 0) ?? status?.keys?.[0];
  const percent = key ? parseInt(key.percent_str.replace("%", ""), 10) || 0 : 0;

  const recent = [
    ...(history?.payments ?? []),
    ...(history?.balance ?? []),
  ]
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 3);

  const activateTrial = async () => {
    const res = await api.activateTrial(getUserId());
    if (res.ok) {
      toast.success("Пробный период активирован");
      await refresh();
    } else {
      toast.error(res.error ?? "Не удалось активировать");
    }
  };

  return (
    <>
      <Header
        title={branding.welcome_text || "Главная"}
        showNotifications
      />
      <div className="page-scroll pb-24" {...pullProps}>
        <PullRefreshIndicator offset={pullOffset} />
        <div className="space-y-4 p-4">
          {isLoading ? (
            <Skeleton className="h-40 w-full rounded-2xl" />
          ) : (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}>
              <Card className="overflow-hidden">
                <CardHeader className="flex-row items-center gap-4 space-y-0 pb-2">
                  <SubscriptionRing percent={percent} />
                  <div className="min-w-0 flex-1">
                    <CardTitle className="text-base">
                      {key ? key.host_name || key.name : "Нет подписки"}
                    </CardTitle>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {key
                        ? key.days_left > 0
                          ? `Активна · ${key.days_left} дн.`
                          : "Истекла"
                        : "Оформите VPN для доступа"}
                    </p>
                    {key && (
                      <Badge
                        variant={key.days_left > 0 ? "success" : "destructive"}
                        className="mt-2"
                      >
                        {key.status_text}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                {key && key.expire_date_str && (
                  <CardContent className="text-xs text-muted-foreground">
                    До {formatDate(key.expire_date_str)}
                  </CardContent>
                )}
              </Card>
            </motion.div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {[
              { icon: ShoppingCart, label: "Купить", onClick: () => setPurchaseOpen(true) },
              { icon: RefreshCw, label: "Продлить", onClick: () => setRenewOpen(true) },
              {
                icon: Settings2,
                label: "Настроить",
                onClick: () => navigate("/vpn/setup"),
              },
              ...(config?.trial?.available
                ? [{ icon: Gift, label: "Пробный", onClick: activateTrial }]
                : []),
            ].map((action, i) => (
              <motion.div
                key={action.label}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.05 }}
                whileTap={{ scale: 0.97 }}
              >
                <Button
                  variant="secondary"
                  className="h-auto w-full flex-col gap-2 rounded-2xl py-4"
                  onClick={action.onClick}
                >
                  <action.icon className="h-6 w-6 text-primary" />
                  <span className="text-sm font-medium">{action.label}</span>
                </Button>
              </motion.div>
            ))}
          </div>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-primary" />
                Недавняя активность
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {recent.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">Пока нет операций</p>
              ) : (
                recent.map((item) => (
                  <div key={String(item.id)} className="flex items-center justify-between text-sm">
                    <div>
                      <div className="font-medium">{item.label}</div>
                      <div className="text-xs text-muted-foreground">{formatDate(item.date)}</div>
                    </div>
                    <span className={item.success ? "text-emerald-500" : "text-muted-foreground"}>
                      {formatMoney(item.amount)}
                    </span>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </div>
      </div>
      <PurchaseSheet open={purchaseOpen} onOpenChange={setPurchaseOpen} />
      <RenewSheet open={renewOpen} onOpenChange={setRenewOpen} />
    </>
  );
}
