import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GlassCard } from "@/components/stealthx/GlassCard";
import { SectionShell } from "@/components/stealthx/SectionShell";

const TESTIMONIALS = [
  {
    name: "Алексей К.",
    role: "Разработчик",
    text: "STEALTHX — лучший VPN, который я использовал. Скорость невероятная, интерфейс премиальный.",
  },
  {
    name: "Мария С.",
    role: "Дизайнер",
    text: "Наконец VPN, который не тормозит. Подключаюсь за секунду, работает стабильно весь день.",
  },
  {
    name: "Дмитрий В.",
    role: "Предприниматель",
    text: "Полная анонимность и обход любых блокировок. Рекомендую всем, кто ценит приватность.",
  },
];

export function TestimonialsSection() {
  const [active, setActive] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setActive((a) => (a + 1) % TESTIMONIALS.length);
    }, 5000);
    return () => clearInterval(id);
  }, []);

  return (
    <SectionShell subtitle="Отзывы" title="Что говорят пользователи">
      <div className="relative mx-auto max-w-2xl">
        <AnimatePresence mode="wait">
          <motion.div
            key={active}
            initial={{ opacity: 0, x: 40 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -40 }}
            transition={{ duration: 0.4 }}
          >
            <GlassCard className="p-8">
              <p className="mb-6 text-lg italic text-stealthx-text/90">
                &ldquo;{TESTIMONIALS[active].text}&rdquo;
              </p>
              <div>
                <p className="font-semibold text-stealthx-text">{TESTIMONIALS[active].name}</p>
                <p className="text-sm text-stealthx-muted">{TESTIMONIALS[active].role}</p>
              </div>
            </GlassCard>
          </motion.div>
        </AnimatePresence>
        <div className="mt-6 flex justify-center gap-2">
          {TESTIMONIALS.map((_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className={`h-2 rounded-full transition-all ${
                i === active ? "w-8 bg-stealthx-accent" : "w-2 bg-white/20"
              }`}
              aria-label={`Отзыв ${i + 1}`}
            />
          ))}
        </div>
      </div>
    </SectionShell>
  );
}
