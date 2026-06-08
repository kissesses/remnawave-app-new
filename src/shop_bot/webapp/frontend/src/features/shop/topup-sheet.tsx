import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PaymentMethodPicker } from "@/components/premium/payment-method-picker";
import { SectionHeader } from "@/components/premium/section-header";
import { usePaymentFlow } from "@/hooks/use-payment-flow";
import { useCabinetConfig } from "@/hooks/use-cabinet";
import { getUserId } from "@/lib/api";
import { formatMoney } from "@/lib/utils";

interface TopUpSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const presets = [100, 300, 500, 1000];

export function TopUpSheet({ open, onOpenChange }: TopUpSheetProps) {
  const userId = getUserId();
  const qc = useQueryClient();
  const { data: config } = useCabinetConfig();
  const [amount, setAmount] = useState(300);
  const [methodId, setMethodId] = useState<string | null>(null);
  const { methods, loadingMethods, paying, loadMethods, pay, pickDefaultMethod } =
    usePaymentFlow();

  const min = config?.topup?.min ?? 10;
  const max = config?.topup?.max ?? 100000;

  useEffect(() => {
    if (open) loadMethods();
  }, [open, loadMethods]);

  useEffect(() => {
    if (methods.length) {
      setMethodId(pickDefaultMethod(amount, 0));
    }
  }, [methods, amount, pickDefaultMethod]);

  const handlePay = async () => {
    if (amount < min || amount > max || !methodId) return;
    await pay(
      { action: "top_up", amount },
      methodId,
      async () => {
        onOpenChange(false);
        await qc.invalidateQueries({ queryKey: ["user", "status"] });
        await qc.invalidateQueries({ queryKey: ["payments", "history"] });
      },
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="text-gradient-primary">Пополнение баланса</SheetTitle>
        </SheetHeader>
        <div className="space-y-5 px-5 pb-8">
          <div className="grid grid-cols-4 gap-2">
            {presets.map((p) => (
              <Button
                key={p}
                variant={amount === p ? "tg" : "secondary"}
                size="sm"
                className="rounded-xl"
                onClick={() => setAmount(p)}
              >
                {p} ₽
              </Button>
            ))}
          </div>

          <div className="premium-glass p-4">
            <input
              type="number"
              className="w-full bg-transparent text-center text-3xl font-bold outline-none"
              value={amount}
              min={min}
              max={max}
              onChange={(e) => setAmount(Number(e.target.value))}
            />
            <p className="text-center text-xs text-muted-foreground mt-1">
              от {formatMoney(min)} до {formatMoney(max)}
            </p>
          </div>

          <div>
            <SectionHeader title="Способ оплаты" />
            {loadingMethods ? (
              <Skeleton className="h-16 w-full rounded-2xl" />
            ) : (
              <PaymentMethodPicker
                methods={methods}
                selected={methodId}
                onSelect={setMethodId}
              />
            )}
          </div>

          <Button
            variant="tg"
            className="w-full rounded-2xl h-12"
            disabled={paying || !methodId}
            onClick={handlePay}
          >
            {paying ? "Обработка…" : `Пополнить ${formatMoney(amount)}`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
