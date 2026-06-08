import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Palette,
  Bell,
  LogOut,
  Vibrate,
  Activity,
  Wrench,
  Headphones,
  Copy,
  CheckCheck,
  Sun,
  Moon,
  Monitor,
  Megaphone,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/header";
import { SectionHeader } from "@/components/premium/section-header";
import { Switch } from "@/components/ui/switch";
import { ListCell, ListGroup } from "@/components/layout/list-cell";
import { StudioChip, StudioChipRow } from "@/components/studio/studio-chip";
import { PageSkeleton } from "@/components/feedback/page-skeleton";
import { useThemeStore } from "@/stores/theme-store";
import { api, getUserId, removeAuthToken, getBootstrap } from "@/lib/api";
import type { UserPreferences } from "@/types/api";
import { useTelegram } from "@/hooks/use-telegram";
import { useCabinetConfig } from "@/hooks/use-cabinet";
import { useNotifications } from "@/hooks/use-cabinet";
import {
  DEFAULT_PREFERENCES,
  usePreferences,
  useSavePreferences,
} from "@/hooks/use-preferences";
import { StudioCard } from "@/components/studio/studio-board";

const THEME_OPTIONS = [
  { id: "system" as const, label: "Авто", icon: Monitor },
  { id: "dark" as const, label: "Тёмная", icon: Moon },
  { id: "light" as const, label: "Светлая", icon: Sun },
];

type NotifyPrefKey =
  | "notify_payments"
  | "notify_subscription"
  | "notify_support"
  | "notify_referral"
  | "notify_promo"
  | "notify_toast";

const NOTIFICATION_OPTIONS: {
  key: NotifyPrefKey;
  label: string;
  description: string;
  icon: typeof Bell;
}[] = [
  {
    key: "notify_payments",
    label: "Платежи",
    description: "Покупки, пополнения, промокоды",
    icon: Bell,
  },
  {
    key: "notify_subscription",
    label: "Подписка",
    description: "Срок ключей, трафик, устройства",
    icon: Bell,
  },
  {
    key: "notify_support",
    label: "Поддержка",
    description: "Ответы по вашим обращениям",
    icon: Headphones,
  },
  {
    key: "notify_referral",
    label: "Рефералы",
    description: "Новые приглашения и бонусы",
    icon: Sparkles,
  },
  {
    key: "notify_promo",
    label: "Акции",
    description: "Спецпредложения от сервиса",
    icon: Megaphone,
  },
  {
    key: "notify_toast",
    label: "Всплывающие при входе",
    description: "Краткое уведомление при открытии кабинета",
    icon: Bell,
  },
];

function PrefRow({
  label,
  description,
  icon: Icon,
  checked,
  onChange,
  divider,
}: {
  label: string;
  description?: string;
  icon: typeof Bell;
  checked: boolean;
  onChange: (v: boolean) => void;
  divider?: boolean;
}) {
  return (
    <div className="relative">
      {divider && <div className="tg-cell-divider" />}
      <div className="tg-cell justify-between gap-3 py-3.5">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <div className="studio-icon-slot mt-0.5">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0">
            <span className="text-sm font-medium">{label}</span>
            {description && (
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                {description}
              </p>
            )}
          </div>
        </div>
        <Switch checked={checked} onCheckedChange={onChange} />
      </div>
    </div>
  );
}

