export interface BootstrapData {
  userId: number;
  tgFullscreen?: boolean;
  branding: {
    welcome_text?: string;
    accent_color?: string;
    logo?: string;
    icon?: string;
    title?: string;
  };
}

export interface VpnKey {
  key_id: number;
  name: string;
  expire_date_str: string;
  days_left: number;
  percent_str: string;
  sub_url: string;
  remaining_str: string;
  created_date_str: string;
  elapsed_str: string;
  traffic_info: string;
  hwid_info: string;
  status_text: string;
  status_color: string;
  status_bg: string;
  comment_key: string;
  host_name: string;
}

export interface UserStatus {
  ok: boolean;
  keys: VpnKey[];
  balance: number;
  trial_used: boolean;
  trial_available: boolean;
  referral_count: number;
  referral_earned: number;
  referral_link: string;
  error?: string;
}

export interface CabinetConfig {
  ok: boolean;
  modules: {
    trial: boolean;
    referrals: boolean;
    howto: boolean;
    topup: boolean;
    promo: boolean;
    support: boolean;
  };
  module_order: string[];
  content_overrides: Record<string, string>;
  branding: { welcome_text: string; accent_color: string };
  trial: {
    enabled: boolean;
    available: boolean;
    used: boolean;
    duration_days: number;
    hosts: { host_name: string; label?: string }[];
  };
  howto: {
    intro: string;
    android: string;
    ios: string;
    windows: string;
    linux: string;
  };
  referrals: {
    enabled: boolean;
    link: string;
    count: number;
    earned: number;
  };
  topup: { min: number; max: number; enabled: boolean };
  balance: number;
  error?: string;
}

export interface Transaction {
  id: number | string;
  payment_id: string;
  date: string;
  amount: number;
  status: string;
  success: boolean;
  label: string;
  method: string;
}

export interface PaymentHistory {
  ok: boolean;
  payments: Transaction[];
  balance: Transaction[];
  error?: string;
}

export interface Notification {
  id: string;
  type: "subscription" | "payment" | "support" | "referral" | "system";
  title: string;
  body: string;
  date: string;
  read: boolean;
}

export interface UserPreferences {
  theme: "system" | "light" | "dark";
  notify_payments: boolean;
  notify_subscription: boolean;
  notify_support: boolean;
  notify_referral: boolean;
}

export interface ShopPlan {
  plan_id: number;
  months: number;
  price: number;
  label: string;
  description?: string;
}

export interface ShopHost {
  host_name: string;
  plans: ShopPlan[];
}

export interface PurchaseCatalog {
  ok: boolean;
  hosts: ShopHost[];
  error?: string;
}

export interface RenewCatalog {
  ok: boolean;
  keys: { key_id: number; name: string; host_name: string; expire_date_str: string }[];
  plans_by_key: Record<string, ShopPlan[]>;
  error?: string;
}

export interface SupportMessage {
  sender: string;
  content: string;
  created_at: string;
}

export interface SupportTicketSummary {
  ticket_id: number;
  subject: string;
  status: string;
  updated_at: string;
  message_count: number;
}

export interface SupportStatus {
  ok: boolean;
  has_ticket: boolean;
  ticket_id?: number;
  subject?: string;
  status?: string;
  can_send?: boolean;
  tickets?: SupportTicketSummary[];
  messages?: SupportMessage[];
  error?: string;
}

export interface PaymentMethod {
  id: string;
  label: string;
  icon?: string;
}
