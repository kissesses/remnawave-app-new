import { motion } from "framer-motion";
import { Zap, Shield, EyeOff, Globe } from "lucide-react";
import { GlassCard } from "@/components/stealthx/GlassCard";
import { SectionShell } from "@/components/stealthx/SectionShell";

const FEATURES = [
  {
    icon: Zap,
    title: "Максимальная скорость",
    desc: "Высокоскоростные серверы по всему миру.",
  },
  {
    icon: Shield,
    title: "Полная безопасность",
    desc: "AES-256 Encryption.",
  },
  {
    icon: EyeOff,
    title: "Анонимность",
    desc: "Полное отсутствие логов.",
  },
  {
    icon: Globe,
    title: "Доступ к контенту",
    desc: "Обход блокировок и цензуры.",
  },
];

const container = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.12 },
  },
};

const item = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.5 } },
};

export function FeaturesSection() {
  return (
    <SectionShell id="features" subtitle="Преимущества" title="Почему STEALTHX">
      <motion.div
        variants={container}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: "-60px" }}
        className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
      >
        {FEATURES.map((f) => (
          <motion.div key={f.title} variants={item}>
            <GlassCard className="group h-full p-6 transition-all duration-300 hover:sx-neon-border">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-stealthx-accent/20 text-stealthx-accent transition-colors group-hover:bg-stealthx-accent/30">
                <f.icon className="h-6 w-6" />
              </div>
              <h3 className="mb-2 text-lg font-bold text-stealthx-text">{f.title}</h3>
              <p className="text-sm text-stealthx-muted">{f.desc}</p>
            </GlassCard>
          </motion.div>
        ))}
      </motion.div>
    </SectionShell>
  );
}
