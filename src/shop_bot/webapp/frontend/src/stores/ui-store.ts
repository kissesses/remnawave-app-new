import { create } from "zustand";

interface UiState {
  pullRefreshing: boolean;
  unreadNotifications: number;
  activeSheet: string | null;
  setPullRefreshing: (v: boolean) => void;
  setUnreadNotifications: (n: number) => void;
  setActiveSheet: (id: string | null) => void;
}

export const useUiStore = create<UiState>((set) => ({
  pullRefreshing: false,
  unreadNotifications: 0,
  activeSheet: null,
  setPullRefreshing: (pullRefreshing) => set({ pullRefreshing }),
  setUnreadNotifications: (unreadNotifications) => set({ unreadNotifications }),
  setActiveSheet: (activeSheet) => set({ activeSheet }),
}));
