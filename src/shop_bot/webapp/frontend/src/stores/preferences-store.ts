import { create } from "zustand";
import type { UserPreferences } from "@/types/api";

interface PreferencesState {
  hapticEnabled: boolean;
  notifyToast: boolean;
  apply: (prefs: Partial<UserPreferences>) => void;
}

export const usePreferencesStore = create<PreferencesState>((set) => ({
  hapticEnabled: true,
  notifyToast: true,
  apply: (prefs) =>
    set({
      hapticEnabled: prefs.haptic_enabled ?? true,
      notifyToast: prefs.notify_toast ?? true,
    }),
}));
