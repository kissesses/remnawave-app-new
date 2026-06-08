import { useEffect } from "react";
import { getBootstrap } from "@/lib/api";
import { useThemeStore } from "@/stores/theme-store";

function hexToHsl(hex: string): string | null {
  const raw = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function applyTelegramThemeParams(tg: NonNullable<Window["Telegram"]>["WebApp"]) {
  const tp = tg?.themeParams;
  if (!tp) return;
  const root = document.documentElement;
  const map: Record<string, string> = {
    bg_color: "--background",
    secondary_bg_color: "--card",
    text_color: "--foreground",
    hint_color: "--muted-foreground",
    button_color: "--primary",
    button_text_color: "--primary-foreground",
  };
  for (const [key, cssVar] of Object.entries(map)) {
    const hex = tp[key];
    if (!hex?.startsWith("#")) continue;
    const hsl = hexToHsl(hex);
    if (hsl) root.style.setProperty(cssVar, hsl);
  }
}

/** One-time Telegram Mini App shell: viewport, safe-area, fullscreen, theme sync. */
export function useTelegramShell() {
  const applyResolved = useThemeStore((s) => s.applyResolved);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    const root = document.documentElement;
    if (!tg?.initData) return;

    root.classList.add("tg-miniapp");

    const fullscreen = Boolean(getBootstrap().tgFullscreen);
    if (fullscreen) {
      root.classList.add("tg-fullscreen");
      try {
        tg.requestFullscreen?.();
      } catch {
        /* older clients */
      }
    }

    tg.ready();
    tg.expand();
    try {
      tg.disableVerticalSwipes?.();
    } catch {
      /* ignore */
    }

    applyTelegramThemeParams(tg);
    applyResolved();

    const syncViewport = () => {
      const h = tg.viewportStableHeight || tg.viewportHeight;
      if (h) root.style.setProperty("--tg-app-height", `${h}px`);
    };
    syncViewport();

    const onTheme = () => {
      applyTelegramThemeParams(tg);
      applyResolved();
      try {
        const tp = tg.themeParams;
        if (tp?.bg_color) tg.setBackgroundColor?.(tp.bg_color);
        if (tp?.header_bg_color) tg.setHeaderColor?.(tp.header_bg_color);
      } catch {
        /* ignore */
      }
    };

    tg.onEvent?.("viewportChanged", syncViewport);
    tg.onEvent?.("safeAreaChanged", syncViewport);
    tg.onEvent?.("contentSafeAreaChanged", syncViewport);
    tg.onEvent?.("themeChanged", onTheme);

    onTheme();

    return () => {
      tg.offEvent?.("viewportChanged", syncViewport);
      tg.offEvent?.("safeAreaChanged", syncViewport);
      tg.offEvent?.("contentSafeAreaChanged", syncViewport);
      tg.offEvent?.("themeChanged", onTheme);
      root.classList.remove("tg-miniapp", "tg-fullscreen");
    };
  }, [applyResolved]);
}
