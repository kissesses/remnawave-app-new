import { cn } from "@/lib/utils";

function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-2xl skeleton-shimmer", className)}
      {...props}
    />
  );
}

export { Skeleton };
