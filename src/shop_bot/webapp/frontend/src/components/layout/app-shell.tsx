import { Outlet, useLocation } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { BottomNav } from "./bottom-nav";
import { Toaster } from "sonner";
import { useNavigationDirection } from "@/hooks/use-navigation-direction";

export function AppShell() {
  const location = useLocation();
  const { direction, isStack } = useNavigationDirection();

  const variants = isStack
    ? {
        initial: { x: direction > 0 ? "100%" : "30%", opacity: 0.6 },
        animate: { x: 0, opacity: 1 },
        exit: { x: direction < 0 ? "100%" : "-20%", opacity: 0.6 },
      }
    : {
        initial: { x: direction > 0 ? "18%" : "-18%", opacity: 0.85 },
        animate: { x: 0, opacity: 1 },
        exit: { x: direction < 0 ? "18%" : "-18%", opacity: 0.85 },
      };

  return (
    <div className="flex h-full flex-col max-w-lg mx-auto w-full bg-background">
      <AnimatePresence mode="wait" custom={direction}>
        <motion.div
          key={location.pathname}
          custom={direction}
          variants={variants}
          initial="initial"
          animate="animate"
          exit="exit"
          transition={{
            type: "spring",
            damping: isStack ? 32 : 38,
            stiffness: isStack ? 320 : 420,
            mass: 0.8,
          }}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <Outlet />
        </motion.div>
      </AnimatePresence>
      <BottomNav />
      <Toaster
        position="top-center"
        toastOptions={{
          className:
            "rounded-2xl border border-border/50 bg-card/95 text-foreground shadow-xl backdrop-blur-xl",
        }}
        richColors
        closeButton
      />
    </div>
  );
}
