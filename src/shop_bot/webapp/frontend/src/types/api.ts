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

export interface UserProfileSummary {
  username: string;
  registration_date: string;
  total_spent: number;
  active_keys: number;
  total_keys: number;
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
  profile?: UserProfileSummary;
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
  support_info?: SupportInfo;
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

export type NotificationType =
  | "purchase"
  | "renew"
  | "topup"
  | "balance_pay"
  | "subscription_expiring"
  | "subscription_expired"
  | "promo"
  | "promo_campaign"
  | "trial"
  | "support"
  | "referral"
  | "referral_signup"
  | "key_issued"
  | "traffic_warning"
  | "device_limit"
  | "payment_failed"
  | "payment"
  | "subscription"
  | "system";

export type NotificationCategory =
  | "payments"
  | "subscription"
  | "promo"
  | "support"
  | "system";

export type NotificationSeverity = "success" | "warning" | "info";

export interface Notification {
  id: string;
  type: NotificationType;
  category: NotificationCategory;
  severity?: NotificationSeverity;
  title: string;
  body: string;
  date: string;
  read: boolean;
  href?: string;
  amount?: number;
  cta_label?: string;
}

export interface UserPreferences {
  theme: "system" | "light" | "dark";
  notify_payments: boolean;
  notify_subscription: boolean;
  notify_support: boolean;
  notify_referral: boolean;
  notify_promo: boolean;
  notify_toast: boolean;
  haptic_enabled: boolean;
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
  created_at?: string;
  updated_at: string;
  closed_at?: string;
  message_count: number;
  last_sender?: string;
  has_unread?: boolean;
  can_reopen?: boolean;
  reopen_deadline_at?: string;
}

export interface SupportFaqItem {
  id: string;
  question: string;
  answer: string;
}

export interface SupportCategory {
  id: string;
  label: string;
}

export interface SupportInfo {
  enabled: boolean;
  bot_username: string;
  intro: string;
  hours: string;
  categories: SupportCategory[];
  faq: SupportFaqItem[];
}

export interface SupportStatus {
  ok: boolean;
  has_ticket: boolean;
  ticket_id?: number;
  subject?: string;
  status?: string;
  can_send?: boolean;
  can_reopen?: boolean;
  reopen_deadline_at?: string;
  has_unread?: boolean;
  unread_count?: number;
  tickets?: SupportTicketSummary[];
  messages?: SupportMessage[];
  error?: string;
}

export interface PaymentMethod {
  id: string;
  label: string;
  icon?: string;
}

export type ActivityTimelineCategory =
  | "all"
  | "payments"
  | "balance"
  | "keys"
  | "support"
  | "referral"
  | "system";

export interface ActivityTimelineEvent {
  id: string;
  kind: string;
  category: ActivityTimelineCategory;
  accent: string;
  ts: string;
  day: string;
  title: string;
  subtitle: string;
  description: string;
  amount?: number | null;
  amount_signed?: boolean;
  status_label?: string;
  badges: string[];
  href?: string | null;
  key_id?: number;
  ticket_id?: number;
}

export interface ActivityTimelineDay {
  day: string;
  events: ActivityTimelineEvent[];
}

export interface ActivityTimelineResponse {
  ok: boolean;
  categories: { id: ActivityTimelineCategory; label: string }[];
  stats: {
    total_events: number;
    payments_count: number;
    payments_sum: number;
    support_tickets: number;
    total_spent: number;
    referral_count: number;
  };
  category_counts: Partial<Record<ActivityTimelineCategory, number>>;
  events: ActivityTimelineEvent[];
  days: ActivityTimelineDay[];
  total: number;
  offset: number;
  limit: number;
  has_more: boolean;
  error?: string;
}
