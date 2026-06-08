import { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface StudioHubProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  stats?: React.ReactNode;
  actions?: React.ReactNode;
  onClick?: () => void;
  className?: string;
  children?: React.ReactNode;
  iconTone?: "accent" | "tg";
}

export function StudioHub({
  icon: Icon,
  title,
  description,
  stats,
  actions,
  onClick,
  className,
  children,
  iconTone = "accent",
}: StudioHubProps) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn("studio-hub w-full text-left", onClick && "active:scale-[0.99] transition-transform", className)}
    >
      <div className="studio-hub__main">
        <div className="studio-hub__row">
          <div className={cn("studio-hub__icon", iconTone === "tg" && "studio-hub__icon--tg")}>
            <Icon className="h-5 w-5" strokeWidth={2} />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="studio-hub__title truncate">{title}</h2>
            {description && <p className="studio-hub__desc">{description}</p>}
          </div>
        </div>
        {children}
      </div>
      {(stats || actions) && (
        <div className="studio-hub__footer">
          {stats && <div className="studio-hub__stats">{stats}</div>}
          {actions && <div className="studio-hub__actions">{actions}</div>}
        </div>
      )}
    </Comp>
  );
}

export function StudioStat({
  children,
  variant,
  className,
}: {
  children: React.ReactNode;
  variant?: "ok" | "warn";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "studio-stat",
        variant === "ok" && "studio-stat--ok",
        variant === "warn" && "studio-stat--warn",
        className,
      )}
    >
      {children}
    </span>
  );
}
