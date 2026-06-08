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
    <button
      type="button"
      onClick={onClick}
      className={cn("studio-overview-card", className)}
    >
      <Icon className="studio-overview-card__icon h-5 w-5" strokeWidth={2} />
      <span className="studio-overview-card__title">{title}</span>
      {meta && <span className="studio-overview-card__meta">{meta}</span>}
    </button>
  );
}
