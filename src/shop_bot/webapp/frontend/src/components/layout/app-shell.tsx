import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { BottomNav } from "./bottom-nav";
import { Toaster } from "sonner";
import { AmbientBackground } from "@/components/premium/ambient-background";
import { useNavigationDirection } from "@/hooks/use-navigation-direction";
import { useTelegramShell } from "@/hooks/use-telegram-shell";
import { cn } from "@/lib/utils";

const STACK_PREFIXES = ["/history", "/notifications", "/settings", "/vpn", "/keys"];

function isStackPath(path: string) {
  return STACK_PREFIXES.some((p) => path.startsWith(p));
}

export function AppShell() {
  const location = useLocation();
  const { direction } = useNavigationDirection();
  const isStack = isStackPath(location.pathname);
  useTelegramShell();

  const stackVariants = {
    initial: { x: direction > 0 ? "100%" : "24%", opacity: 0.85 },
    animate: { x: 0, opacity: 1 },
    exit: { x: direction < 0 ? "100%" : "-12%", opacity: 0.85 },
  };

  return (
    <div
      className={cn(
        "app-shell relative flex h-full flex-col max-w-lg mx-auto w-full",
        !isStack && "has-tab-bar",
      )}
    >
      <AmbientBackground />
      {isStack ? (
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.div
            key={location.pathname}
            variants={stackVariants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ type: "spring", damping: 34, stiffness: 340, mass: 0.85 }}
            className="relative z-[1] flex flex-1 flex-col overflow-hidden"
          >
            <Outlet />
          </motion.div>
        </AnimatePresence>
      ) : (
        <div key={location.pathname} className="relative z-[1] flex flex-1 flex-col overflow-hidden page-enter">
          <Outlet />
        </div>
      )}
      <BottomNav />
      <Toaster
        position="top-center"
        toastOptions={{
          className:
            "surface-glass rounded-2xl border-0 text-foreground",
          style: { marginTop: "var(--tg-content-safe-area-inset-top, 0px)" },
        }}
        richColors
        closeButton
      />
    </div>
  );
}
