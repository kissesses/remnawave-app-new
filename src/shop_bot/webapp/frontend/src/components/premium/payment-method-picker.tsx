import { motion } from "framer-motion";
import {
  CreditCard,
  Wallet,
  Bitcoin,
  Star,
  Smartphone,
} from "lucide-react";
import { cn, formatMoney } from "@/lib/utils";
import type { PaymentMethod } from "@/hooks/use-payment-flow";

const iconMap: Record<string, typeof CreditCard> = {
  pay_balance: Wallet,
  pay_yookassa: CreditCard,
  pay_cryptobot: Bitcoin,
  pay_heleket: Bitcoin,
  pay_stars: Star,
  pay_tonconnect: Smartphone,
  pay_yoomoney: Wallet,
  pay_platega: CreditCard,
  pay_platega_payform: CreditCard,
  pay_platega_crypto: Bitcoin,
};

export function PaymentMethodPicker({
  methods,
  selected,
  onSelect,
  balance,
}: {
  methods: PaymentMethod[];
  selected: string | null;
  onSelect: (id: string) => void;
  balance?: number;
}) {
  if (!methods.length) {
    return <p className="text-sm text-muted-foreground py-2">Нет способов оплаты</p>;
  }

  return (
    <div className="grid gap-2">
      {methods.map((m, i) => {
        const Icon = iconMap[m.id] ?? CreditCard;
        const active = selected === m.id;
        const isBalance = m.id === "pay_balance";
        return (
          <motion.button
            key={m.id}
            type="button"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.04 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect(m.id)}
            className={cn(
              "flex items-center gap-3 rounded-2xl border p-4 text-left transition-colors",
              active
                ? "border-primary bg-primary/10 shadow-[0_0_0_1px_hsl(var(--primary)/0.3)]"
                : "border-border/50 bg-card/50",
            )}
          >
            <div
              className={cn(
                "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                active ? "bg-primary/20 text-primary" : "bg-secondary text-muted-foreground",
              )}
            >
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-semibold text-sm">{m.name}</div>
              {isBalance && balance !== undefined && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  Доступно {formatMoney(balance)}
                </div>
              )}
            </div>
            {active && (
              <div className="h-5 w-5 rounded-full bg-primary flex items-center justify-center">
                <div className="h-2 w-2 rounded-full bg-white" />
              </div>
            )}
          </motion.button>
        );
      })}
    </div>
  );
}
