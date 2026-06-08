import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getUserId } from "@/lib/api";
import { usePreferencesStore } from "@/stores/preferences-store";
import type { UserPreferences } from "@/types/api";

export const DEFAULT_PREFERENCES: UserPreferences = {
  theme: "system",
  notify_payments: true,
  notify_subscription: true,
  notify_support: true,
  notify_referral: true,
  notify_promo: true,
  notify_toast: true,
  haptic_enabled: true,
};

export function usePreferences() {
  const userId = getUserId();
  return useQuery({
    queryKey: ["user", "preferences", userId],
    queryFn: async () => {
      const res = await api.getPreferences(userId);
      const prefs = res.ok && res.preferences ? res.preferences : DEFAULT_PREFERENCES;
      usePreferencesStore.getState().apply(prefs);
      return prefs;
    },
    enabled: userId > 0,
    staleTime: 60_000,
  });
}

export function useSavePreferences() {
  const qc = useQueryClient();
  const userId = getUserId();
  return async (patch: Partial<UserPreferences>) => {
    const res = await api.savePreferences(userId, patch);
    if (res.ok && res.preferences) {
      usePreferencesStore.getState().apply(res.preferences);
      qc.setQueryData(["user", "preferences", userId], res.preferences);
      await qc.invalidateQueries({ queryKey: ["notifications", userId] });
    }
    return res;
  };
}
