import { motion } from "framer-motion";
import { Check } from "lucide-react";
import { GlassCard } from "@/components/stealthx/GlassCard";
import { NeonButton } from "@/components/stealthx/NeonButton";
import { SectionShell } from "@/components/stealthx/SectionShell";
import { cn } from "@/lib/utils";

const PLANS = [
  {
    id: "basic",
    name: "Basic",
    price: 4.99,
    popular: false,
    features: ["Безлимитный трафик", "Все страны", "Kill Switch", "AES-256"],
  },
  {
    id: "pro",
    name: "Pro",
    price: 8.99,
    popular: true,
    features: ["Безлимитный трафик", "Все страны", "Kill Switch", "AES-256"],
  },
  {
    id: "ultimate",
    name: "Ultimate",
    price: 12.99,
    popular: false,
    features: ["Безлимитный трафик", "Все страны", "Kill Switch", "AES-256"],
  },
];

export function PricingSection() {
  return (
    <SectionShell id="pricing" subtitle="Тарифы" title="Выберите свой план">
      <div className="grid gap-6 md:grid-cols-3">
        {PLANS.map((plan, i) => (
          <motion.div
            key={plan.id}
            initial={{ opacity: 0, y: 32 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
          >
            <GlassCard
              className={cn(
                "relative flex h-full flex-col p-8 transition-all duration-300",
                plan.popular && "sx-neon-border scale-[1.02] shadow-neon-lg",
              )}
              neon={plan.popular}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-stealthx-accent px-4 py-1 text-xs font-bold uppercase tracking-wider text-white">
                  Популярный
                </span>
              )}
              <h3 className="text-xl font-bold text-stealthx-text">{plan.name}</h3>
              <div className="my-6">
                <span className="text-4xl font-bold text-stealthx-text">${plan.price}</span>
                <span className="text-stealthx-muted">/мес</span>
              </div>
              <ul className="mb-8 flex-1 space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-center gap-2 text-sm text-stealthx-muted">
                    <Check className="h-4 w-4 shrink-0 text-stealthx-success" />
                    {f}
                  </li>
                ))}
              </ul>
              <NeonButton variant={plan.popular ? "primary" : "outline"} className="w-full">
                Выбрать
              </NeonButton>
            </GlassCard>
          </motion.div>
        ))}
      </div>
    </SectionShell>
  );
}
