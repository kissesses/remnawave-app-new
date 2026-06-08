import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserPreferences } from "@/types/api";

type ThemeMode = UserPreferences["theme"];

interface ThemeState {
  mode: ThemeMode;
  resolved: "light" | "dark";
  setMode: (mode: ThemeMode) => void;
  applyResolved: () => void;
}

function resolveTheme(mode: ThemeMode): "light" | "dark" {
  if (mode === "light") return "light";
  if (mode === "dark") return "dark";
  const tg = window.Telegram?.WebApp?.colorScheme;
  if (tg) return tg;
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

function applyDomTheme(resolved: "light" | "dark") {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "dark");
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", resolved === "dark" ? "#17212B" : "#FFFFFF");
  }
  const accent = getComputedStyle(root).getPropertyValue("--primary").trim();
  if (window.Telegram?.WebApp) {
    try {
      document.documentElement.style.setProperty(
        "--tg-theme-bg-color",
        resolved === "dark" ? "#17212B" : "#FFFFFF",
      );
    } catch {
      /* ignore */
    }
  }
  void accent;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: "system",
      resolved: "dark",
      setMode: (mode) => {
        const resolved = resolveTheme(mode);
        applyDomTheme(resolved);
        set({ mode, resolved });
      },
      applyResolved: () => {
        const resolved = resolveTheme(get().mode);
        applyDomTheme(resolved);
        set({ resolved });
      },
    }),
    {
      name: "webapp-theme",
      partialize: (s) => ({ mode: s.mode }),
      onRehydrateStorage: () => (state) => {
        if (state) state.applyResolved();
      },
    },
  ),
);
