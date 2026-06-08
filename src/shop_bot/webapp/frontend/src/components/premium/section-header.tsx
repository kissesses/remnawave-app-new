import { cn } from "@/lib/utils";

export function SectionHeader({
  title,
  action,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("mb-2 flex items-center justify-between", className)}>
      <h2 className="studio-label">{title}</h2>
      {action}
    </div>
  );
}
