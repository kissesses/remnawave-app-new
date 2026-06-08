import { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center px-8 py-16 text-center">
      <div className="mb-5 flex h-20 w-20 items-center justify-center rounded-[14px] studio-hub__icon">
        <Icon className="h-10 w-10" />
      </div>
      <h3 className="text-xl font-bold tracking-tight">{title}</h3>
      {description && (
        <p className="mt-2 max-w-xs text-sm text-muted-foreground">{description}</p>
      )}
      {actionLabel && onAction && (
        <Button className="mt-6" variant="tg" onClick={onAction}>
          {actionLabel}
        </Button>
      )}
    </div>
  );
}
