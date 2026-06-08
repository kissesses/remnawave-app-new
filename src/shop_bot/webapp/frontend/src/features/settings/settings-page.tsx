import { useEffect, useState } from "react";
import { Moon, Sun, Monitor, Bell, LogOut } from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/header";
import { Switch } from "@/components/ui/switch";
import { ListCell, ListGroup } from "@/components/layout/list-cell";
import { useThemeStore } from "@/stores/theme-store";
import { api, getUserId, removeAuthToken } from "@/lib/api";
import { getBootstrap } from "@/lib/api";
import type { UserPreferences } from "@/types/api";
import { useTelegram } from "@/hooks/use-telegram";

const themeOptions = [
  { id: "system" as const, label: "Системная", icon: Monitor },
  { id: "light" as const, label: "Светлая", icon: Sun },
  { id: "dark" as const, label: "Тёмная", icon: Moon },
];

export function SettingsPage() {
  const { mode, setMode } = useThemeStore();
  const { haptic } = useTelegram();
  const branding = getBootstrap().branding;
  const [prefs, setPrefs] = useState<UserPreferences>({
    theme: mode,
    notify_payments: true,
    notify_subscription: true,
    notify_support: true,
    notify_referral: true,
  });

  useEffect(() => {
    api.getPreferences(getUserId()).then((res) => {
      if (res.ok && res.preferences) {
        setPrefs(res.preferences);
        setMode(res.preferences.theme);
      }
    });
  }, [setMode]);

  const savePref = async (patch: Partial<UserPreferences>) => {
    const next = { ...prefs, ...patch };
    setPrefs(next);
    if (patch.theme) setMode(patch.theme);
    haptic("selection");
    await api.savePreferences(getUserId(), patch);
  };

  const logout = () => {
    removeAuthToken();
    toast.success("Вы вышли из аккаунта");
    window.location.href = "/";
  };

  return (
    <>
      <Header title="Настройки" showBack />
      <div className="page-scroll pb-8">
        <div className="space-y-6 p-4">
          <div>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Тема
            </h2>
            <ListGroup>
              {themeOptions.map((opt, i) => (
                <div key={opt.id}>
                  {i > 0 && <div className="tg-cell-divider" />}
                  <ListCell
                    icon={opt.icon}
                    title={opt.label}
                    showChevron={false}
                    value={mode === opt.id ? "✓" : ""}
                    onClick={() => savePref({ theme: opt.id })}
                  />
                </div>
              ))}
            </ListGroup>
          </div>

          <div>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Уведомления
            </h2>
            <ListGroup>
              {(
                [
                  ["notify_payments", "Платежи"],
                  ["notify_subscription", "Подписка"],
                  ["notify_support", "Поддержка"],
                  ["notify_referral", "Рефералы"],
                ] as const
              ).map(([key, label], i) => (
                <div key={key} className="tg-cell justify-between">
                  {i > 0 && <div className="tg-cell-divider absolute left-0 right-0" />}
                  <div className="flex items-center gap-3 flex-1">
                    <Bell className="h-5 w-5 text-primary" />
                    <span className="font-medium">{label}</span>
                  </div>
                  <Switch
                    checked={prefs[key]}
                    onCheckedChange={(v) => savePref({ [key]: v })}
                  />
                </div>
              ))}
            </ListGroup>
          </div>

          <div>
            <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              О приложении
            </h2>
            <ListGroup>
              <ListCell
                title={branding.title || "VPN Cabinet"}
                subtitle="Telegram Premium WebApp"
                showChevron={false}
              />
            </ListGroup>
          </div>

          <ListGroup>
            <ListCell
              icon={LogOut}
              title="Выйти"
              destructive
              showChevron={false}
              onClick={logout}
            />
          </ListGroup>
        </div>
      </div>
    </>
  );
}
