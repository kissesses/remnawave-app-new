/** Cyber-security cabinet design system — dark only */
export const designTokens = {
  background: "#121418",
  surface: "#1A1D24",
  surfaceElevated: "#242833",
  primary: "#8DD6FF",
  secondary: "#B7B8FF",
  success: "#5BFF8B",
  warning: "#FFB17A",
  error: "#FF6B6B",
  foreground: "#E8ECF4",
  muted: "#8B93A7",
  border: "rgba(141, 214, 255, 0.1)",
  radiusSm: "20px",
  radiusMd: "24px",
  radiusLg: "28px",
  glassBlur: "28px",
} as const;

const cssVarMap: Record<string, string> = {
  "--background": "220 15% 8%",
  "--foreground": "220 20% 93%",
  "--card": "225 14% 12%",
  "--card-foreground": "220 20% 93%",
  "--card-elevated": "225 13% 17%",
  "--primary": "200 100% 78%",
  "--primary-foreground": "220 15% 8%",
  "--secondary": "239 55% 22%",
  "--secondary-foreground": "239 100% 86%",
  "--accent": "239 100% 86%",
  "--accent-foreground": "220 15% 8%",
  "--muted": "225 12% 58%",
  "--muted-foreground": "225 10% 58%",
  "--destructive": "0 100% 71%",
  "--destructive-foreground": "220 15% 8%",
  "--success": "140 100% 68%",
  "--warning": "24 100% 74%",
  "--border": "225 14% 20%",
  "--input": "225 14% 20%",
  "--ring": "200 100% 78%",
  "--radius": "1.5rem",
  "--glass-blur": "28px",
  "--glass-saturate": "1.4",
  "--glow-cyan": "141, 214, 255",
  "--glow-coral": "255, 160, 130",
  "--glow-lavender": "183, 184, 255",
};

export function applyDesignTokens(el: HTMLElement = document.documentElement) {
  el.classList.add("dark");
  el.dataset.appTheme = "cyber";
  el.style.colorScheme = "dark";
  for (const [key, value] of Object.entries(cssVarMap)) {
    el.style.setProperty(key, value);
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", designTokens.background);
}
