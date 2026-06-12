import type { ButtonHTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

interface NeonButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  children: ReactNode;
  variant?: "primary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
}

const variants = {
  primary:
    "bg-stealthx-accent text-white shadow-neon hover:shadow-neon-lg hover:bg-stealthx-glow transition-all duration-300",
  outline:
    "border border-stealthx-accent/50 text-stealthx-text bg-transparent hover:bg-stealthx-accent/10 hover:border-stealthx-accent hover:shadow-neon-sm transition-all duration-300",
  ghost:
    "text-stealthx-muted hover:text-stealthx-text hover:bg-white/5 transition-all duration-300",
};

const sizes = {
  sm: "px-4 py-2 text-sm rounded-lg",
  md: "px-6 py-3 text-sm rounded-xl",
  lg: "px-8 py-4 text-base rounded-xl",
};

export function NeonButton({
  children,
  variant = "primary",
  size = "md",
  className,
  ...props
}: NeonButtonProps) {
  return (
    <button
      type="button"
      className={cn(
        "inline-flex items-center justify-center gap-2 font-semibold tracking-wide",
        variants[variant],
        sizes[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}
