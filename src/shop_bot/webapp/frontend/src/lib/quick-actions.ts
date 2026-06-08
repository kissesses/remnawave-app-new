import type { LucideIcon } from "lucide-react";
import {
  ShoppingCart,
  RefreshCw,
  Settings2,
  Gift,
  Wallet,
  Users,
  Tag,
  Headphones,
} from "lucide-react";
import type { CabinetConfig } from "@/types/api";

export interface QuickAction {
  id: string;
  icon: LucideIcon;
  label: string;
  onClick: () => void;
}

export interface QuickActionCallbacks {
  onBuy: () => void;
  onRenew: () => void;
  onTrial: () => void;
  onReferrals: () => void;
  onHowto: () => void;
  onTopup: () => void;
  onPromo: () => void;
  onSupport: () => void;
}

const MODULE_ACTIONS: Record<
  string,
  (cb: QuickActionCallbacks, config: CabinetConfig | undefined) => QuickAction | null
> = {
  trial: (cb, config) =>
    config?.trial?.available
      ? { id: "trial", icon: Gift, label: "Пробный", onClick: cb.onTrial }
      : null,
  referrals: (cb, config) =>
    config?.referrals?.enabled
      ? { id: "referrals", icon: Users, label: "Рефералы", onClick: cb.onReferrals }
      : null,
  howto: (cb, config) =>
    config?.modules?.howto !== false
      ? { id: "howto", icon: Settings2, label: "Настроить", onClick: cb.onHowto }
      : null,
  topup: (cb, config) =>
    config?.modules?.topup
      ? { id: "topup", icon: Wallet, label: "Кошелёк", onClick: cb.onTopup }
      : null,
  promo: (cb, config) =>
    config?.modules?.promo
      ? { id: "promo", icon: Tag, label: "Промо", onClick: cb.onPromo }
      : null,
  support: (cb, config) =>
    config?.modules?.support
      ? { id: "support", icon: Headphones, label: "Поддержка", onClick: cb.onSupport }
      : null,
};

export function buildQuickActions(
  config: CabinetConfig | undefined,
  callbacks: QuickActionCallbacks,
): QuickAction[] {
  const core: QuickAction[] = [
    { id: "buy", icon: ShoppingCart, label: "Купить", onClick: callbacks.onBuy },
    { id: "renew", icon: RefreshCw, label: "Продлить", onClick: callbacks.onRenew },
  ];

  const order = config?.module_order ?? ["trial", "referrals", "howto", "topup", "promo", "support"];
  const ordered = order
    .map((id) => MODULE_ACTIONS[id]?.(callbacks, config))
    .filter((a): a is QuickAction => a !== null);

  return [...core, ...ordered];
}
