import { create } from "zustand";
import { persist } from "zustand/middleware";

interface StealthxAuthState {
  accessToken: string | null;
  refreshToken: string | null;
  userId: number | null;
  setTokens: (access: string, refresh: string, userId?: number) => void;
  clear: () => void;
}

export const useStealthxAuthStore = create<StealthxAuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      refreshToken: null,
      userId: null,
      setTokens: (access, refresh, userId) =>
        set({
          accessToken: access,
          refreshToken: refresh,
          userId: userId ?? null,
        }),
      clear: () => set({ accessToken: null, refreshToken: null, userId: null }),
    }),
    { name: "stealthx-auth" },
  ),
);
