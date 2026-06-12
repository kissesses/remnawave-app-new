import type { ReactNode } from "react";
import { useMouseParallax } from "@/hooks/use-mouse-parallax";
import { cn } from "@/lib/utils";

interface ParallaxLayerProps {
  children: ReactNode;
  className?: string;
  intensity?: number;
}

export function ParallaxLayer({ children, className, intensity = 0.02 }: ParallaxLayerProps) {
  const { ref, offset } = useMouseParallax(intensity);

  return (
    <div
      ref={ref}
      className={cn("relative", className)}
      style={{
        transform: `translate(${offset.x}px, ${offset.y}px)`,
        transition: "transform 0.15s ease-out",
      }}
    >
      {children}
    </div>
  );
}
