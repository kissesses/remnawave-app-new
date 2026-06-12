import { useCallback } from "react";
import { useStealthxAuthStore } from "@/stores/stealthx-auth-store";
import { stealthxApi } from "@/services/stealthx-api";

export function useStealthxAuth() {
  const { accessToken, userId, setTokens, clear } = useStealthxAuthStore();

  const register = useCallback(
    async (email: string, password: string, displayName?: string) => {
      const { data } = await stealthxApi.register(email, password, displayName);
      setTokens(data.access_token, data.refresh_token, data.user_id);
      return data;
    },
    [setTokens],
  );

  const login = useCallback(
    async (email: string, password: string) => {
      const { data } = await stealthxApi.login(email, password);
      setTokens(data.access_token, data.refresh_token, data.user_id);
      return data;
    },
    [setTokens],
  );

  const logout = useCallback(async () => {
    try {
      if (accessToken) await stealthxApi.logout();
    } finally {
      clear();
    }
  }, [accessToken, clear]);

  return {
    isAuthenticated: Boolean(accessToken),
    userId,
    register,
    login,
    logout,
  };
}
