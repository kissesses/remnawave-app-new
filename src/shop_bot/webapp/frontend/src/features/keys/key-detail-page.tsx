import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Copy,
  ExternalLink,
  RefreshCw,
  Smartphone,
  Trash2,
  Pencil,
  Shield,
  Calendar,
  Clock,
  Activity,
  Link2,
  Server,
  Snowflake,
} from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/header";
import { SectionHeader } from "@/components/premium/section-header";
import { SubscriptionRing } from "@/components/premium/subscription-ring";
import { DeviceTiersCard } from "@/components/premium/device-tiers-card";
import { StaggerList, StaggerItem } from "@/components/premium/stagger-list";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PageSkeleton } from "@/components/feedback/page-skeleton";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { RenewSheet } from "@/features/shop/renew-sheet";
import { SubscriptionQr } from "@/components/premium/subscription-qr";
import { useUserStatus, useCabinetConfig } from "@/hooks/use-cabinet";
import { useTelegram } from "@/hooks/use-telegram";
import { api, getUserId } from "@/lib/api";
import { buildImportUrl } from "@/lib/vpn-import";
import { formatDate } from "@/lib/utils";
import type { VpnKey } from "@/types/api";

export function KeyDetailPage() {
  const { keyId } = useParams<{ keyId: string }>();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const userId = getUserId();
  const { haptic, openLink } = useTelegram();
  const { data: config } = useCabinetConfig();
  const [renewOpen, setRenewOpen] = useState(false);
  const [editingComment, setEditingComment] = useState(false);
  const [comment, setComment] = useState("");
  const [switchOpen, setSwitchOpen] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [freezing, setFreezing] = useState(false);

  const kid = parseInt(keyId ?? "0", 10);
  const { data: status, isLoading } = useUserStatus();
  const key: VpnKey | undefined = status?.keys?.find((k) => k.key_id === kid);

  const {
    data: liveStats,
    isLoading: liveLoading,
    refetch: refetchLive,
    isFetching: liveFetching,
  } = useQuery({
    queryKey: ["key", "live-stats", kid],
    queryFn: () => api.getKeyLiveStats(userId, kid, key?.host_name),
    enabled: kid > 0 && Boolean(key),
    staleTime: 60_000,
  });

  const { data: switchData } = useQuery({
    queryKey: ["key", "switch-hosts", kid],
    queryFn: () => api.getKeySwitchHosts(userId, kid),
    enabled: switchOpen && kid > 0,
  });

  const { data: devicesData, isLoading: devicesLoading } = useQuery({
    queryKey: ["key", "devices", kid],
    queryFn: () => api.getKeyDevices(userId, kid, key?.host_name),
    enabled: kid > 0 && Boolean(key),
  });

  const trafficInfo = liveStats?.traffic_info ?? key?.traffic_info ?? "—";
  const hwidInfo = liveStats?.hwid_info ?? key?.hwid_info ?? "—";
  const subUrl = liveStats?.sub_url || key?.sub_url;
  const isFrozen = liveStats?.is_frozen ?? false;

  const copySub = () => {
    if (!subUrl) return;
    navigator.clipboard.writeText(subUrl);
    haptic("success");
    toast.success("Ссылка скопирована");
  };

  const openSub = () => {
    if (!subUrl) return;
    if (openLink) openLink(subUrl);
    else window.open(subUrl, "_blank");
  };

  const openInApp = (platform: "android" | "ios") => {
    if (!subUrl) return;
    const scheme =
      platform === "android"
        ? config?.howto?.import_scheme_android
        : config?.howto?.import_scheme_ios;
    const url = buildImportUrl(subUrl, platform, scheme || undefined);
    if (openLink) openLink(url);
    else window.location.href = url;
    haptic("success");
    toast.success("Открываем приложение…");
  };

  const refreshLive = async () => {
    haptic("light");
    await refetchLive();
    await qc.invalidateQueries({ queryKey: ["key", "devices", kid] });
    toast.success("Данные обновлены");
  };

  const saveComment = async () => {
    await api.saveKeyComment(userId, kid, comment);
    haptic("success");
    toast.success("Сохранено");
    setEditingComment(false);
    await qc.invalidateQueries({ queryKey: ["user", "status"] });
  };

  const removeDevice = async (deviceId: string) => {
    const res = await api.deleteKeyDevice(userId, kid, deviceId, key?.host_name);
    if (res.ok) {
      haptic("success");
      toast.success("Устройство удалено");
      await qc.invalidateQueries({ queryKey: ["key", "devices", kid] });
      await refetchLive();
    } else {
      toast.error(res.error ?? "Не удалось удалить");
    }
  };

  const switchHost = async (hostName: string) => {
    setSwitching(true);
    try {
      const res = await api.switchKeyHost(userId, kid, hostName);
      if (res.ok) {
        haptic("success");
        toast.success(`Ключ перенесён на ${hostName}`);
        setSwitchOpen(false);
        await qc.invalidateQueries({ queryKey: ["user", "status"] });
        await refetchLive();
      } else {
        toast.error(res.error ?? "Не удалось перенести");
      }
    } finally {
      setSwitching(false);
    }
  };

  const toggleFreeze = async () => {
    setFreezing(true);
    try {
      const res = await api.setKeyFreeze(userId, kid, !isFrozen);
      if (res.ok) {
        haptic("success");
        toast.success(isFrozen ? "Ключ разморожен" : "Ключ заморожен");
        await refetchLive();
      } else {
        toast.error(res.error ?? "Не удалось изменить статус");
      }
    } finally {
      setFreezing(false);
    }
  };

  const percent = key ? parseInt(key.percent_str.replace("%", ""), 10) || 0 : 0;

  if (isLoading) {
    return (
      <>
        <Header title="Подписка" showBack />
        <PageSkeleton variant="detail" />
      </>
    );
  }

  if (!key) {
    return (
      <>
        <Header title="Подписка" showBack />
        <div className="p-8 text-center text-muted-foreground">Ключ не найден</div>
      </>
    );
  }

  const stats = [
    { icon: Calendar, label: "Создан", value: formatDate(key.created_date_str) },
    { icon: Clock, label: "Осталось", value: key.remaining_str || `${key.days_left} дн.` },
    { icon: Activity, label: "Использовано", value: key.elapsed_str || "—" },
  ];

  return (
    <>
      <Header title={key.name || "Подписка"} showBack />
      <div className="page-scroll">
        <StaggerList className="space-y-4 p-4">
          <StaggerItem>
            <div className="premium-hero">
              <div className="relative z-10 flex items-center gap-4">
                <SubscriptionRing percent={percent} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <Shield className="h-4 w-4 text-primary" />
                    <span className="text-xs font-medium uppercase tracking-wider text-primary/80">
                      VPN Premium
                    </span>
                  </div>
                  <h1 className="mt-1 text-xl font-bold truncate">{key.host_name || key.name}</h1>
                  <p className="mt-1 text-sm text-muted-foreground">
                    {key.days_left > 0 ? `${key.days_left} дн. осталось` : "Истекла"}
                  </p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <Badge
                      variant={key.days_left > 0 ? "success" : "destructive"}
                    >
                      {key.status_text}
                    </Badge>
                    {isFrozen ? (
                      <Badge variant="secondary">Заморожен</Badge>
                    ) : null}
                  </div>
                </div>
                <Button
                  size="icon"
                  variant="ghost"
                  className="shrink-0"
                  onClick={refreshLive}
                  disabled={liveFetching}
                >
                  <RefreshCw className={`h-4 w-4 ${liveFetching ? "animate-spin" : ""}`} />
                </Button>
              </div>
              <div className="relative z-10 mt-4 grid grid-cols-2 gap-2 text-xs">
                <div className="premium-stat-pill">
                  <span className="text-muted-foreground">Истекает</span>
                  <span className="mt-1 font-semibold">{formatDate(key.expire_date_str)}</span>
                </div>
                <div className="premium-stat-pill">
                  <span className="text-muted-foreground">Трафик</span>
                  <span className="mt-1 font-semibold truncate w-full">
                    {liveLoading ? "…" : trafficInfo}
                  </span>
                </div>
              </div>
            </div>
          </StaggerItem>

          <StaggerItem>
            <div className="grid grid-cols-3 gap-2">
              {stats.map((s) => (
                <div key={s.label} className="premium-stat-pill">
                  <s.icon className="h-3.5 w-3.5 text-primary mb-1" />
                  <span className="text-[10px] text-muted-foreground">{s.label}</span>
                  <span className="mt-0.5 text-xs font-semibold text-center leading-tight">
                    {s.value}
                  </span>
                </div>
              ))}
            </div>
          </StaggerItem>

          <StaggerItem>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="tg" className="rounded-2xl" onClick={copySub} disabled={!subUrl}>
                <Copy className="h-4 w-4 mr-2" />
                Копировать
              </Button>
              <Button
                variant="secondary"
                className="rounded-2xl"
                onClick={openSub}
                disabled={!subUrl}
              >
                <ExternalLink className="h-4 w-4 mr-2" />
                Открыть
              </Button>
            </div>
          </StaggerItem>

          {subUrl ? (
            <StaggerItem>
              <div className="premium-glass flex flex-col items-center gap-4 p-5">
                <SectionHeader title="QR подписки" />
                <SubscriptionQr keyId={kid} subUrl={subUrl} size={168} />
                <p className="text-xs text-muted-foreground text-center">
                  Отсканируйте камерой или в VPN-приложении
                </p>
                <div className="grid w-full grid-cols-2 gap-2">
                  <Button
                    variant="outline"
                    className="rounded-2xl"
                    onClick={() => openInApp("android")}
                  >
                    <Link2 className="h-4 w-4 mr-2" />
                    Android
                  </Button>
                  <Button
                    variant="outline"
                    className="rounded-2xl"
                    onClick={() => openInApp("ios")}
                  >
                    <Link2 className="h-4 w-4 mr-2" />
                    iOS
                  </Button>
                </div>
              </div>
            </StaggerItem>
          ) : null}

          <StaggerItem>
            <div className="grid grid-cols-2 gap-2">
              <Button
                variant="outline"
                className="rounded-2xl border-primary/30 h-12"
                onClick={() => setRenewOpen(true)}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Продлить
              </Button>
              <Button
                variant="outline"
                className="rounded-2xl h-12"
                onClick={() => setSwitchOpen(true)}
              >
                <Server className="h-4 w-4 mr-2" />
                Сменить сервер
              </Button>
            </div>
          </StaggerItem>

          <StaggerItem>
            <Button
              variant={isFrozen ? "tg" : "secondary"}
              className="w-full rounded-2xl h-11"
              onClick={toggleFreeze}
              disabled={freezing}
            >
              <Snowflake className="h-4 w-4 mr-2" />
              {isFrozen ? "Разморозить ключ" : "Заморозить ключ"}
            </Button>
          </StaggerItem>

          <StaggerItem>
            <div>
              <SectionHeader title="Комментарий" />
              <div className="premium-glass p-4">
                {editingComment ? (
                  <div className="space-y-2">
                    <input
                      className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/30"
                      value={comment}
                      onChange={(e) => setComment(e.target.value)}
                      placeholder="Заметка к ключу"
                    />
                    <div className="flex gap-2">
                      <Button size="sm" variant="tg" onClick={saveComment}>
                        Сохранить
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditingComment(false)}>
                        Отмена
                      </Button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="flex w-full items-center justify-between text-left active:opacity-70"
                    onClick={() => {
                      setComment(key.comment_key || "");
                      setEditingComment(true);
                    }}
                  >
                    <span className="text-sm">{key.comment_key || "Добавить заметку…"}</span>
                    <Pencil className="h-4 w-4 text-muted-foreground" />
                  </button>
                )}
              </div>
            </div>
          </StaggerItem>

          <StaggerItem>
            <DeviceTiersCard
              hostName={key.host_name}
              keyId={kid}
              currentDevices={(() => {
                const match = hwidInfo.match(/(\d+)/);
                return match ? parseInt(match[1], 10) : 1;
              })()}
            />
          </StaggerItem>

          <StaggerItem>
            <div>
              <SectionHeader
                title="Устройства"
                action={
                  <span className="text-xs text-muted-foreground">
                    {liveLoading ? "…" : hwidInfo}
                  </span>
                }
              />
              <div className="premium-glass divide-y divide-border/40 overflow-hidden">
                {devicesLoading ? (
                  <div className="p-4">
                    <Skeleton className="h-12 w-full" />
                  </div>
                ) : (devicesData?.devices?.length ?? 0) === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground text-center">
                    Нет подключённых устройств
                  </div>
                ) : (
                  devicesData?.devices?.map((d) => (
                    <div key={d.id ?? d.name} className="flex items-center gap-3 px-4 py-3">
                      <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
                        <Smartphone className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">
                          {d.name || d.platform || "Устройство"}
                        </div>
                      </div>
                      {d.id && (
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive h-9 w-9"
                          onClick={() => removeDevice(d.id!)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </StaggerItem>

          <StaggerItem>
            <Button
              variant="secondary"
              className="w-full rounded-2xl"
              onClick={() => navigate("/vpn/setup")}
            >
              Инструкция по настройке
            </Button>
          </StaggerItem>
        </StaggerList>
      </div>

      <Sheet open={switchOpen} onOpenChange={setSwitchOpen}>
        <SheetContent className="max-h-[70vh] overflow-y-auto rounded-t-3xl">
          <SheetHeader>
            <SheetTitle>Смена сервера</SheetTitle>
          </SheetHeader>
          <div className="space-y-2 px-5 pb-8">
            <p className="text-xs text-muted-foreground mb-3">
              Текущий: <strong>{switchData?.current_host || key.host_name}</strong>
            </p>
            {(switchData?.hosts?.length ?? 0) === 0 ? (
              <p className="text-sm text-muted-foreground">Другие серверы недоступны</p>
            ) : (
              switchData?.hosts?.map((h) => (
                <Button
                  key={h.host_name}
                  variant="outline"
                  className="w-full rounded-2xl justify-start h-12"
                  disabled={switching}
                  onClick={() => switchHost(h.host_name)}
                >
                  <Server className="h-4 w-4 mr-2 shrink-0" />
                  <span className="truncate">{h.host_name}</span>
                </Button>
              ))
            )}
          </div>
        </SheetContent>
      </Sheet>

      <RenewSheet
        open={renewOpen}
        onOpenChange={setRenewOpen}
        initialKeyId={kid}
        showPromo={config?.modules?.promo}
      />
    </>
  );
}
