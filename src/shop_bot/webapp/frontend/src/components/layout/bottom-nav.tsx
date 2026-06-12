import { Home, Wallet, User, Headphones } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useTelegram } from "@/hooks/use-telegram";
import { useSupportUnread } from "@/hooks/use-cabinet";

const tabs = [
  { to: "/app", label: "Главная", icon: Home },
  { to: "/app/wallet", label: "Кошелёк", icon: Wallet },
  { to: "/app/profile", label: "Профиль", icon: User },
  { to: "/app/support", label: "Поддержка", icon: Headphones },
] as const;

const HIDDEN_PREFIXES = ["/app/history", "/app/notifications", "/app/settings", "/app/vpn", "/app/keys"];

export function BottomNav() {
  const location = useLocation();
  const { haptic } = useTelegram();
  const { data: supportUnread = 0 } = useSupportUnread();
  const hidden = HIDDEN_PREFIXES.some((p) => location.pathname.startsWith(p));

  if (hidden) return null;

  const safeBottom =
    "max(var(--tg-content-safe-area-inset-bottom, env(safe-area-inset-bottom, 0px)), 10px)";

  return (
    <div
      className="fixed inset-x-0 z-50 px-3 pointer-events-none"
      style={{ bottom: safeBottom }}
    >
      <nav className="premium-dock mx-auto max-w-lg pointer-events-auto">
        <div className="flex h-[58px] items-stretch justify-around px-1.5">
          {tabs.map(({ to, label, icon: Icon }) => {
            const active =
              to === "/app"
                ? location.pathname === "/app" || location.pathname === "/app/"
                : location.pathname.startsWith(to);
            return (
              <NavLink
                key={to}
                to={to}
                onClick={() => haptic("selection")}
                className={cn(
                  "relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <motion.div
                  layoutId="dock-pill"
                  className={cn(
                    "absolute inset-x-1.5 inset-y-1.5 rounded-2xl",
                    active ? "premium-dock-active" : "opacity-0",
                  )}
                  transition={{ type: "spring", stiffness: 480, damping: 32 }}
                />
                <div className="relative z-10 flex h-7 w-7 items-center justify-center">
                  <Icon className="h-[21px] w-[21px]" strokeWidth={active ? 2.25 : 1.75} />
                  {to === "/app/support" && supportUnread > 0 && !active && (
                    <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                      {supportUnread > 9 ? "9+" : supportUnread}
                    </span>
                  )}
                </div>
                <span className="relative z-10">{label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
