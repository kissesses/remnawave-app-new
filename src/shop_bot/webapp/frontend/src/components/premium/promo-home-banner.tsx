import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Megaphone } from "lucide-react";
import type { PromoBanner } from "@/types/api";
import { parseAppDate } from "@/lib/utils";

interface PromoHomeBannerProps {
  banner: PromoBanner;
}

export function PromoHomeBanner({ banner }: PromoHomeBannerProps) {
  const navigate = useNavigate();
  if (!banner.title && !banner.body) return null;

  const until = banner.until ? parseAppDate(banner.until) : null;
  if (until && until.getTime() < Date.now()) return null;

  const href = banner.href?.startsWith("/") ? banner.href : "/app/wallet";

  return (
    <motion.button
      type="button"
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="premium-glass w-full overflow-hidden rounded-2xl text-left active:opacity-90"
      onClick={() => navigate(href)}
    >
      {banner.image ? (
        <img src={banner.image} alt="" className="h-28 w-full object-cover" />
      ) : null}
      <div className="flex items-start gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
          <Megaphone className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          {banner.title ? (
            <div className="font-semibold text-sm">{banner.title}</div>
          ) : null}
          {banner.body ? (
            <p className="mt-0.5 text-xs text-muted-foreground line-clamp-2">{banner.body}</p>
          ) : null}
          <span className="mt-2 inline-block text-xs font-semibold text-primary">
            {banner.cta || "Подробнее"} →
          </span>
        </div>
      </div>
    </motion.button>
  );
}
