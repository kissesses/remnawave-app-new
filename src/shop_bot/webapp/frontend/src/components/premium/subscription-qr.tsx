import { useEffect, useState } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { api, getUserId } from "@/lib/api";

interface SubscriptionQrProps {
  keyId: number;
  subUrl?: string;
  size?: number;
  className?: string;
}

export function SubscriptionQr({ keyId, subUrl, size = 160, className }: SubscriptionQrProps) {
  const [src, setSrc] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const res = await api.getKeySubQr(getUserId(), keyId);
      if (!cancelled) {
        setSrc(res.ok && res.qr_data_url ? res.qr_data_url : null);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [keyId]);

  if (loading) {
    return <Skeleton className={className} style={{ width: size, height: size }} />;
  }

  if (!src) {
    return (
      <div
        className={`flex items-center justify-center rounded-2xl bg-muted/30 text-xs text-muted-foreground ${className ?? ""}`}
        style={{ width: size, height: size }}
      >
        QR недоступен
      </div>
    );
  }

  return (
    <div className={`rounded-2xl bg-white p-3 ${className ?? ""}`}>
      <img
        src={src}
        alt="QR подписки"
        width={size}
        height={size}
        className="rounded-lg"
        title={subUrl ? "Сканируйте для импорта подписки" : undefined}
      />
    </div>
  );
}
