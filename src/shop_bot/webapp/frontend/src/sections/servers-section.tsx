import { lazy, Suspense } from "react";
import { motion } from "framer-motion";
import { LayoutGrid, Signal } from "lucide-react";
import { GlassCard } from "@/components/stealthx/GlassCard";
import { NeonButton } from "@/components/stealthx/NeonButton";
import { SectionShell } from "@/components/stealthx/SectionShell";

const GlobeView = lazy(() =>
  import("@/components/stealthx/GlobeView").then((m) => ({ default: m.GlobeView })),
);

const SERVERS = [
  { country: "USA", flag: "🇺🇸", ping: 24, load: 32, status: "online" },
  { country: "Germany", flag: "🇩🇪", ping: 18, load: 45, status: "online" },
  { country: "Netherlands", flag: "🇳🇱", ping: 12, load: 28, status: "online" },
  { country: "Singapore", flag: "🇸🇬", ping: 89, load: 51, status: "online" },
  { country: "Japan", flag: "🇯🇵", ping: 112, load: 38, status: "online" },
  { country: "France", flag: "🇫🇷", ping: 22, load: 41, status: "online" },
];

function SignalBars({ strength }: { strength: number }) {
  const bars = 4;
  const active = Math.ceil((strength / 100) * bars);
  return (
    <div className="flex items-end gap-0.5">
      {Array.from({ length: bars }).map((_, i) => (
        <div
          key={i}
          className="w-1 rounded-sm bg-stealthx-success"
          style={{
            height: `${(i + 1) * 3 + 2}px`,
            opacity: i < active ? 1 : 0.25,
          }}
        />
      ))}
    </div>
  );
}

export function ServersSection() {
  return (
    <SectionShell id="servers" subtitle="Инфраструктура" title="Серверы по всему миру">
      <GlassCard elevated className="overflow-hidden p-6 md:p-8">
        <div className="grid gap-8 lg:grid-cols-2 lg:gap-12">
          <div>
            <div className="space-y-3">
              {SERVERS.map((s, i) => (
                <motion.div
                  key={s.country}
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.08 }}
                  className="sx-glass flex items-center justify-between rounded-xl px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-2xl">{s.flag}</span>
                    <div>
                      <p className="font-semibold text-stealthx-text">{s.country}</p>
                      <p className="text-xs text-stealthx-muted">Нагрузка {s.load}%</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-sm text-stealthx-success">{s.ping} ms</span>
                    <SignalBars strength={100 - s.load} />
                  </div>
                </motion.div>
              ))}
            </div>
            <NeonButton variant="outline" size="sm" className="mt-6 w-full sm:w-auto">
              <LayoutGrid className="h-4 w-4" />
              Показать все серверы
            </NeonButton>
          </div>

          <div className="relative min-h-[320px] lg:min-h-[400px]">
            <Suspense
              fallback={
                <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl bg-stealthx-card/50">
                  <div className="h-48 w-48 animate-pulse rounded-full bg-stealthx-accent/20" />
                </div>
              }
            >
              <GlobeView />
            </Suspense>
            <div className="absolute bottom-4 right-4 sx-glass rounded-xl px-4 py-2">
              <p className="flex items-center gap-2 text-sm text-stealthx-muted">
                <Signal className="h-4 w-4 text-stealthx-accent" />
                100+ стран, 3000+ серверов
              </p>
            </div>
          </div>
        </div>
      </GlassCard>
    </SectionShell>
  );
}
