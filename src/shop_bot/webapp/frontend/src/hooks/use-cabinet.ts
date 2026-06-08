import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, getUserId } from "@/lib/api";

export function useUserId() {
  return getUserId();
}

export function useUserStatus() {
  const userId = getUserId();
  return useQuery({
    queryKey: ["user", "status", userId],
    queryFn: () => api.getUserStatus(userId),
    enabled: userId > 0,
    staleTime: 30_000,
  });
}

export function useCabinetConfig() {
  const userId = getUserId();
  return useQuery({
    queryKey: ["cabinet", "config", userId],
    queryFn: () => api.getCabinetConfig(userId),
    enabled: userId > 0,
    staleTime: 30_000,
  });
}

export function usePaymentHistory(limit = 50) {
  const userId = getUserId();
  return useQuery({
    queryKey: ["payments", "history", userId, limit],
    queryFn: () => api.getPaymentHistory(userId, limit),
    enabled: userId > 0,
    staleTime: 60_000,
  });
}

export function useNotifications() {
  const userId = getUserId();
  return useQuery({
    queryKey: ["notifications", userId],
    queryFn: async () => {
      const res = await api.getNotifications(userId);
      return res.notifications ?? [];
    },
    enabled: userId > 0,
    staleTime: 30_000,
  });
}

export function useCabinetBootstrap() {
  const userId = getUserId();
  return useQuery({
    queryKey: ["cabinet", "bootstrap", userId],
    queryFn: async () => {
      const [status, config] = await Promise.all([
        api.getUserStatus(userId),
        api.getCabinetConfig(userId),
      ]);
      return { status, config };
    },
    enabled: userId > 0,
    staleTime: 30_000,
  });
}

export function useRefreshCabinet() {
  const qc = useQueryClient();
  const userId = getUserId();
  return async () => {
    await qc.invalidateQueries({ queryKey: ["user", "status", userId] });
    await qc.invalidateQueries({ queryKey: ["cabinet", "config", userId] });
    await qc.invalidateQueries({ queryKey: ["payments", "history", userId] });
    await qc.invalidateQueries({ queryKey: ["notifications", userId] });
    await qc.invalidateQueries({ queryKey: ["cabinet", "bootstrap", userId] });
  };
}
