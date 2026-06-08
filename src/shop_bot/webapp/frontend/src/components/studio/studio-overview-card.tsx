import { motion } from "framer-motion";
import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function StudioOverviewGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("studio-overview-grid", className)}>{children}</div>;
}

export function StudioOverviewCard({
  icon: Icon,
  title,
  meta,
  onClick,
  className,
}: {
  icon: LucideIcon;
  title: string;
  meta?: string;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <motion.button
      type="button"
      onClick={onClick}
      whileTap={{ scale: 0.97 }}
      transition={{ type: "spring", stiffness: 520, damping: 32 }}
      className={cn("studio-overview-card", className)}
    >
      <div className="studio-overview-card__icon-wrap">
        <Icon className="studio-overview-card__icon h-5 w-5" strokeWidth={2} />
      </div>
      <span className="studio-overview-card__title">{title}</span>
      {meta && <span className="studio-overview-card__meta">{meta}</span>}
    </motion.button>
  );
}
