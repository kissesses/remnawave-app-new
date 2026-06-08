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

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/40 bg-card/90 backdrop-blur-2xl premium-nav-glow"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)" }}
    >
      <div className="mx-auto flex h-[52px] max-w-lg items-stretch justify-around px-1">
        {tabs.map(({ to, label, icon: Icon }) => {
          const active =
            to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              onClick={() => haptic("selection")}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              {active && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute inset-x-3 -top-px h-[2px] rounded-full bg-primary"
                  style={{ boxShadow: "0 0 14px hsl(var(--primary) / 0.65)" }}
                  transition={{ type: "spring", stiffness: 520, damping: 34 }}
                />
              )}
              <motion.div
                animate={{
                  scale: active ? 1.1 : 1,
                  y: active ? -2 : 0,
                }}
                transition={{ type: "spring", stiffness: 480, damping: 26 }}
                className={cn(
                  "flex h-8 w-8 items-center justify-center rounded-xl",
                  active ? "bg-primary/14 shadow-[0_4px_16px_hsl(var(--primary)/0.2)]" : "bg-transparent",
                )}
              >
                <motion.div
                  animate={{ rotate: active ? [0, -8, 8, 0] : 0 }}
                  transition={{ duration: 0.35, ease: "easeOut" }}
                >
                  <Icon className="h-[22px] w-[22px]" strokeWidth={active ? 2.35 : 1.75} />
                </motion.div>
              </motion.div>
              <motion.span
                animate={{ opacity: active ? 1 : 0.72, scale: active ? 1.02 : 1 }}
                transition={{ duration: 0.2 }}
              >
                {label}
              </motion.span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
