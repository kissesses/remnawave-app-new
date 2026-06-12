import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Power } from "lucide-react";
import { GlassCard } from "@/components/stealthx/GlassCard";
import { cn } from "@/lib/utils";

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  return [h, m, s].map((v) => String(v).padStart(2, "0")).join(":");
}

export function VpnWidget() {
  const [connected, setConnected] = useState(true);
  const [elapsed, setElapsed] = useState(765);

  useEffect(() => {
    if (!connected) return;
    const id = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => clearInterval(id);
  }, [connected]);

  return (
    <section className="relative -mt-8 px-4 pb-8 md:px-8">
      <div className="mx-auto max-w-md">
        <motion.div
          animate={{ y: [0, -8, 0] }}
          transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        >
          <GlassCard elevated className="p-5 shadow-neon">
            <div className="flex items-center justify-between gap-4">
              <div className="flex-1">
                <p
                  className={cn(
                    "text-xs font-bold uppercase tracking-widest",
                    connected ? "text-stealthx-success" : "text-stealthx-danger",
                  )}
                >
                  {connected ? "Соединение" : "Отключено"}
                </p>
                <p className="mt-1 text-lg font-semibold text-stealthx-text">Netherlands</p>
                <p className="mt-0.5 font-mono text-2xl text-stealthx-muted">
                  {formatTime(elapsed)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setConnected(!connected)}
                className={cn(
                  "flex h-16 w-16 items-center justify-center rounded-full transition-all duration-300",
                  connected
                    ? "bg-stealthx-success/20 text-stealthx-success shadow-[0_0_30px_rgba(34,197,94,0.4)]"
                    : "bg-stealthx-danger/20 text-stealthx-danger shadow-[0_0_30px_rgba(239,68,68,0.4)]",
                )}
                aria-label={connected ? "Отключить VPN" : "Подключить VPN"}
              >
                <Power className="h-8 w-8" />
              </button>
            </div>
          </GlassCard>
        </motion.div>
      </div>
    </section>
  );
}
