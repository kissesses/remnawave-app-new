import { useCallback, useEffect } from "react";
import { useThemeStore } from "@/stores/theme-store";
import { usePreferencesStore } from "@/stores/preferences-store";

export function useTelegram() {
  const tg = window.Telegram?.WebApp;
  const resolved = useThemeStore((s) => s.resolved);

  useEffect(() => {
    if (!tg) return;
    tg.ready();
    tg.expand();
    try {
      const tp = tg.themeParams;
      if (tp?.bg_color) tg.setBackgroundColor?.(tp.bg_color);
      if (tp?.header_bg_color) tg.setHeaderColor?.(tp.header_bg_color);
      else tg.setHeaderColor?.(resolved === "dark" ? "#17212B" : "#FFFFFF");
    } catch {
      /* ignore */
    }
  }, [tg, resolved]);

  const haptic = useCallback(
    (type: "light" | "medium" | "heavy" | "success" | "error" | "selection") => {
      if (!usePreferencesStore.getState().hapticEnabled) return;
      const hf = tg?.HapticFeedback;
      if (!hf) return;
      if (type === "selection") hf.selectionChanged();
      else if (type === "success" || type === "error") hf.notificationOccurred(type);
      else hf.impactOccurred(type);
    },
    [tg],
  );

  const user = tg?.initDataUnsafe?.user as
    | { id?: number; first_name?: string; last_name?: string; username?: string; photo_url?: string }
    | undefined;

  const displayName = user
    ? [user.first_name, user.last_name].filter(Boolean).join(" ") || user.username || `ID ${user.id}`
    : null;

  return {
    tg,
    user,
    displayName,
    isTelegram: Boolean(tg?.initData),
    colorScheme: tg?.colorScheme ?? "dark",
    haptic,
    close: () => tg?.close(),
    openLink: (url: string) => tg?.openLink?.(url),
    showMainButton: (text: string, onClick: () => void) => {
      if (!tg?.MainButton) return () => {};
      tg.MainButton.setText(text);
      tg.MainButton.show();
      tg.MainButton.onClick(onClick);
      return () => {
        tg.MainButton.offClick(onClick);
        tg.MainButton.hide();
      };
    },
    showBackButton: (onClick: () => void) => {
      if (!tg?.BackButton) return () => {};
      tg.BackButton.show();
      tg.BackButton.onClick(onClick);
      return () => {
        tg.BackButton.offClick(onClick);
        tg.BackButton.hide();
      };
    },
  };
}
