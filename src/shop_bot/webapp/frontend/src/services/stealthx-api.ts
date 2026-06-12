import axios, { type AxiosError, type InternalAxiosRequestConfig } from "axios";
import { useStealthxAuthStore } from "@/stores/stealthx-auth-store";

export interface StealthxPlan {
  id: number;
  slug: string;
  name: string;
  price_usd: number;
  popular: boolean;
  features: string[];
}

export interface StealthxServer {
  country: string;
  country_code: string;
  host_name: string;
  ping_ms: number;
  load_pct: number;
  status: string;
  lat: number;
  lng: number;
}

const client = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

client.interceptors.request.use((config: InternalAxiosRequestConfig) => {
  const token = useStealthxAuthStore.getState().accessToken;
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refresh = useStealthxAuthStore.getState().refreshToken;
      if (refresh) {
        try {
          const { data } = await axios.post("/api/auth/refresh", { refresh_token: refresh });
          useStealthxAuthStore.getState().setTokens(data.access_token, data.refresh_token);
          if (original.headers) {
            original.headers.Authorization = `Bearer ${data.access_token}`;
          }
          return client(original);
        } catch {
          useStealthxAuthStore.getState().clear();
        }
      }
    }
    return Promise.reject(error);
  },
);

export const stealthxApi = {
  register: (email: string, password: string, display_name?: string) =>
    client.post("/auth/register", { email, password, display_name }),

  login: (email: string, password: string) =>
    client.post("/auth/login", { email, password }),

  logout: () => client.post("/auth/jwt/logout"),

  getProfile: () => client.get("/user/profile"),

  getPlans: () => client.get<StealthxPlan[]>("/plans"),

  subscribe: (plan_id: number) => client.post("/subscribe", { plan_id }),

  getServers: () => client.get<StealthxServer[]>("/servers"),

  getServerStatus: () => client.get("/server-status"),
};
