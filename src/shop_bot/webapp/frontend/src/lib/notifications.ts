import type { LucideIcon } from "lucide-react";
import {
  Bell,
  CreditCard,
  Gift,
  KeyRound,
  Megaphone,
  MessageCircle,
  RefreshCw,
  Shield,
  ShieldAlert,
  ShieldOff,
  Smartphone,
  Tag,
  UserPlus,
  Users,
  Wallet,
  Wifi,
  XCircle,
} from "lucide-react";
import type { Notification, NotificationCategory, NotificationType } from "@/types/api";

export interface NotificationMeta {
  icon: LucideIcon;
  accentClass: string;
  filterLabel: string;
}

export const NOTIFICATION_FILTERS: { id: NotificationCategory | "all"; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "payments", label: "Платежи" },
  { id: "subscription", label: "Подписка" },
  { id: "promo", label: "Промо" },
  { id: "support", label: "Поддержка" },
  { id: "system", label: "Система" },
];

const TYPE_META: Record<NotificationType, NotificationMeta> = {
  purchase: {
    icon: KeyRound,
    accentClass: "bg-primary/15 text-primary",
    filterLabel: "Покупка",
  },
  renew: {
    icon: RefreshCw,
    accentClass: "bg-success/15 text-success",
    filterLabel: "Продление",
  },
  topup: {
    icon: Wallet,
    accentClass: "bg-accent/15 text-accent",
    filterLabel: "Пополнение",
  },
  balance_pay: {
    icon: CreditCard,
    accentClass: "bg-primary/15 text-primary",
    filterLabel: "С баланса",
  },
  subscription_expiring: {
    icon: ShieldAlert,
    accentClass: "bg-warning/15 text-warning",
    filterLabel: "Истекает",
  },
  subscription_expired: {
    icon: ShieldOff,
    accentClass: "bg-destructive/15 text-destructive",
    filterLabel: "Истекла",
  },
  promo: {
    icon: Tag,
    accentClass: "bg-accent/15 text-accent",
    filterLabel: "Промокод",
  },
  promo_campaign: {
    icon: Megaphone,
    accentClass: "bg-primary/15 text-primary",
    filterLabel: "Акция",
  },
  key_issued: {
    icon: KeyRound,
    accentClass: "bg-success/15 text-success",
    filterLabel: "Новый ключ",
  },
  traffic_warning: {
    icon: Wifi,
    accentClass: "bg-warning/15 text-warning",
    filterLabel: "Трафик",
  },
  referral_signup: {
    icon: UserPlus,
    accentClass: "bg-success/15 text-success",
    filterLabel: "Реферал",
  },
  trial: {
    icon: Gift,
    accentClass: "bg-success/15 text-success",
    filterLabel: "Триал",
  },
  support: {
    icon: MessageCircle,
    accentClass: "bg-primary/15 text-primary",
    filterLabel: "Поддержка",
  },
  referral: {
    icon: Users,
    accentClass: "bg-accent/15 text-accent",
    filterLabel: "Реферал",
  },
  device_limit: {
    icon: Smartphone,
    accentClass: "bg-warning/15 text-warning",
    filterLabel: "Устройства",
  },
  payment_failed: {
    icon: XCircle,
    accentClass: "bg-destructive/15 text-destructive",
    filterLabel: "Ошибка",
  },
  payment: {
    icon: CreditCard,
    accentClass: "bg-primary/15 text-primary",
    filterLabel: "Платёж",
  },
  subscription: {
    icon: Shield,
    accentClass: "bg-warning/15 text-warning",
    filterLabel: "Подписка",
  },
  system: {
    icon: Bell,
    accentClass: "bg-secondary text-muted-foreground",
    filterLabel: "Система",
  },
};

export function getNotificationMeta(type: NotificationType): NotificationMeta {
  return TYPE_META[type] ?? TYPE_META.system;
}

export function filterNotifications(
  items: Notification[],
  category: NotificationCategory | "all",
): Notification[] {
  if (category === "all") return items;
  return items.filter((n) => n.category === category);
}

const TOAST_PRIORITY: NotificationType[] = [
  "subscription_expired",
  "subscription_expiring",
  "payment_failed",
  "support",
  "traffic_warning",
  "device_limit",
  "key_issued",
  "purchase",
  "promo_campaign",
  "promo",
  "renew",
  "topup",
  "referral_signup",
  "referral",
  "trial",
  "payment",
  "subscription",
  "balance_pay",
  "system",
];

export function pickTopUnreadNotification(items: Notification[]): Notification | null {
  const unread = items.filter((n) => !n.read);
  if (!unread.length) return null;
  for (const type of TOAST_PRIORITY) {
    const hit = unread.find((n) => n.type === type);
    if (hit) return hit;
  }
  return unread[0];
}

export function groupNotificationsByDay(items: Notification[]): { label: string; items: Notification[] }[] {
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const startOfYesterday = new Date(startOfToday);
  startOfYesterday.setDate(startOfYesterday.getDate() - 1);

  const buckets = new Map<string, Notification[]>();
  const order: string[] = [];

  for (const item of items) {
    const d = new Date(item.date.replace(" ", "T"));
    let label = "Ранее";
    if (!Number.isNaN(d.getTime())) {
      if (d >= startOfToday) label = "Сегодня";
      else if (d >= startOfYesterday) label = "Вчера";
      else label = d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
    }
    if (!buckets.has(label)) {
      buckets.set(label, []);
      order.push(label);
    }
    buckets.get(label)!.push(item);
  }

  return order.map((label) => ({ label, items: buckets.get(label)! }));
}
