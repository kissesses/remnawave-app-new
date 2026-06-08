/** Light Blue cabinet design system (inspired by flatlogic/light-blue-react, MIT) */

export type ResolvedTheme = "light" | "dark";

export const designTokens = {
  dark: {
    backgroundBase: "#1B1E3F",
    metaThemeColor: "#1B1E3F",
  },
  light: {
    backgroundBase: "#F5F7FB",
    metaThemeColor: "#F5F7FB",
  },
} as const;

const darkCssVarMap: Record<string, string> = {
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

const lightCssVarMap: Record<string, string> = {
  "--background": "220 33% 97%",
  "--foreground": "222 47% 11%",
  "--card": "0 0% 100%",
  "--card-foreground": "222 47% 11%",
  "--card-elevated": "220 20% 96%",
  "--primary": "217 100% 50%",
  "--primary-foreground": "0 0% 100%",
  "--secondary": "220 14% 92%",
  "--secondary-foreground": "222 47% 11%",
  "--accent": "213 79% 48%",
  "--accent-foreground": "0 0% 100%",
  "--muted": "220 9% 46%",
  "--muted-foreground": "220 9% 46%",
  "--destructive": "356 71% 51%",
  "--destructive-foreground": "0 0% 100%",
  "--success": "108 73% 35%",
  "--warning": "38 100% 45%",
  "--border": "220 13% 87%",
  "--input": "220 13% 87%",
  "--ring": "217 100% 50%",
  "--radius": "0.75rem",
  "--glass-blur": "12px",
  "--glass-saturate": "1.1",
  "--lb-blue": "36, 119, 255",
  "--lb-link": "24, 112, 220",
};

export function resolveThemeMode(mode: "system" | "light" | "dark"): ResolvedTheme {
  if (mode === "light") return "light";
  if (mode === "dark") return "dark";
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) {
    return "dark";
  }
  return "light";
}

export function applyDesignTokens(
  theme: ResolvedTheme = "dark",
  el: HTMLElement = document.documentElement,
) {
  const cssVarMap = theme === "light" ? lightCssVarMap : darkCssVarMap;
  el.classList.toggle("dark", theme === "dark");
  el.classList.toggle("light", theme === "light");
  el.dataset.appTheme = "light-blue";
  el.style.colorScheme = theme;
  for (const [key, value] of Object.entries(cssVarMap)) {
    el.style.setProperty(key, value);
  }
  const meta = document.querySelector('meta[name="theme-color"]');
  meta?.setAttribute("content", designTokens[theme].metaThemeColor);
}
