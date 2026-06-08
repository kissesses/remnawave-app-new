import type { LucideIcon } from "lucide-react";
import {
  Bell,
  CreditCard,
  Gift,
  KeyRound,
  MessageCircle,
  Megaphone,
  Shield,
  ShieldOff,
  Tag,
  UserPlus,
  Users,
  Wallet,
  Sparkles,
} from "lucide-react";
import type { ActivityTimelineCategory, ActivityTimelineEvent } from "@/types/api";
import { formatDateGroup, formatTime } from "@/lib/utils";

export const ACTIVITY_FILTERS: { id: ActivityTimelineCategory; label: string }[] = [
  { id: "all", label: "Все" },
  { id: "payments", label: "Платежи" },
  { id: "balance", label: "Баланс" },
  { id: "keys", label: "Ключи" },
  { id: "support", label: "Поддержка" },
  { id: "referral", label: "Рефералы" },
  { id: "system", label: "Система" },
];

const KIND_ICONS: Record<string, LucideIcon> = {
  registration: Sparkles,
  trial: Gift,
  payment: CreditCard,
  balance: Wallet,
  promo: Tag,
  key_created: KeyRound,
  key_expired: ShieldOff,
  support_ticket: MessageCircle,
  support_message: MessageCircle,
  broadcast: Megaphone,
  referral_join: UserPlus,
  referral_invite: Users,
  referral_bonus: Gift,
  ban: Shield,
};

const ACCENT_STYLES: Record<string, { dot: string; glow: string; icon: string }> = {
  blue: { dot: "bg-primary", glow: "shadow-[0_0_12px_rgba(var(--lb-blue),0.45)]", icon: "text-primary" },
  green: { dot: "bg-success", glow: "shadow-[0_0_12px_rgba(34,197,94,0.35)]", icon: "text-success" },
  orange: { dot: "bg-accent", glow: "shadow-[0_0_12px_rgba(var(--lb-blue),0.25)]", icon: "text-accent" },
  cyan: { dot: "bg-primary", glow: "shadow-[0_0_12px_rgba(var(--lb-blue),0.35)]", icon: "text-primary" },
  red: { dot: "bg-destructive", glow: "shadow-[0_0_12px_rgba(239,68,68,0.35)]", icon: "text-destructive" },
  yellow: { dot: "bg-warning", glow: "shadow-[0_0_12px_rgba(234,179,8,0.35)]", icon: "text-warning" },
  purple: { dot: "bg-accent", glow: "shadow-[0_0_12px_rgba(168,85,247,0.35)]", icon: "text-accent" },
  pink: { dot: "bg-primary", glow: "shadow-[0_0_12px_rgba(var(--lb-blue),0.3)]", icon: "text-primary" },
  violet: { dot: "bg-accent", glow: "shadow-[0_0_12px_rgba(139,92,246,0.35)]", icon: "text-accent" },
  gray: { dot: "bg-muted-foreground", glow: "", icon: "text-muted-foreground" },
};

export function getActivityIcon(kind: string): LucideIcon {
  return KIND_ICONS[kind] ?? Bell;
}

export function getActivityAccent(accent: string) {
  return ACCENT_STYLES[accent] ?? ACCENT_STYLES.gray;
}

export function formatActivityDay(day: string): string {
  if (!day || day === "—") return "Без даты";
  return formatDateGroup(`${day} 12:00:00`);
}

export function formatActivityTime(ts: string): string {
  return formatTime(ts) || "";
}

export function formatActivityAmount(event: ActivityTimelineEvent): string | null {
  if (event.amount == null || Number.isNaN(Number(event.amount))) return null;
  const n = Math.abs(Number(event.amount));
  const formatted = `${n.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽`;
  if (event.amount_signed) {
    const signed = Number(event.amount);
    if (signed > 0) return `+${formatted}`;
    if (signed < 0) return `−${formatted}`;
  }
  return formatted;
}
