import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide border",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground border-primary/30",
        secondary: "bg-secondary/80 text-secondary-foreground border-border/50",
        success:
          "bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 border-emerald-500/25 shadow-[0_0_12px_rgba(16,185,129,0.12)]",
        warning:
          "bg-amber-500/12 text-amber-600 dark:text-amber-400 border-amber-500/25",
        destructive:
          "bg-destructive/12 text-destructive border-destructive/25",
      },
    },
    defaultVariants: { variant: "default" },
  },
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
