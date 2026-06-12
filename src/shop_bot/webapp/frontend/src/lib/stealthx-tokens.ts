/** STEALTHX — Cyberpunk Luxury design tokens */

export const stealthxColors = {
  bg: "#05010F",
  card: "#0D0818",
  accent: "#6D28FF",
  glow: "#8B5CFF",
  text: "#FFFFFF",
  muted: "#9CA3AF",
  success: "#22C55E",
  danger: "#EF4444",
} as const;

export const stealthxCssVars: Record<string, string> = {
  "--sx-bg": stealthxColors.bg,
  "--sx-card": stealthxColors.card,
  "--sx-accent": stealthxColors.accent,
  "--sx-glow": stealthxColors.glow,
  "--sx-text": stealthxColors.text,
  "--sx-muted": stealthxColors.muted,
  "--sx-success": stealthxColors.success,
  "--sx-danger": stealthxColors.danger,
  "--sx-glass-bg": "rgba(255, 255, 255, 0.03)",
  "--sx-glass-border": "rgba(255, 255, 255, 0.08)",
  "--sx-neon-shadow": "0 0 40px rgba(109, 40, 255, 0.35), 0 0 80px rgba(139, 92, 255, 0.15)",
};

export function applyStealthxTheme(el: HTMLElement = document.documentElement): void {
  el.classList.add("stealthx-theme", "dark");
  el.dataset.appTheme = "stealthx";
  for (const [key, value] of Object.entries(stealthxCssVars)) {
    el.style.setProperty(key, value);
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", stealthxColors.bg);
}
