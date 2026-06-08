import { useEffect } from "react";
import { getBootstrap } from "@/lib/api";

function hexToHsl(hex: string): string | null {
  const raw = hex.replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(raw)) return null;
  const r = parseInt(raw.slice(0, 2), 16) / 255;
  const g = parseInt(raw.slice(2, 4), 16) / 255;
  const b = parseInt(raw.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = ((g - b) / d + (g < b ? 6 : 0)) / 6;
        break;
      case g:
        h = ((b - r) / d + 2) / 6;
        break;
      default:
        h = ((r - g) / d + 4) / 6;
    }
  }
  return `${Math.round(h * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

export function useBranding() {
  const branding = getBootstrap().branding;

  useEffect(() => {
    const accent = branding.accent_color?.trim();
    if (!accent) return;
    const hsl = hexToHsl(accent.startsWith("#") ? accent : `#${accent}`);
    if (!hsl) return;
    document.documentElement.style.setProperty("--brand-accent", hsl);
  }, [branding.accent_color]);

  return branding;
}
