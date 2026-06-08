import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Smartphone, ChevronRight } from "lucide-react";
import { SectionHeader } from "@/components/premium/section-header";
import { Skeleton } from "@/components/ui/skeleton";
import { TierUpgradeSheet } from "@/features/shop/tier-upgrade-sheet";
import { api, getUserId } from "@/lib/api";
import { formatMoney } from "@/lib/utils";

interface DeviceTiersCardProps {
  hostName: string;
  keyId?: number;
  currentDevices?: number;
}

export function DeviceTiersCard({ hostName, keyId, currentDevices = 1 }: DeviceTiersCardProps) {
  const [upgradeTier, setUpgradeTier] = useState<{
    tierId: number;
    label: string;
    price: number;
  } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["device-tiers", hostName],
    queryFn: () => api.getDeviceTiers(getUserId(), hostName),
    enabled: Boolean(hostName),
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <div>
        <SectionHeader title="Тарифы устройств" />
        <Skeleton className="h-24 w-full rounded-2xl" />
      </div>
    );
  }

  if (!data?.ok || data.device_mode !== "tiers" || !data.tiers?.length) {
    return null;
  }

  const baseCount = data.base_device_count ?? 1;

  return (
    <>
      <div>
        <SectionHeader
          title="Тарифы устройств"
          action={
            <span className="text-xs text-muted-foreground">
              Базово {baseCount} уст.
            </span>
          }
        />
        <div className="premium-glass divide-y divide-border/40 overflow-hidden">
          {data.tiers.map((tier) => {
            const isCurrent = tier.device_count === currentDevices;
            const canUpgrade = keyId && tier.device_count > currentDevices;
            return (
              <button
                key={tier.tier_id}
                type="button"
                disabled={!canUpgrade && !isCurrent}
                className={`flex w-full items-center gap-3 px-4 py-3 text-left ${
                  canUpgrade ? "active:opacity-70" : ""
                } ${isCurrent ? "bg-primary/5" : ""}`}
                onClick={() => {
                  if (!canUpgrade) return;
                  const diff = Math.max(0, tier.device_count - baseCount);
                  setUpgradeTier({
                    tierId: tier.tier_id,
                    label: `До ${tier.device_count} устройств`,
                    price: diff * tier.price,
                  });
                }}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
                  <Smartphone className="h-4 w-4 text-primary" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">
                    до {tier.device_count} устройств
                    {isCurrent ? (
                      <span className="ml-2 text-xs text-success font-normal">текущий</span>
                    ) : null}
                  </div>
                </div>
                <div className="text-sm font-semibold text-primary shrink-0">
                  {formatMoney(tier.price)}
                  <span className="text-[10px] text-muted-foreground font-normal">/мес</span>
                </div>
                {canUpgrade ? (
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                ) : null}
              </button>
            );
          })}
        </div>
        {data.tier_lock_extend ? (
          <p className="mt-2 px-1 text-xs text-muted-foreground">
            При продлении сохраняется текущий лимит устройств
          </p>
        ) : null}
      </div>

      {upgradeTier && keyId ? (
        <TierUpgradeSheet
          open={Boolean(upgradeTier)}
          onOpenChange={(open) => !open && setUpgradeTier(null)}
          keyId={keyId}
          hostName={hostName}
          tierId={upgradeTier.tierId}
          tierLabel={upgradeTier.label}
          estimatedPrice={upgradeTier.price}
        />
      ) : null}
    </>
  );
}
