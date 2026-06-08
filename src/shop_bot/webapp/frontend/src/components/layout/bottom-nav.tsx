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

export function BottomNav() {
  const location = useLocation();
  const { haptic } = useTelegram();
  const hidden = ["/history", "/notifications", "/settings", "/vpn/setup"].some((p) =>
    location.pathname.startsWith(p),
  );

  if (hidden) return null;

  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border/60 bg-card/95 backdrop-blur-xl"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 8px)" }}
    >
      <div className="mx-auto flex h-14 max-w-lg items-stretch justify-around px-2">
        {tabs.map(({ to, label, icon: Icon }) => {
          const active = to === "/" ? location.pathname === "/" : location.pathname.startsWith(to);
          return (
            <NavLink
              key={to}
              to={to}
              onClick={() => haptic("selection")}
              className={cn(
                "relative flex flex-1 flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition-colors",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              {active && (
                <motion.div
                  layoutId="tab-indicator"
                  className="absolute -top-px h-0.5 w-10 rounded-full bg-primary"
                  transition={{ type: "spring", stiffness: 500, damping: 35 }}
                />
              )}
              <Icon className="h-6 w-6" strokeWidth={active ? 2.25 : 1.75} />
              <span>{label}</span>
            </NavLink>
          );
        })}
      </div>
    </nav>
  );
}
