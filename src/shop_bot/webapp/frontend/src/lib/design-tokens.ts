/** Light Blue cabinet design system (inspired by flatlogic/light-blue-react, MIT) */
export const designTokens = {
  backgroundBase: "#1B1E3F",
  backgroundGradientFrom: "#333867",
  backgroundGradientTo: "#17193B",
  widgetBg: "rgba(0, 0, 0, 0.24)",
  primary: "#2477FF",
  link: "#1870DC",
  iconBlue: "#3979F6",
  success: "#2D8515",
  warning: "#E49400",
  error: "#DB2A34",
  foreground: "rgba(255, 255, 255, 0.9)",
  muted: "rgba(255, 255, 255, 0.6)",
  widgetRadius: "12px",
  fontFamily: "Montserrat, sans-serif",
} as const;

const cssVarMap: Record<string, string> = {
  "--background": "235 42% 16%",
  "--foreground": "0 0% 96%",
  "--card": "235 35% 22%",
  "--card-foreground": "0 0% 96%",
  "--card-elevated": "235 32% 26%",
  "--primary": "217 100% 57%",
  "--primary-foreground": "0 0% 100%",
  "--secondary": "235 28% 32%",
  "--secondary-foreground": "0 0% 96%",
  "--accent": "213 79% 48%",
  "--accent-foreground": "0 0% 100%",
  "--muted": "210 10% 60%",
  "--muted-foreground": "210 10% 60%",
  "--destructive": "356 71% 51%",
  "--destructive-foreground": "0 0% 100%",
  "--success": "108 73% 40%",
  "--warning": "38 100% 45%",
  "--border": "235 25% 40%",
  "--input": "235 25% 40%",
  "--ring": "217 100% 57%",
  "--radius": "0.75rem",
  "--glass-blur": "16px",
  "--glass-saturate": "1.2",
  "--lb-blue": "36, 119, 255",
  "--lb-link": "24, 112, 220",
};

export function applyDesignTokens(el: HTMLElement = document.documentElement) {
  el.classList.add("dark");
  el.dataset.appTheme = "light-blue";
  el.style.colorScheme = "dark";
  for (const [key, value] of Object.entries(cssVarMap)) {
    el.style.setProperty(key, value);
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", designTokens.backgroundBase);
}
