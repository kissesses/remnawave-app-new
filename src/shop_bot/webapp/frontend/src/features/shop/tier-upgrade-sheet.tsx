import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { PaymentMethodPicker } from "@/components/premium/payment-method-picker";
import { usePaymentFlow } from "@/hooks/use-payment-flow";
import { useUserStatus } from "@/hooks/use-cabinet";
import { api, getUserId } from "@/lib/api";
import { formatMoney } from "@/lib/utils";

interface TierUpgradeSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  keyId: number;
  hostName: string;
  tierId: number;
  tierLabel: string;
  estimatedPrice?: number;
}

export function TierUpgradeSheet({
  open,
  onOpenChange,
  keyId,
  hostName,
  tierId,
  tierLabel,
  estimatedPrice,
}: TierUpgradeSheetProps) {
  const userId = getUserId();
  const qc = useQueryClient();
  const { data: status } = useUserStatus();
  const [methodId, setMethodId] = useState<string | null>(null);
  const { methods, loadingMethods, paying, loadMethods, pay, pickDefaultMethod } =
    usePaymentFlow();
  const balance = status?.balance ?? 0;

  useEffect(() => {
    if (open) loadMethods();
  }, [open, loadMethods]);

  useEffect(() => {
    if (methods.length && estimatedPrice != null) {
      setMethodId(pickDefaultMethod(estimatedPrice, balance));
    }
  }, [methods, estimatedPrice, balance, pickDefaultMethod]);

  const handlePay = async () => {
    if (!methodId) return;
    await pay(
      {
        action: "tier_upgrade",
        key_id: keyId,
        host_name: hostName,
        tier_id: tierId,
      },
      methodId,
      async () => {
        onOpenChange(false);
        await qc.invalidateQueries({ queryKey: ["user", "status"] });
        await qc.invalidateQueries({ queryKey: ["key", "devices", keyId] });
        toast.success("Лимит устройств обновлён");
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="max-h-[80vh] overflow-y-auto rounded-t-3xl">
        <SheetHeader>
          <SheetTitle>Апгрейд устройств</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-5 pb-8">
          <p className="text-sm text-muted-foreground">{tierLabel}</p>
          {estimatedPrice != null ? (
            <div className="text-2xl font-bold text-primary">{formatMoney(estimatedPrice)}</div>
          ) : null}
          {loadingMethods ? (
            <p className="text-sm text-muted-foreground">Загрузка способов оплаты…</p>
          ) : (
            <PaymentMethodPicker
              methods={methods}
              selected={methodId}
              onSelect={setMethodId}
              balance={balance}
            />
          )}
          <Button
            variant="tg"
            className="w-full rounded-2xl h-12"
            disabled={!methodId || paying}
            onClick={() => void handlePay()}
          >
            {paying ? "Оплата…" : "Оплатить апгрейд"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
