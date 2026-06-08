import { useEffect, useState } from "react";
import { Moon, Sun, Monitor, Bell, LogOut } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { Header } from "@/components/layout/header";
import { SectionHeader } from "@/components/premium/section-header";
import { Switch } from "@/components/ui/switch";
import { ListCell, ListGroup } from "@/components/layout/list-cell";
import { useThemeStore } from "@/stores/theme-store";
import { api, getUserId, removeAuthToken, getBootstrap } from "@/lib/api";
import type { UserPreferences } from "@/types/api";
import { useTelegram } from "@/hooks/use-telegram";
import { cn } from "@/lib/utils";

const themeOptions = [
  { id: "system" as const, label: "Авто", icon: Monitor },
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
      <div className="page-scroll">
        <div className="space-y-6 p-4">
          <div>
            <SectionHeader title="Тема оформления" />
            <div className="grid grid-cols-3 gap-2">
              {themeOptions.map((opt) => {
                const active = mode === opt.id;
                return (
                  <motion.button
                    key={opt.id}
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    onClick={() => savePref({ theme: opt.id })}
                    className={cn(
                      "flex flex-col items-center gap-2 rounded-2xl border p-4 transition-all",
                      active
                        ? "border-primary/50 bg-primary/10"
                        : "border-border/50 premium-glass",
                    )}
                  >
                    <opt.icon className={cn("h-6 w-6", active ? "text-primary" : "text-muted-foreground")} />
                    <span className="text-xs font-medium">{opt.label}</span>
                  </motion.button>
                );
              })}
            </div>
          </div>

          <div>
            <SectionHeader title="Уведомления" />
            <ListGroup className="premium-glass border-border/40">
              {(
                [
                  ["notify_payments", "Платежи"],
                  ["notify_subscription", "Подписка"],
                  ["notify_support", "Поддержка"],
                  ["notify_referral", "Рефералы"],
                ] as const
              ).map(([key, label], i) => (
                <div key={key} className="relative">
                  {i > 0 && <div className="tg-cell-divider" />}
                  <div className="tg-cell justify-between">
                    <div className="flex items-center gap-3 flex-1">
                      <Bell className="h-5 w-5 text-primary" />
                      <span className="font-medium text-sm">{label}</span>
                    </div>
                    <Switch
                      checked={prefs[key]}
                      onCheckedChange={(v) => savePref({ [key]: v })}
                    />
                  </div>
                </div>
              ))}
            </ListGroup>
          </div>

          <div>
            <SectionHeader title="О приложении" />
            <div className="premium-glass p-4 flex items-center gap-4">
              {branding.logo ? (
                <img
                  src={branding.logo}
                  alt=""
                  className="h-12 w-12 rounded-2xl object-cover border border-border/50"
                />
              ) : (
                <div className="h-12 w-12 rounded-2xl bg-primary/15 flex items-center justify-center text-primary font-bold text-lg">
                  {(branding.title || "V").slice(0, 1)}
                </div>
              )}
              <div>
                <p className="font-semibold">{branding.title || "VPN Cabinet"}</p>
                <p className="text-xs text-muted-foreground mt-0.5">Telegram Premium WebApp</p>
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
      </div>
    </>
  );
}
