import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Gift } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useTelegram } from "@/hooks/use-telegram";
import { api, getUserId } from "@/lib/api";

interface GiftRedeemSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialToken?: string;
}

export function GiftRedeemSheet({ open, onOpenChange, initialToken }: GiftRedeemSheetProps) {
  const qc = useQueryClient();
  const { haptic } = useTelegram();
  const [token, setToken] = useState(initialToken ?? "");
  const [loading, setLoading] = useState(false);

  const redeem = async () => {
    const trimmed = token.trim();
    if (!trimmed) return;
    setLoading(true);
    const res = await api.redeemGift(getUserId(), trimmed);
    setLoading(false);
    if (res.ok) {
      haptic("success");
      toast.success(res.message ?? "Подарок активирован");
      onOpenChange(false);
      await qc.invalidateQueries({ queryKey: ["user", "status"] });
      await qc.invalidateQueries({ queryKey: ["cabinet", "bootstrap"] });
    } else {
      toast.error(res.error ?? "Не удалось активировать");
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="rounded-t-3xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <Gift className="h-5 w-5 text-primary" />
            Подарочный ключ
          </SheetTitle>
        </SheetHeader>
        <div className="space-y-4 px-5 pb-8">
          <input
            className="w-full rounded-2xl border border-border bg-background px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
            placeholder="Код подарка"
            value={token}
            onChange={(e) => setToken(e.target.value)}
          />
          <Button
            variant="tg"
            className="w-full rounded-2xl h-12"
            disabled={!token.trim() || loading}
            onClick={() => void redeem()}
          >
            {loading ? "Активация…" : "Активировать"}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
