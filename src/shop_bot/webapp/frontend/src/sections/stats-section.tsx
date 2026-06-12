import { motion } from "framer-motion";
import { AnimatedCounter } from "@/components/stealthx/AnimatedCounter";
import { SectionShell } from "@/components/stealthx/SectionShell";

const STATS = [
  { value: 100, suffix: "+", label: "Стран" },
  { value: 3000, suffix: "+", label: "Серверов" },
  { value: 10, suffix: "M+", label: "Подключений", prefix: "" },
  { value: 99.99, suffix: "%", label: "Uptime", decimals: 2 },
];

export function StatsSection() {
  return (
    <SectionShell className="sx-glass-elevated py-16">
      <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
        {STATS.map((stat, i) => (
          <motion.div
            key={stat.label}
            initial={{ opacity: 0, scale: 0.9 }}
            whileInView={{ opacity: 1, scale: 1 }}
            viewport={{ once: true }}
            transition={{ delay: i * 0.1 }}
            className="text-center"
          >
            <p className="text-3xl font-bold text-stealthx-text md:text-4xl lg:text-5xl">
              <AnimatedCounter
                value={stat.value}
                suffix={stat.suffix}
                prefix={stat.prefix}
                decimals={stat.decimals}
              />
            </p>
            <p className="mt-2 text-sm text-stealthx-muted">{stat.label}</p>
          </motion.div>
        ))}
      </div>
    </SectionShell>
  );
}
