import { cn } from "@/lib/utils";

export function StudioBoard({
  children,
  className,
  toolbar,
}: {
  children: React.ReactNode;
  className?: string;
  toolbar?: React.ReactNode;
}) {
  return (
    <div className={cn("studio-board", className)}>
      {toolbar && <div className="studio-board__toolbar">{toolbar}</div>}
      {children}
    </div>
  );
}

export function StudioCard({
  children,
  className,
  title,
  description,
  action,
}: {
  children?: React.ReactNode;
  className?: string;
  title?: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className={cn("studio-card", className)}>
      {(title || action) && (
        <div className="studio-card__head">
          <div className="min-w-0">
            {title && <h3 className="studio-card__title">{title}</h3>}
            {description && <p className="studio-card__desc">{description}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}
