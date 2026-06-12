import { cn } from "@/lib/utils";

interface LogoProps {
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizes = {
  sm: { icon: "h-6 w-6", text: "text-lg" },
  md: { icon: "h-8 w-8", text: "text-xl" },
  lg: { icon: "h-10 w-10", text: "text-2xl" },
};

export function Logo({ className, size = "md" }: LogoProps) {
  const s = sizes[size];
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg
        viewBox="0 0 32 32"
        className={cn(s.icon, "shrink-0")}
        aria-hidden
      >
        <defs>
          <linearGradient id="sx-diamond" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8B5CFF" />
            <stop offset="100%" stopColor="#6D28FF" />
          </linearGradient>
        </defs>
        <polygon
          points="16,2 30,16 16,30 2,16"
          fill="url(#sx-diamond)"
          stroke="rgba(255,255,255,0.2)"
          strokeWidth="0.5"
        />
        <polygon
          points="16,8 24,16 16,24 8,16"
          fill="rgba(255,255,255,0.15)"
        />
      </svg>
      <span className={cn(s.text, "font-bold tracking-wider text-stealthx-text")}>
        STEALTHX
      </span>
    </div>
  );
}
