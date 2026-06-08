import type {
  BootstrapData,
  CabinetConfig,
  Notification,
  PaymentHistory,
  PurchaseCatalog,
  RenewCatalog,
  SupportStatus,
  UserPreferences,
  UserStatus,
} from "@/types/api";

declare global {
  interface Window {
    __WEBAPP_BOOTSTRAP__?: BootstrapData;
    getAuthToken?: () => string | null;
    setAuthToken?: (token: string) => void;
    removeAuthToken?: () => void;
    Telegram?: {
      WebApp?: {
        ready: () => void;
        expand: () => void;
        colorScheme: "light" | "dark";
        themeParams: Record<string, string>;
        HapticFeedback?: {
          impactOccurred: (style: "light" | "medium" | "heavy") => void;
          notificationOccurred: (type: "error" | "success" | "warning") => void;
          selectionChanged: () => void;
        };
        initData?: string;
        initDataUnsafe?: { user?: { id: number } };
        close: () => void;
      };
    };
  }
}

const TOKEN_KEY = "auth_token";

export function getBootstrap(): BootstrapData {
  return (
    window.__WEBAPP_BOOTSTRAP__ ?? {
      userId: 0,
      branding: {},
    }
  );
}

export function getUserId(): number {
  const boot = getBootstrap();
  if (boot.userId) return boot.userId;
  const tgUser = window.Telegram?.WebApp?.initDataUnsafe?.user;
  return tgUser?.id ?? 0;
}

export function getAuthToken(): string | null {
  if (typeof window.getAuthToken === "function") {
    return window.getAuthToken();
  }
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string): void {
  if (typeof window.setAuthToken === "function") {
    window.setAuthToken(token);
    return;
  }
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {
    /* ignore */
  }
}

export function removeAuthToken(): void {
  if (typeof window.removeAuthToken === "function") {
    window.removeAuthToken();
    return;
  }
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

class ApiError extends Error {
  constructor(
    message: string,
    public status?: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (!headers.has("Content-Type") && init?.body) {
    headers.set("Content-Type", "application/json");
  }
  const token = getAuthToken();
  const needsAuth = path.startsWith("/api/") && !path.startsWith("/api/auth/");
  if (needsAuth && token && !headers.has("Authorization")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const res = await fetch(path, {
    ...init,
    credentials: "include",
    headers,
  });

  if (!res.ok) {
    let msg = `HTTP ${res.status}`;
    try {
      const data = await res.json();
      if (data?.error) msg = data.error;
    } catch {
      /* ignore */
    }
    throw new ApiError(msg, res.status);
  }

  return res.json() as Promise<T>;
}

export const api = {
  getUserStatus(userId: number) {
    return request<UserStatus>(`/api/user-status?user_id=${userId}`);
  },

  getCabinetConfig(userId: number) {
    return request<CabinetConfig>(`/api/cabinet/config?user_id=${userId}`);
  },

  getPaymentHistory(userId: number, limit = 50) {
    return request<PaymentHistory>(
      `/api/payments/history?user_id=${userId}&limit=${limit}`,
    );
  },

  getAvatarUrl(userId: number) {
    return `/api/user/avatar?user_id=${userId}`;
  },

  getNotifications(userId: number) {
    return request<{ ok: boolean; notifications: Notification[] }>(
      `/api/notifications?user_id=${userId}`,
    );
  },

  markNotificationsRead(userId: number, ids: string[]) {
    return request<{ ok: boolean }>("/api/notifications/read", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, ids }),
    });
  },

  getPreferences(userId: number) {
    return request<{ ok: boolean; preferences: UserPreferences }>(
      `/api/user/preferences?user_id=${userId}`,
    );
  },

  savePreferences(userId: number, preferences: Partial<UserPreferences>) {
    return request<{ ok: boolean; preferences: UserPreferences }>(
      "/api/user/preferences",
      {
        method: "POST",
        body: JSON.stringify({ user_id: userId, ...preferences }),
      },
    );
  },

  getPurchaseCatalog(userId: number) {
    return request<PurchaseCatalog>(
      `/api/shop/purchase-catalog.json?user_id=${userId}`,
    );
  },

  getRenewCatalog(userId: number) {
    return request<RenewCatalog>(
      `/api/shop/renew-catalog.json?user_id=${userId}`,
    );
  },

  getSupportStatus(userId: number) {
    return request<SupportStatus>("/api/support/status", {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    });
  },

  createSupportTicket(userId: number, subject: string) {
    return request<{ ok: boolean; ticket_id?: number; error?: string }>(
      "/api/support/create",
      {
        method: "POST",
        body: JSON.stringify({ user_id: userId, subject }),
      },
    );
  },

  sendSupportMessage(userId: number, ticketId: number, message: string) {
    return request<{ ok: boolean }>("/api/support/send", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        ticket_id: ticketId,
        message,
      }),
    });
  },

  activateTrial(userId: number, hostName?: string) {
    return request<{ ok: boolean; error?: string; needs_host?: boolean; hosts?: { host_name: string }[] }>(
      "/api/trial/activate",
      {
        method: "POST",
        body: JSON.stringify({ user_id: userId, host_name: hostName }),
      },
    );
  },

  getPaymentMethods(userId: number) {
    return request<{ ok: boolean; methods: { id: string; name: string }[]; balance: number }>(
      "/api/payment-methods",
      {
        method: "POST",
        body: JSON.stringify({ user_id: userId }),
      },
    );
  },

  createPayment(payload: Record<string, unknown>) {
    return request<{
      ok: boolean;
      payment_id?: string;
      payment_url?: string;
      paid?: boolean;
      message?: string;
      error?: string;
    }>("/api/create-payment", { method: "POST", body: JSON.stringify(payload) });
  },

  checkPayment(userId: number, paymentId: string) {
    return request<{ ok: boolean; paid?: boolean; error?: string }>(
      "/api/check-payment",
      {
        method: "POST",
        body: JSON.stringify({ user_id: userId, payment_id: paymentId }),
      },
    );
  },

  applyPromo(userId: number, code: string) {
    return request<{ ok: boolean; message?: string; error?: string }>(
      "/api/apply-promo",
      {
        method: "POST",
        body: JSON.stringify({ user_id: userId, promo_code: code }),
      },
    );
  },
};

export { ApiError };
