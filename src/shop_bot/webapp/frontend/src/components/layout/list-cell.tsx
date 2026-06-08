import { ChevronRight, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface ListCellProps {
  icon?: LucideIcon;
  title: string;
  subtitle?: string;
  value?: string;
  showChevron?: boolean;
  onClick?: () => void;
  className?: string;
  destructive?: boolean;
}

export function ListCell({
  icon: Icon,
  title,
  subtitle,
  value,
  showChevron = true,
  onClick,
  className,
  destructive,
}: ListCellProps) {
  const Comp = onClick ? "button" : "div";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn("tg-cell w-full text-left", onClick && "cursor-pointer", className)}
    >
      {Icon && (
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
          <Icon className={cn("h-5 w-5", destructive ? "text-destructive" : "text-primary")} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className={cn("font-medium", destructive && "text-destructive")}>{title}</div>
        {subtitle && <div className="text-sm text-muted-foreground truncate">{subtitle}</div>}
      </div>
      {value && <span className="text-sm text-muted-foreground shrink-0">{value}</span>}
      {showChevron && onClick && (
        <ChevronRight className="h-5 w-5 shrink-0 text-muted-foreground/60" />
      )}
    </Comp>
  );
}

export function ListGroup({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl premium-glass", className)}>
      {children}
    </div>
  );
}
