import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { GlassCard } from "@/components/stealthx/GlassCard";
import { SectionShell } from "@/components/stealthx/SectionShell";
import { cn } from "@/lib/utils";

const FAQ_ITEMS = [
  {
    q: "Что такое STEALTHX?",
    a: "STEALTHX — премиальный VPN-сервис нового поколения с фокусом на анонимность, скорость и безопасность.",
  },
  {
    q: "Храните ли вы логи активности?",
    a: "Нет. Мы придерживаемся строгой политики no-logs. Ваша активность не записывается и не хранится.",
  },
  {
    q: "Сколько устройств можно подключить?",
    a: "Количество устройств зависит от тарифа. Basic — 3, Pro — 6, Ultimate — без ограничений.",
  },
  {
    q: "Какие протоколы шифрования используются?",
    a: "AES-256 для шифрования данных, WireGuard и OpenVPN для туннелирования.",
  },
  {
    q: "Есть ли пробный период?",
    a: "Да, мы предлагаем 7-дневный пробный период для всех новых пользователей.",
  },
];

export function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <SectionShell id="faq" subtitle="FAQ" title="Частые вопросы">
      <div className="mx-auto max-w-2xl space-y-3">
        {FAQ_ITEMS.map((item, i) => (
          <GlassCard key={item.q} className="overflow-hidden">
            <button
              type="button"
              onClick={() => setOpen(open === i ? null : i)}
              className="flex w-full items-center justify-between px-6 py-4 text-left"
            >
              <span className="font-semibold text-stealthx-text">{item.q}</span>
              <ChevronDown
                className={cn(
                  "h-5 w-5 shrink-0 text-stealthx-muted transition-transform duration-300",
                  open === i && "rotate-180",
                )}
              />
            </button>
            <AnimatePresence initial={false}>
              {open === i && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="overflow-hidden"
                >
                  <p className="border-t border-white/5 px-6 py-4 text-sm text-stealthx-muted">
                    {item.a}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </GlassCard>
        ))}
      </div>
    </SectionShell>
  );
}
