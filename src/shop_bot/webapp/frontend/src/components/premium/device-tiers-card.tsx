import { useQuery } from "@tanstack/react-query";
import { Smartphone } from "lucide-react";
import { SectionHeader } from "@/components/premium/section-header";
import { Skeleton } from "@/components/ui/skeleton";
import { api, getUserId } from "@/lib/api";
import { formatMoney } from "@/lib/utils";

export function DeviceTiersCard({ hostName }: { hostName: string }) {
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

  return (
    <div>
      <SectionHeader
        title="Тарифы устройств"
        action={
          data.base_device_count ? (
            <span className="text-xs text-muted-foreground">
              Базово {data.base_device_count} уст.
            </span>
          ) : undefined
        }
      />
      <div className="premium-glass divide-y divide-border/40 overflow-hidden">
        {data.tiers.map((tier) => (
          <div key={tier.tier_id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10">
              <Smartphone className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium">
                до {tier.device_count} устройств
              </div>
            </div>
            <div className="text-sm font-semibold text-primary shrink-0">
              {formatMoney(tier.price)}
            </div>
          </div>
        ))}
      </div>
      {data.tier_lock_extend ? (
        <p className="mt-2 px-1 text-xs text-muted-foreground">
          При продлении сохраняется текущий лимит устройств
        </p>
      ) : null}
    </div>
  );
}
