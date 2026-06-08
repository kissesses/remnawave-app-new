import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Smartphone, Monitor, Apple, Terminal, Download, Link2, Play } from "lucide-react";
import { Header } from "@/components/layout/header";
import { SectionHeader } from "@/components/premium/section-header";
import { useCabinetConfig } from "@/hooks/use-cabinet";
import { Skeleton } from "@/components/ui/skeleton";

const platforms = [
  { id: "android", label: "Android", icon: Smartphone },
  { id: "ios", label: "iOS", icon: Apple },
  { id: "windows", label: "Windows", icon: Monitor },
  { id: "linux", label: "Linux", icon: Terminal },
] as const;

const steps = [
  { icon: Download, title: "Скачайте приложение", desc: "Установите VPN-клиент для вашей платформы" },
  { icon: Link2, title: "Импортируйте подписку", desc: "Скопируйте ссылку из раздела «Мои ключи»" },
  { icon: Play, title: "Подключитесь", desc: "Выберите сервер и включите VPN" },
];

export function VpnSetupPage() {
  const { data: config, isLoading } = useCabinetConfig();
  const [platform, setPlatform] = useState<string>("android");
  const howto = config?.howto;

  const text =
    platform === "android"
      ? howto?.android
      : platform === "ios"
        ? howto?.ios
        : platform === "windows"
          ? howto?.windows
          : howto?.linux;

  const activePlatform = platforms.find((p) => p.id === platform)!;

  return (
    <>
      <Header title="Настройка VPN" showBack />
      <div className="page-scroll p-4 space-y-5">
        {howto?.intro && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="premium-hero"
          >
            <p className="relative z-10 text-sm text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {howto.intro}
            </p>
          </motion.div>
        )}

        <div>
          <SectionHeader title="Шаги" />
          <div className="space-y-2">
            {steps.map((step, i) => (
              <motion.div
                key={step.title}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.06 }}
                className="premium-glass flex items-start gap-3 p-4"
              >
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                  <step.icon className="h-5 w-5" />
                </div>
                <div>
                  <div className="text-sm font-semibold">
                    {i + 1}. {step.title}
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{step.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </div>

        <div>
          <SectionHeader title="Платформа" />
          <div className="grid grid-cols-4 gap-2">
            {platforms.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setPlatform(p.id)}
                className={`flex flex-col items-center gap-1.5 rounded-2xl border p-3 transition-all ${
                  platform === p.id
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border/50 bg-card/50 text-muted-foreground"
                }`}
              >
                <p.icon className="h-5 w-5" />
                <span className="text-[10px] font-medium">{p.label}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <SectionHeader title={`Инструкция · ${activePlatform.label}`} />
          <AnimatePresence mode="wait">
            <motion.div
              key={platform}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              className="premium-glass p-5"
            >
              {isLoading ? (
                <Skeleton className="h-32 w-full" />
              ) : text ? (
                <div className="text-sm whitespace-pre-wrap leading-relaxed">{text}</div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Инструкция для {activePlatform.label} пока не добавлена
                </p>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
