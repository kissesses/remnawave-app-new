import { Home, Wallet, User, Headphones } from "lucide-react";
import { NavLink, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import { useTelegram } from "@/hooks/use-telegram";

const tabs = [
  { to: "/", label: "Главная", icon: Home },
  { to: "/wallet", label: "Кошелёк", icon: Wallet },
  { to: "/profile", label: "Профиль", icon: User },
  { to: "/support", label: "Поддержка", icon: Headphones },
] as const;

const HIDDEN_PREFIXES = ["/history", "/notifications", "/settings", "/vpn", "/keys"];

export function BottomNav() {
  const location = useLocation();
  const { haptic } = useTelegram();
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
        <div className="flex h-[54px] items-stretch justify-around px-1">
          {tabs.map(({ to, label, icon: Icon }) => {
            const active =
              to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
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
                    "absolute inset-x-1.5 inset-y-1.5 rounded-xl",
                    active ? "premium-dock-active" : "opacity-0",
                  )}
                  transition={{ type: "spring", stiffness: 480, damping: 32 }}
                />
                <motion.div
                  animate={{ scale: active ? 1.08 : 1, y: active ? -1 : 0 }}
                  transition={{ type: "spring", stiffness: 500, damping: 28 }}
                  className="relative z-10 flex h-7 w-7 items-center justify-center"
                >
                  <Icon className="h-[21px] w-[21px]" strokeWidth={active ? 2.4 : 1.8} />
                </motion.div>
                <span className="relative z-10">{label}</span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
