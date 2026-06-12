import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface GlassCardProps {
  children: ReactNode;
  className?: string;
  elevated?: boolean;
  neon?: boolean;
}

export function GlassCard({ children, className, elevated, neon }: GlassCardProps) {
  return (
    <div
      className={cn(
        "rounded-2xl",
        elevated ? "sx-glass-elevated" : "sx-glass",
        neon && "sx-neon-border",
        className,
      )}
    >
      {children}
    </div>
  );
}
