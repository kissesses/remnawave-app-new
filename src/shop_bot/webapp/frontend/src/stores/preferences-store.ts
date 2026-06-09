import { create } from "zustand";
import type { UserPreferences } from "@/types/api";

interface PreferencesState extends UserPreferences {
  apply: (prefs: Partial<UserPreferences>) => void;
}

const INITIAL: UserPreferences = {
  theme: "system",
  notify_payments: true,
  notify_subscription: true,
  notify_support: true,
  notify_referral: true,
  notify_promo: true,
  notify_toast: true,
  haptic_enabled: true,
  notify_telegram_bot: false,
  default_home_tab: "home",
  compact_keys: false,
  locale: "ru",
  hide_balance: false,
  support_faq_collapsed: false,
  home_hidden_widgets: [],
  auto_renew_remind_days: 3,
  auto_renew_enabled: false,
};

export const usePreferencesStore = create<PreferencesState>((set) => ({
  ...INITIAL,
  apply: (prefs) => set((state) => ({ ...state, ...prefs })),
}));
