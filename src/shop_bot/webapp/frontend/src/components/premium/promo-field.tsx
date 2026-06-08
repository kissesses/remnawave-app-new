import { useState } from "react";
import { Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { api, getUserId } from "@/lib/api";

export function PromoField({ planId, onApplied }: { planId?: number; onApplied?: () => void }) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);

  const apply = async () => {
    if (!code.trim()) return;
    setLoading(true);
    try {
      const res = await api.applyPromo(getUserId(), code.trim(), planId);
      if (res.ok) {
        toast.success(res.message ?? "Промокод применён");
        onApplied?.();
      } else {
        toast.error(res.error ?? "Неверный промокод");
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex gap-2">
      <div className="relative flex-1">
        <Tag className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          className="w-full rounded-xl border border-border bg-card py-2.5 pl-10 pr-3 text-sm outline-none focus:ring-2 focus:ring-primary/30"
          placeholder="Промокод"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>
      <Button variant="secondary" disabled={loading || !code.trim()} onClick={apply}>
        OK
      </Button>
    </div>
  );
}
