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
      <div className="mb-4 flex h-20 w-20 items-center justify-center rounded-3xl bg-primary/10 ring-1 ring-primary/20 shadow-[0_8px_32px_hsl(var(--primary)/0.12)]">
        <Icon className="h-9 w-9 text-primary" />
      </div>
      <h3 className="text-lg font-bold">{title}</h3>
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