export function SettingsPage() {
  const navigate = useNavigate();
  const { setMode } = useThemeStore();
  const { haptic, displayName, user: tgUser } = useTelegram();
  const branding = getBootstrap().branding;
  const userId = getUserId();
  const { data: prefsData, isLoading } = usePreferences();
  const savePreferences = useSavePreferences();
  const { data: config } = useCabinetConfig();
  const { data: notifications, refetch: refetchNotifications } = useNotifications();

  const prefs = prefsData ?? DEFAULT_PREFERENCES;
  const unreadCount = useMemo(
    () => (notifications ?? []).filter((n) => !n.read).length,
    [notifications],
  );

  const savePref = async (patch: Partial<UserPreferences>) => {
    haptic("selection");
    if (patch.theme) setMode(patch.theme);
    const res = await savePreferences(patch);
    if (!res.ok) toast.error("Не удалось сохранить настройки");
  };

  const copyUserId = async () => {
    await navigator.clipboard.writeText(String(userId));
    haptic("success");
    toast.success("ID скопирован");
  };

  const markAllRead = async () => {
    const unreadIds = (notifications ?? []).filter((n) => !n.read).map((n) => n.id);
    if (!unreadIds.length) {
      toast.message("Нет непрочитанных уведомлений");
      return;
    }
    haptic("success");
    await api.markNotificationsRead(userId, unreadIds);
    await refetchNotifications();
    toast.success("Все уведомления прочитаны");
  };

  const logout = () => {
    removeAuthToken();
    toast.success("Вы вышли из аккаунта");
    window.location.href = "/";
  };

  const supportBot = config?.support_info?.bot_username?.replace(/^@/, "");

  return (
    <>
      <Header title="Настройки" showBack />
      <div className="page-scroll">
        {isLoading ? (
          <PageSkeleton variant="list" rows={8} />
        ) : (
          <div className="space-y-6 p-4 pb-8">
            <div>
              <SectionHeader title="Интерфейс" />
              <StudioCard className="space-y-4">
                <div className="flex items-center gap-3">
                  <div className="studio-hub__icon h-10 w-10">
                    <Palette className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold text-foreground">Light Blue</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      Прозрачные виджеты на синем градиенте
                    </p>
                  </div>
                </div>
                <div>
                  <p className="mb-2 text-xs font-semibold text-muted-foreground">
                    Тема оформления
                  </p>
                  <StudioChipRow>
                    {THEME_OPTIONS.map(({ id, label, icon: Icon }) => (
                      <StudioChip
                        key={id}
                        active={prefs.theme === id}
                        onClick={() => savePref({ theme: id })}
                      >
                        <Icon className="mr-1 inline h-3.5 w-3.5" />
                        {label}
                      </StudioChip>
                    ))}
                  </StudioChipRow>
                </div>
              </StudioCard>
              <ListGroup className="premium-glass mt-3 border-border/40">
                <PrefRow
                  label="Вибрация"
                  description="Тактильный отклик при нажатиях в Telegram"
                  icon={Vibrate}
                  checked={prefs.haptic_enabled}
                  onChange={(v) => savePref({ haptic_enabled: v })}
                />
              </ListGroup>
            </div>

            <div>
              <SectionHeader title="Уведомления" />
              <ListGroup className="premium-glass border-border/40">
                {NOTIFICATION_OPTIONS.map((item, i) => (
                  <PrefRow
                    key={item.key}
                    label={item.label}
                    description={item.description}
                    icon={item.icon}
                    checked={Boolean(prefs[item.key])}
                    onChange={(v) => savePref({ [item.key]: v })}
                    divider={i > 0}
                  />
                ))}
              </ListGroup>
            </div>

            <div>
              <SectionHeader title="Разделы" />
              <ListGroup className="premium-glass border-border/40">
                <ListCell
                  icon={Activity}
                  title="Лента активности"
                  subtitle="Вся история событий"
                  onClick={() => navigate("/activity")}
                />
                <div className="tg-cell-divider" />
                <ListCell
                  icon={Bell}
                  title="Уведомления"
                  subtitle={unreadCount > 0 ? `${unreadCount} непрочитанных` : "Центр уведомлений"}
                  onClick={() => navigate("/notifications")}
                />
                {config?.modules?.howto !== false && (
                  <>
                    <div className="tg-cell-divider" />
                    <ListCell
                      icon={Wrench}
                      title="Настройка VPN"
                      subtitle="Инструкции для устройств"
                      onClick={() => navigate("/vpn/setup")}
                    />
                  </>
                )}
                {config?.modules?.support && (
                  <>
                    <div className="tg-cell-divider" />
                    <ListCell
                      icon={Headphones}
                      title="Поддержка"
                      subtitle={supportBot ? `@${supportBot}` : "Обращения и FAQ"}
                      onClick={() => navigate("/support")}
                    />
                  </>
                )}
              </ListGroup>
            </div>

            <div>
              <SectionHeader title="Аккаунт и данные" />
              <ListGroup className="premium-glass border-border/40">
                <ListCell
                  icon={Copy}
                  title="Telegram ID"
                  subtitle={displayName ?? undefined}
                  value={String(userId)}
                  onClick={copyUserId}
                />
                {tgUser?.username && (
                  <>
                    <div className="tg-cell-divider" />
                    <ListCell
                      title="Username"
                      value={`@${tgUser.username}`}
                      showChevron={false}
                    />
                  </>
                )}
                <div className="tg-cell-divider" />
                <ListCell
                  icon={CheckCheck}
                  title="Отметить все уведомления прочитанными"
                  subtitle={
                    unreadCount > 0 ? `${unreadCount} непрочитанных` : "Все прочитаны"
                  }
                  onClick={markAllRead}
                />
              </ListGroup>
            </div>

            <div>
              <SectionHeader title="О приложении" />
              <div className="premium-glass flex items-center gap-4 p-4">
                {branding.logo ? (
                  <img
                    src={branding.logo}
                    alt=""
                    className="h-12 w-12 rounded-2xl border border-border/50 object-cover"
                  />
                ) : (
                  <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/15 text-lg font-bold text-primary">
                    {(branding.title || "V").slice(0, 1)}
                  </div>
                )}
                <div>
                  <p className="font-semibold">{branding.title || "VPN Cabinet"}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Premium WebApp</p>
                </div>
              </div>
            </div>

            <ListGroup className="premium-glass border-border/40">
              <ListCell
                icon={LogOut}
                title="Выйти"
                destructive
                showChevron={false}
                onClick={logout}
              />
            </ListGroup>
          </div>
        )}
      </div>
    </>
  );
}
