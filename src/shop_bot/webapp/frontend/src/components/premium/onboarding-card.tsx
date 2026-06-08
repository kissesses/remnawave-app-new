import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, Circle, Gift, Shield, Users } from "lucide-react";
import { SectionHeader } from "@/components/premium/section-header";
import { api, getUserId } from "@/lib/api";
import type { OnboardingProgress } from "@/types/api";

const STEPS = [
  { id: "bought" as const, label: "Оформить подписку", icon: Shield, href: "/" },
  { id: "vpn_setup" as const, label: "Настроить VPN", icon: Gift, href: "/vpn/setup" },
  { id: "referred" as const, label: "Пригласить друга", icon: Users, href: "/referrals" },
];

export function OnboardingCard() {
  const navigate = useNavigate();
  const [progress, setProgress] = useState<OnboardingProgress | null>(null);

  useEffect(() => {
    api.getOnboardingProgress(getUserId()).then((res) => {
      if (res.ok) setProgress(res.progress);
    });
  }, []);

  if (!progress) return null;
  const doneCount = STEPS.filter((s) => progress[s.id]).length;
  if (doneCount >= STEPS.length) return null;

  const markVpnSetup = async () => {
    await api.saveOnboardingProgress(getUserId(), { vpn_setup: true });
    navigate("/vpn/setup");
  };

  return (
    <div>
      <SectionHeader
        title="Первые шаги"
        action={
          <span className="text-xs text-muted-foreground">
            {doneCount}/{STEPS.length}
          </span>
        }
      />
      <div className="premium-glass divide-y divide-border/40 overflow-hidden rounded-2xl">
        {STEPS.map((step) => {
          const done = progress[step.id];
          return (
            <button
              key={step.id}
              type="button"
              className="flex w-full items-center gap-3 px-4 py-3 text-left active:opacity-70"
              onClick={() => {
                if (step.id === "vpn_setup") void markVpnSetup();
                else navigate(step.href);
              }}
            >
              <step.icon className={`h-4 w-4 shrink-0 ${done ? "text-success" : "text-primary"}`} />
              <span className={`flex-1 text-sm ${done ? "text-muted-foreground line-through" : "font-medium"}`}>
                {step.label}
              </span>
              {done ? (
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
