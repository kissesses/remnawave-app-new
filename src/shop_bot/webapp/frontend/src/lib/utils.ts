import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatMoney(amount: number, currency = "₽"): string {
  const n = Number(amount) || 0;
  return `${n.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ${currency}`;
}

function parseAppDate(dateStr: string): Date | null {
  const raw = dateStr?.trim();
  if (!raw) return null;

  const candidates = [raw.replace(" ", "T"), raw];
  for (const value of candidates) {
    const d = new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return null;
}

export function formatDate(dateStr: string): string {
  const d = parseAppDate(dateStr);
  if (!d) return dateStr || "";
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatTime(dateStr: string): string {
  const d = parseAppDate(dateStr);
  if (!d) return "";
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export function formatDateGroup(dateStr: string): string {
  try {
    const d = parseAppDate(dateStr);
    if (!d) return dateStr;
    const today = new Date();
    const yesterday = new Date();
    yesterday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) return "Сегодня";
    if (d.toDateString() === yesterday.toDateString()) return "Вчера";
    return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
  } catch {
    return dateStr || "";
  }
}
