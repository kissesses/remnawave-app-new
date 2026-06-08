import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { BottomNav } from "./bottom-nav";
import { Toaster } from "sonner";

const slideVariants = {
  initial: (dir: number) => ({ x: dir > 0 ? "100%" : "-30%", opacity: 0 }),
  animate: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir < 0 ? "100%" : "-30%", opacity: 0 }),
};

export function AppShell() {
  const location = useLocation();
  const isStack = ["/history", "/notifications", "/settings", "/vpn/setup"].some((p) =>
    location.pathname.startsWith(p),
  );

  return (
    <div className="flex h-full flex-col max-w-lg mx-auto w-full bg-background">
      <AnimatePresence mode="wait" custom={isStack ? 1 : -1}>
        <motion.div
          key={location.pathname}
          custom={isStack ? 1 : -1}
          variants={slideVariants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{ type: "spring", damping: 28, stiffness: 300 }}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <Outlet />
        </motion.div>
      </AnimatePresence>
      <BottomNav />
      <Toaster
        position="top-center"
        toastOptions={{
          className: "rounded-2xl border border-border bg-card text-foreground shadow-lg",
        }}
        richColors
        closeButton
      />
    </div>
  );
}
