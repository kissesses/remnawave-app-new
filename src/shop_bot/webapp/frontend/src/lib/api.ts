import type {
  BootstrapData,
  CabinetConfig,
  Notification,
  ActivityTimelineResponse,
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
        initDataUnsafe?: {
          user?: {
            id: number;
            first_name?: string;
            last_name?: string;
            username?: string;
            photo_url?: string;
          };
        };
        close: () => void;
        openLink?: (url: string) => void;
        setHeaderColor?: (color: string) => void;
        setBackgroundColor?: (color: string) => void;
        MainButton?: {
          setText: (t: string) => void;
          show: () => void;
          hide: () => void;
          onClick: (cb: () => void) => void;
          offClick: (cb: () => void) => void;
        };
        BackButton?: {
          show: () => void;
          hide: () => void;
          onClick: (cb: () => void) => void;
          offClick: (cb: () => void) => void;
        };
        viewportHeight?: number;
        viewportStableHeight?: number;
        requestFullscreen?: () => void;
        disableVerticalSwipes?: () => void;
        onEvent?: (event: string, cb: () => void) => void;
        offEvent?: (event: string, cb: () => void) => void;
      };
    };
  }
}

const TOKEN_KEY = "auth_token";

export function getBootstrap(): BootstrapData {
  return (
    window.__WEBAPP_BOOTSTRAP__ ?? {
      userId: 0,
      tgFullscreen: false,
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

  getSupportStatus(userId: number, ticketId?: number) {
    return request<SupportStatus>("/api/support/status", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        ...(ticketId != null ? { ticket_id: ticketId } : {}),
      }),
    });
  },

  createSupportTicket(
    userId: number,
    subject: string,
    options?: { message?: string; category?: string },
  ) {
    return request<{ ok: boolean; ticket_id?: number; error?: string }>(
      "/api/support/create",
      {
        method: "POST",
        body: JSON.stringify({
          user_id: userId,
          subject,
          message: options?.message,
          category: options?.category,
        }),
      },
    );
  },

  sendSupportMessage(userId: number, ticketId: number, message: string) {
    return request<{ ok: boolean; error?: string }>("/api/support/send", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        ticket_id: ticketId,
        message,
      }),
    });
  },

  closeSupportTicket(userId: number, ticketId: number) {
    return request<{ ok: boolean; error?: string }>("/api/support/close", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, ticket_id: ticketId }),
    });
  },

  reopenSupportTicket(userId: number, ticketId: number) {
    return request<{ ok: boolean; ticket_id?: number; error?: string }>(
      "/api/support/reopen",
      {
        method: "POST",
        body: JSON.stringify({ user_id: userId, ticket_id: ticketId }),
      },
    );
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

  applyPromo(userId: number, code: string, planId?: number) {
    return request<{ ok: boolean; message?: string; error?: string }>(
      "/api/apply-promo",
      {
        method: "POST",
        body: JSON.stringify({ user_id: userId, promo_code: code, plan_id: planId }),
      },
    );
  },

  getKeyDevices(userId: number, keyId: number, hostName?: string) {
    return request<{ ok: boolean; devices: { id?: string; name?: string; platform?: string }[] }>(
      "/api/key/devices",
      {
        method: "POST",
        body: JSON.stringify({ user_id: userId, key_id: keyId, host_name: hostName }),
      },
    );
  },

  deleteKeyDevice(userId: number, keyId: number, deviceId: string, hostName?: string) {
    return request<{ ok: boolean; error?: string }>("/api/key/device/delete", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        key_id: keyId,
        device_id: deviceId,
        host_name: hostName,
      }),
    });
  },

  saveKeyComment(userId: number, keyId: number, comment: string) {
    return request<{ ok: boolean }>("/api/key/comment", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, key_id: keyId, comment }),
    });
  },

  getActivityTimeline(
    userId: number,
    options?: {
      category?: string;
      q?: string;
      limit?: number;
      offset?: number;
      date_from?: string;
      date_to?: string;
    },
  ) {
    return request<ActivityTimelineResponse>("/api/user/timeline", {
      method: "POST",
      body: JSON.stringify({
        user_id: userId,
        category: options?.category ?? "all",
        q: options?.q ?? "",
        limit: options?.limit ?? 40,
        offset: options?.offset ?? 0,
        date_from: options?.date_from ?? "",
        date_to: options?.date_to ?? "",
      }),
    });
  },

  getKeySubQr(userId: number, keyId: number) {
    return request<{ ok: boolean; qr_data_url?: string; error?: string }>(
      "/api/key/sub-qr",
      {
        method: "POST",
        body: JSON.stringify({ user_id: userId, key_id: keyId }),
      },
    );
  },

  getPromoHistory(userId: number, limit = 20) {
    return request<{ ok: boolean; items: import("@/types/api").PromoHistoryItem[] }>(
      `/api/promo/history?user_id=${userId}&limit=${limit}`,
    );
  },

  redeemGift(userId: number, token: string) {
    return request<{ ok: boolean; message?: string; key_id?: number; error?: string }>(
      "/api/gift/redeem",
      {
        method: "POST",
        body: JSON.stringify({ user_id: userId, token }),
      },
    );
  },

  getReferralStats(userId: number) {
    return request<import("@/types/api").ReferralStats>(
      `/api/referrals/stats?user_id=${userId}`,
    );
  },

  exportUserData(userId: number) {
    return request<{ ok: boolean; data?: Record<string, unknown>; error?: string }>(
      `/api/user/export?user_id=${userId}`,
    );
  },

  getOnboardingProgress(userId: number) {
    return request<{ ok: boolean; progress: import("@/types/api").OnboardingProgress }>(
      `/api/onboarding/progress?user_id=${userId}`,
    );
  },

  saveOnboardingProgress(userId: number, patch: Partial<import("@/types/api").OnboardingProgress>) {
    return request<{ ok: boolean; progress: import("@/types/api").OnboardingProgress }>(
      "/api/onboarding/progress",
      {
        method: "POST",
        body: JSON.stringify({ user_id: userId, ...patch }),
      },
    );
  },

  logout(userId: number) {
    return request<{ ok: boolean }>("/api/auth/logout", {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    });
  },

  uploadSupportAttachment(
    userId: number,
    ticketId: number,
    file: File,
  ) {
    return new Promise<{ ok: boolean; url?: string; error?: string }>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = async () => {
        const base64 = String(reader.result ?? "");
        try {
          const res = await request<{ ok: boolean; url?: string; error?: string }>(
            "/api/support/upload",
            {
              method: "POST",
              body: JSON.stringify({
                user_id: userId,
                ticket_id: ticketId,
                filename: file.name,
                content_base64: base64,
                mime_type: file.type,
              }),
            },
          );
          resolve(res);
        } catch (e) {
          reject(e);
        }
      };
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    });
  },

  emailLogin(email: string, password: string) {
    return request<{ ok: boolean; token?: string; error?: string }>(
      "/api/auth/email/login",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
    );
  },

  emailRegister(email: string, password: string) {
    return request<{ ok: boolean; token?: string; error?: string }>(
      "/api/auth/email/register",
      {
        method: "POST",
        body: JSON.stringify({ email, password }),
      },
    );
  },

  getDeviceTiers(userId: number, hostName: string) {
    return request<{
      ok: boolean;
      device_mode?: string;
      tiers?: { tier_id: number; device_count: number; price: number }[];
      tier_lock_extend?: number;
      base_device_count?: number;
      error?: string;
    }>("/api/device-tiers", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, host_name: hostName }),
    });
  },

  getKeyLiveStats(userId: number, keyId: number, hostName?: string) {
    return request<import("@/types/api").KeyLiveStats>("/api/key/live-stats", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, key_id: keyId, host_name: hostName }),
    });
  },

  getKeySwitchHosts(userId: number, keyId: number) {
    return request<{
      ok: boolean;
      current_host?: string;
      hosts?: { host_name: string; description?: string }[];
      error?: string;
    }>(`/api/key/switch-hosts?user_id=${userId}&key_id=${keyId}`);
  },

  switchKeyHost(userId: number, keyId: number, newHostName: string) {
    return request<{ ok: boolean; host_name?: string; error?: string }>(
      "/api/key/switch-host",
      {
        method: "POST",
        body: JSON.stringify({
          user_id: userId,
          key_id: keyId,
          new_host_name: newHostName,
        }),
      },
    );
  },

  setKeyFreeze(userId: number, keyId: number, freeze: boolean) {
    return request<{ ok: boolean; is_frozen?: boolean; error?: string }>(
      "/api/key/freeze",
      {
        method: "POST",
        body: JSON.stringify({ user_id: userId, key_id: keyId, freeze }),
      },
    );
  },

  getPendingPayment(userId: number) {
    return request<{ ok: boolean; pending: import("@/types/api").PendingPayment | null }>(
      `/api/payment/pending?user_id=${userId}`,
    );
  },

  resumePayment(userId: number, paymentId?: string) {
    return request<{
      ok: boolean;
      payment_url?: string;
      payment_id?: string;
      price?: number;
      action_label?: string;
      error?: string;
    }>("/api/payment/resume", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, payment_id: paymentId }),
    });
  },

  transferReferralBalance(userId: number, amount?: number) {
    return request<{
      ok: boolean;
      transferred?: number;
      referral_balance?: number;
      balance?: number;
      error?: string;
    }>("/api/referrals/transfer", {
      method: "POST",
      body: JSON.stringify({ user_id: userId, amount }),
    });
  },

  requestReferralWithdraw(userId: number) {
    return request<{ ok: boolean; amount?: number; message?: string; error?: string }>(
      "/api/referrals/withdraw-request",
      {
        method: "POST",
        body: JSON.stringify({ user_id: userId }),
      },
    );
  },

  agreeTerms(userId: number) {
    return request<{ ok: boolean; error?: string }>("/api/user/terms/agree", {
      method: "POST",
      body: JSON.stringify({ user_id: userId }),
    });
  },
};

export { ApiError };
