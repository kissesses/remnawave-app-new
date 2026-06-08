import { lazy, Suspense, type ComponentType } from "react";
import { createBrowserRouter } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { Skeleton } from "@/components/ui/skeleton";

const HomePage = lazy(() =>
  import("@/features/home/home-page").then((m) => ({ default: m.HomePage })),
);
const WalletPage = lazy(() =>
  import("@/features/wallet/wallet-page").then((m) => ({ default: m.WalletPage })),
);
const ProfilePage = lazy(() =>
  import("@/features/profile/profile-page").then((m) => ({ default: m.ProfilePage })),
);
const SupportPage = lazy(() =>
  import("@/features/support/support-page").then((m) => ({ default: m.SupportPage })),
);
const HistoryPage = lazy(() =>
  import("@/features/history/history-page").then((m) => ({ default: m.HistoryPage })),
);
const NotificationsPage = lazy(() =>
  import("@/features/notifications/notifications-page").then((m) => ({
    default: m.NotificationsPage,
  })),
);
const SettingsPage = lazy(() =>
  import("@/features/settings/settings-page").then((m) => ({ default: m.SettingsPage })),
);
const VpnSetupPage = lazy(() =>
  import("@/features/vpn-setup/vpn-setup-page").then((m) => ({ default: m.VpnSetupPage })),
);

function PageFallback() {
  return (
    <div className="p-4 space-y-3">
      <Skeleton className="h-8 w-40" />
      <Skeleton className="h-32 w-full rounded-2xl" />
      <Skeleton className="h-24 w-full rounded-2xl" />
    </div>
  );
}

function withSuspense(Component: ComponentType) {
  return (
    <Suspense fallback={<PageFallback />}>
      <Component />
    </Suspense>
  );
}

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: withSuspense(HomePage) },
      { path: "wallet", element: withSuspense(WalletPage) },
      { path: "profile", element: withSuspense(ProfilePage) },
      { path: "support", element: withSuspense(SupportPage) },
      { path: "history", element: withSuspense(HistoryPage) },
      { path: "notifications", element: withSuspense(NotificationsPage) },
      { path: "settings", element: withSuspense(SettingsPage) },
      { path: "vpn/setup", element: withSuspense(VpnSetupPage) },
    ],
  },
]);
