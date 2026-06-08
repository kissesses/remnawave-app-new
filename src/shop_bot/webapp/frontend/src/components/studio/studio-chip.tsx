import { cn } from "@/lib/utils";

export function StudioChip({
  children,
  active,
  onClick,
  className,
}: {
  children: React.ReactNode;
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const Comp = onClick ? "button" : "span";
  return (
    <Comp
      type={onClick ? "button" : undefined}
      onClick={onClick}
      className={cn("studio-chip", active && "studio-chip--active", onClick && "active:scale-95", className)}
    >
      {children}
    </Comp>
  );
}

export function StudioChipRow({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <div className={cn("studio-chip-row scrollbar-none", className)}>{children}</div>;
}
