import { useState } from "react";
import { toast } from "sonner";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { api, getUserId } from "@/lib/api";
import { useCabinetConfig } from "@/hooks/use-cabinet";

interface TopUpSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const presets = [100, 300, 500, 1000];

export function TopUpSheet({ open, onOpenChange }: TopUpSheetProps) {
  const userId = getUserId();
  const { data: config } = useCabinetConfig();
  const [amount, setAmount] = useState(300);
  const [paying, setPaying] = useState(false);
  const min = config?.topup?.min ?? 10;
  const max = config?.topup?.max ?? 100000;

  const pay = async () => {
    if (amount < min || amount > max) {
      toast.error(`Сумма от ${min} до ${max} ₽`);
      return;
    }
    setPaying(true);
    try {
      const methods = await api.getPaymentMethods(userId);
      if (!methods.ok || !methods.methods?.length) {
        toast.error("Нет способов оплаты");
        return;
      }
      const res = await api.createPayment({
        user_id: userId,
        action: "top_up",
        amount,
        payment_method: methods.methods[0].id,
      });
      if (res.ok && res.payment_url) {
        window.open(res.payment_url, "_blank");
        toast.success("Перейдите к оплате");
        onOpenChange(false);
      } else {
        toast.error(res.error ?? "Ошибка");
      }
    } finally {
      setPaying(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>Пополнение баланса</SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-5 pb-8">
          <div className="grid grid-cols-4 gap-2">
            {presets.map((p) => (
              <Button
                key={p}
                variant={amount === p ? "tg" : "secondary"}
                size="sm"
                onClick={() => setAmount(p)}
              >
                {p} ₽
              </Button>
            ))}
          </div>
          <input
            type="number"
            className="w-full rounded-xl border border-border bg-card px-4 py-3 text-lg font-semibold text-center"
            value={amount}
            min={min}
            max={max}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
          <Button variant="tg" className="w-full" disabled={paying} onClick={pay}>
            Пополнить {amount} ₽
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
