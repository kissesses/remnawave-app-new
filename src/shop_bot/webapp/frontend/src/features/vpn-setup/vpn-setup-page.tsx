import { useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Smartphone,
  Monitor,
  Apple,
  Terminal,
  Download,
  Link2,
  Play,
  Copy,
  ChevronRight,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Header } from "@/components/layout/header";
import { SectionHeader } from "@/components/premium/section-header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useCabinetConfig, useUserStatus } from "@/hooks/use-cabinet";
import { useTelegram } from "@/hooks/use-telegram";
import { api, getUserId } from "@/lib/api";
import { buildImportUrl } from "@/lib/vpn-import";
import type { VpnKey } from "@/types/api";

const platforms = [
  { id: "android", label: "Android", icon: Smartphone },
  { id: "ios", label: "iOS", icon: Apple },
  { id: "windows", label: "Windows", icon: Monitor },
  { id: "linux", label: "Linux", icon: Terminal },
] as const;

type PlatformId = (typeof platforms)[number]["id"];
type WizardStep = 1 | 2 | 3 | 4;

export function VpnSetupPage() {
  const { data: config, isLoading } = useCabinetConfig();
  const { data: status } = useUserStatus();
  const { haptic, openLink } = useTelegram();
  const [step, setStep] = useState<WizardStep>(1);
  const [platform, setPlatform] = useState<PlatformId>("android");
  const [selectedKey, setSelectedKey] = useState<VpnKey | null>(null);

  const keys = status?.keys?.filter((k) => k.sub_url) ?? [];
  const howto = config?.howto;
  const appLinks = howto?.app_links?.[platform] ?? [];

  const instructionText = useMemo(() => {
    if (platform === "android") return howto?.android;
    if (platform === "ios") return howto?.ios;
    if (platform === "windows") return howto?.windows;
    return howto?.linux;
  }, [howto, platform]);

  const activePlatform = platforms.find((p) => p.id === platform)!;

  const copySub = () => {
    if (!selectedKey?.sub_url) return;
    navigator.clipboard.writeText(selectedKey.sub_url);
    haptic("success");
    toast.success("Ссылка скопирована");
  };

  const openInApp = () => {
    if (!selectedKey?.sub_url) return;
    const scheme =
      platform === "android"
        ? howto?.import_scheme_android
        : platform === "ios"
          ? howto?.import_scheme_ios
          : undefined;
    const url = buildImportUrl(selectedKey.sub_url, platform, scheme || undefined);
    if (openLink) openLink(url);
    else window.location.href = url;
    haptic("success");
  };

  const finishSetup = async () => {
    await api.saveOnboardingProgress(getUserId(), { vpn_setup: true });
    setStep(4);
  };

  const stepLabels = ["Платформа", "Ключ", "Импорт", "Готово"];

  return (
    <>
      <Header title="Настройка VPN" showBack />
      <div className="page-scroll p-4 space-y-5">
        <div className="flex gap-1">
          {stepLabels.map((label, i) => (
            <div
              key={label}
              className={`h-1 flex-1 rounded-full transition-colors ${
                step > i ? "bg-primary" : "bg-border/60"
              }`}
            />
          ))}
        </div>

        {howto?.intro && step === 1 ? (
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{howto.intro}</p>
        ) : null}

        <AnimatePresence mode="wait">
          {step === 1 && (
            <motion.div key="s1" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-4">
              <SectionHeader title="1. Выберите платформу" />
              <div className="grid grid-cols-2 gap-2">
                {platforms.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setPlatform(p.id)}
                    className={`flex flex-col items-center gap-2 rounded-2xl border p-4 transition-all ${
                      platform === p.id
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-border/50 bg-card/50 text-muted-foreground"
                    }`}
                  >
                    <p.icon className="h-6 w-6" />
                    <span className="text-sm font-medium">{p.label}</span>
                  </button>
                ))}
              </div>
              {appLinks.length > 0 ? (
                <div>
                  <SectionHeader title="Рекомендуемые приложения" />
                  <div className="space-y-2">
                    {appLinks.map((app) => (
                      <a
                        key={app.url}
                        href={app.url}
                        target="_blank"
                        rel="noreferrer"
                        className="premium-glass flex items-center justify-between px-4 py-3 text-sm font-medium"
                      >
                        {app.name}
                        <ExternalLink className="h-4 w-4 text-muted-foreground" />
                      </a>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="premium-glass flex items-start gap-3 p-4">
                  <Download className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">
                    Скачайте VPN-клиент для {activePlatform.label} из магазина приложений
                  </p>
                </div>
              )}
              <Button variant="tg" className="w-full rounded-2xl h-12" onClick={() => setStep(2)}>
                Далее <ChevronRight className="h-4 w-4 ml-1" />
              </Button>
            </motion.div>
          )}

          {step === 2 && (
            <motion.div key="s2" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-4">
              <SectionHeader title="2. Выберите ключ" />
              {keys.length === 0 ? (
                <p className="text-sm text-muted-foreground">Нет ключей с активной подпиской</p>
              ) : (
                <div className="space-y-2">
                  {keys.map((k) => (
                    <button
                      key={k.key_id}
                      type="button"
                      onClick={() => setSelectedKey(k)}
                      className={`w-full rounded-2xl border p-4 text-left transition-all ${
                        selectedKey?.key_id === k.key_id
                          ? "border-primary bg-primary/10"
                          : "border-border/50 premium-glass"
                      }`}
                    >
                      <div className="font-semibold">{k.name || k.host_name}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {k.days_left > 0 ? `${k.days_left} дн. осталось` : "Истекла"}
                      </div>
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1 rounded-2xl" onClick={() => setStep(1)}>
                  Назад
                </Button>
                <Button
                  variant="tg"
                  className="flex-1 rounded-2xl"
                  disabled={!selectedKey}
                  onClick={() => setStep(3)}
                >
                  Далее
                </Button>
              </div>
            </motion.div>
          )}

          {step === 3 && (
            <motion.div key="s3" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-4">
              <SectionHeader title="3. Импортируйте подписку" />
              <div className="premium-glass p-4 space-y-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Link2 className="h-4 w-4 text-primary" />
                  {selectedKey?.host_name || selectedKey?.name}
                </div>
                <p className="text-xs text-muted-foreground break-all line-clamp-3">
                  {selectedKey?.sub_url}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <Button variant="tg" className="rounded-2xl" onClick={copySub}>
                    <Copy className="h-4 w-4 mr-2" />
                    Копировать
                  </Button>
                  {(platform === "android" || platform === "ios") && (
                    <Button variant="outline" className="rounded-2xl" onClick={openInApp}>
                      <Link2 className="h-4 w-4 mr-2" />
                      В приложение
                    </Button>
                  )}
                </div>
              </div>
              <div>
                <SectionHeader title={`Инструкция · ${activePlatform.label}`} />
                <div className="premium-glass p-5">
                  {isLoading ? (
                    <Skeleton className="h-24 w-full" />
                  ) : instructionText ? (
                    <div className="text-sm whitespace-pre-wrap leading-relaxed">{instructionText}</div>
                  ) : (
                    <ol className="text-sm text-muted-foreground space-y-2 list-decimal list-inside">
                      <li>Откройте VPN-приложение</li>
                      <li>Выберите «Импорт по ссылке» или «Подписка»</li>
                      <li>Вставьте скопированную ссылку</li>
                      <li>Подключитесь к серверу</li>
                    </ol>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" className="flex-1 rounded-2xl" onClick={() => setStep(2)}>
                  Назад
                </Button>
                <Button variant="tg" className="flex-1 rounded-2xl" onClick={() => void finishSetup()}>
                  <Play className="h-4 w-4 mr-2" />
                  Готово
                </Button>
              </div>
            </motion.div>
          )}

          {step === 4 && (
            <motion.div key="s4" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} className="premium-hero text-center py-8">
              <Play className="h-10 w-10 text-primary mx-auto mb-3" />
              <h2 className="text-lg font-bold">VPN настроен!</h2>
              <p className="text-sm text-muted-foreground mt-2">
                Включите VPN в приложении и проверьте подключение
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </>
  );
}
