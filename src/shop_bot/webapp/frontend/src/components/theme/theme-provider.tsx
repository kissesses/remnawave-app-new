import { useEffect } from "react";
import { applyDesignTokens } from "@/lib/design-tokens";

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    applyDesignTokens();
  }, []);
  return <>{children}</>;
}
