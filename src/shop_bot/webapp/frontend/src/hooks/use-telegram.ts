import { useCallback, useEffect } from "react";

export function useTelegram() {
  const tg = window.Telegram?.WebApp;

  useEffect(() => {
    if (tg) {
      tg.ready();
      tg.expand();
    }
  }, [tg]);

  const haptic = useCallback(
    (type: "light" | "medium" | "heavy" | "success" | "error" | "selection") => {
      const hf = tg?.HapticFeedback;
      if (!hf) return;
      if (type === "selection") {
        hf.selectionChanged();
      } else if (type === "success" || type === "error") {
        hf.notificationOccurred(type);
      } else {
        hf.impactOccurred(type);
      }
    },
    [tg],
  );

  return {
    tg,
    isTelegram: Boolean(tg?.initData),
    colorScheme: tg?.colorScheme ?? "dark",
    haptic,
    close: () => tg?.close(),
  };
}
