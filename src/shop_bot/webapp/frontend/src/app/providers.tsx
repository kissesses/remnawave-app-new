import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect } from "react";
import { ThemeProvider } from "@/components/theme/theme-provider";
import { useThemeStore } from "@/stores/theme-store";
import { useNotifications } from "@/hooks/use-cabinet";
import { useBranding } from "@/hooks/use-branding";
import { useUiStore } from "@/stores/ui-store";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ThemeSync() {
  const applyResolved = useThemeStore((s) => s.applyResolved);
  useEffect(() => {
    applyResolved();
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyResolved();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [applyResolved]);
  return null;
}

function BrandingSync() {
  useBranding();
  return null;
}

function NotificationBadgeSync() {
  const { data } = useNotifications();
  const setUnread = useUiStore((s) => s.setUnreadNotifications);
  useEffect(() => {
    setUnread((data ?? []).filter((n) => !n.read).length);
  }, [data, setUnread]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ThemeSync />
        <BrandingSync />
        <NotificationBadgeSync />
        {children}
      </ThemeProvider>
    </QueryClientProvider>
  );
}
