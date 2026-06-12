import { useCallback, useRef, useState } from "react";

export function useMouseParallax(intensity = 0.02) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState({ x: 0, y: 0 });

  const onMove = useCallback(
    (e: MouseEvent) => {
      const el = ref.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      setOffset({
        x: (e.clientX - cx) * intensity,
        y: (e.clientY - cy) * intensity,
      });
    },
    [intensity],
  );

  const refCallback = useCallback(
    (node: HTMLDivElement | null) => {
      if (ref.current) {
        window.removeEventListener("mousemove", onMove);
      }
      ref.current = node;
      if (node) {
        const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        if (!prefersReduced) {
          window.addEventListener("mousemove", onMove, { passive: true });
        }
      }
    },
    [onMove],
  );

  return { ref: refCallback, offset };
}
