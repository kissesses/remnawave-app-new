import { create } from "zustand";
import { persist } from "zustand/middleware";
import { applyDesignTokens } from "@/lib/design-tokens";
import type { UserPreferences } from "@/types/api";

type ThemeMode = UserPreferences["theme"];

interface ThemeState {
  mode: ThemeMode;
  resolved: "dark";
  setMode: (mode: ThemeMode) => void;
  applyResolved: () => void;
}

function applyDomTheme() {
  applyDesignTokens();
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      mode: "dark",
      resolved: "dark",
      setMode: (mode) => {
        applyDomTheme();
        set({ mode: mode === "light" ? "dark" : mode, resolved: "dark" });
      },
      applyResolved: () => {
        applyDomTheme();
        set({ resolved: "dark" });
        void get().mode;
      },
    }),
    {
      name: "webapp-theme",
      partialize: (s) => ({ mode: "dark" as ThemeMode }),
      onRehydrateStorage: () => (state) => {
        if (state) state.applyResolved();
      },
    },
  ),
);
