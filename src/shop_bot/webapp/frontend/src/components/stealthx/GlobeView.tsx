import { useEffect, useRef } from "react";

const ARCS = [
  { startLat: 40.7, startLng: -74.0, endLat: 52.5, endLng: 13.4 },
  { startLat: 52.5, startLng: 13.4, endLat: 52.37, endLng: 4.9 },
  { startLat: 52.37, startLng: 4.9, endLat: 1.35, endLng: 103.8 },
  { startLat: 1.35, startLng: 103.8, endLat: 35.68, endLng: 139.69 },
  { startLat: 35.68, startLng: 139.69, endLat: 40.7, endLng: -74.0 },
];

const POINTS = [
  { lat: 40.7, lng: -74.0, size: 0.4 },
  { lat: 52.5, lng: 13.4, size: 0.35 },
  { lat: 52.37, lng: 4.9, size: 0.3 },
  { lat: 1.35, lng: 103.8, size: 0.35 },
  { lat: 35.68, lng: 139.69, size: 0.3 },
  { lat: 48.85, lng: 2.35, size: 0.25 },
];

export function GlobeView() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let globe: { destroy?: () => void } | null = null;
    let mounted = true;

    const init = async () => {
      const prefersReduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (prefersReduced || !containerRef.current) return;

      try {
        const Globe = (await import("react-globe.gl")).default;
        const { createElement } = await import("react");
        const { createRoot } = await import("react-dom/client");

        if (!mounted || !containerRef.current) return;

        const root = createRoot(containerRef.current);
        root.render(
          createElement(Globe, {
            globeImageUrl: "//unpkg.com/three-globe/example/img/earth-dark.jpg",
            backgroundColor: "rgba(0,0,0,0)",
            arcsData: ARCS,
            arcColor: () => "#8B5CFF",
            arcDashLength: 0.4,
            arcDashGap: 0.2,
            arcDashAnimateTime: 2000,
            arcStroke: 0.5,
            pointsData: POINTS,
            pointColor: () => "#6D28FF",
            pointAltitude: 0.02,
            pointRadius: 0.4,
            atmosphereColor: "#6D28FF",
            atmosphereAltitude: 0.15,
            width: containerRef.current.clientWidth,
            height: 400,
          }),
        );
        globe = { destroy: () => root.unmount() };
      } catch {
        /* fallback handled by static SVG in container */
      }
    };

    init();
    return () => {
      mounted = false;
      globe?.destroy?.();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-[400px] w-full overflow-hidden rounded-2xl"
      style={{
        background: "radial-gradient(circle at center, rgba(109,40,255,0.15) 0%, transparent 70%)",
      }}
    >
      <svg
        viewBox="0 0 200 200"
        className="absolute inset-0 m-auto h-64 w-64 opacity-30"
        aria-hidden
      >
        <circle cx="100" cy="100" r="90" fill="none" stroke="#6D28FF" strokeWidth="0.5" opacity="0.5" />
        <ellipse cx="100" cy="100" rx="90" ry="35" fill="none" stroke="#8B5CFF" strokeWidth="0.3" opacity="0.4" />
        <ellipse cx="100" cy="100" rx="35" ry="90" fill="none" stroke="#8B5CFF" strokeWidth="0.3" opacity="0.4" />
      </svg>
    </div>
  );
}
