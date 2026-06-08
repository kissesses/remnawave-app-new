import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Gift, Server } from "lucide-react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { SectionHeader } from "@/components/premium/section-header";
import { useCabinetConfig } from "@/hooks/use-cabinet";
import { useTelegram } from "@/hooks/use-telegram";
import { api, getUserId } from "@/lib/api";

interface TrialSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  hosts?: { host_name: string; label?: string }[];
}

export function TrialSheet({ open, onOpenChange, hosts: externalHosts }: TrialSheetProps) {
  const userId = getUserId();
  const qc = useQueryClient();
  const { data: config } = useCabinetConfig();
  const { haptic } = useTelegram();
  const [hostName, setHostName] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const hosts = externalHosts?.length ? externalHosts : (config?.trial?.hosts ?? []);
  const days = config?.trial?.duration_days ?? 3;

  const activate = async (selected?: string) => {
    const host = selected ?? hostName;
    setLoading(true);
    try {
      const res = await api.activateTrial(userId, host ?? undefined);
      if (res.ok) {
        haptic("success");
        toast.success("Пробный период активирован");
        onOpenChange(false);
        await qc.invalidateQueries({ queryKey: ["user", "status"] });
        await qc.invalidateQueries({ queryKey: ["cabinet", "bootstrap"] });
      } else if (res.needs_host && res.hosts?.length) {
        setHostName(null);
      } else {
        toast.error(res.error ?? "Не удалось активировать");
      }
    } finally {
      setLoading(false);
    }
  };

  const needsPick = hosts.length > 1 && !hostName;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-gradient-primary">
            <Gift className="h-5 w-5" />
            Пробный период
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-5 px-5 pb-8">
          <div className="premium-glass p-4 text-center">
            <p className="text-3xl font-bold text-primary">{days}</p>
            <p className="text-sm text-muted-foreground mt-1">дней бесплатно</p>
          </div>

          {hosts.length > 1 && (
            <div>
              <SectionHeader title="Выберите сервер" />
              <div className="space-y-2">
                {hosts.map((h) => (
                  <button
                    key={h.host_name}
                    type="button"
                    onClick={() => setHostName(h.host_name)}
                    className={`flex w-full items-center gap-3 rounded-2xl border p-4 text-left transition-colors ${
                      hostName === h.host_name
                        ? "border-primary bg-primary/10"
                        : "border-border/50 premium-glass"
                    }`}
                  >
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
                      <Server className="h-5 w-5 text-primary" />
                    </div>
                    <span className="font-medium">{h.label || h.host_name}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <Button
            variant="tg"
            className="w-full rounded-2xl h-12"
            disabled={loading || !hosts.length || (needsPick && hosts.length > 1)}
            onClick={() => activate(hostName ?? hosts[0]?.host_name)}
          >
            {loading ? "Активация…" : "Активировать пробный период"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
