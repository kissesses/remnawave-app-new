import { create } from "zustand";
import { persist } from "zustand/middleware";
import { applyDesignTokens, resolveThemeMode, type ResolvedTheme } from "@/lib/design-tokens";
import type { UserPreferences } from "@/types/api";

type ThemeMode = UserPreferences["theme"];

interface ThemeState {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (mode: ThemeMode) => void;
  applyResolved: () => void;
}

function applyDomTheme(mode: ThemeMode) {
  const resolved = resolveThemeMode(mode);
  applyDesignTokens(resolved);
  return resolved;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: "system",
      resolved: "dark",
      setMode: (mode) => {
        const resolved = applyDomTheme(mode);
        set({ mode, resolved });
      },
      applyResolved: () => {
        const resolved = applyDomTheme(get().mode);
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

if (typeof window !== "undefined") {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  mq.addEventListener("change", () => {
    const { mode, applyResolved } = useThemeStore.getState();
    if (mode === "system") applyResolved();
  });
}
