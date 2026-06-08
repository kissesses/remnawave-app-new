import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { RouterProvider } from "react-router-dom";
import { Providers } from "@/app/providers";
import { router } from "@/app/router";
import { applyDesignTokens } from "@/lib/design-tokens";
import { useThemeStore } from "@/stores/theme-store";
import "./index.css";

applyDesignTokens();
useThemeStore.getState().applyResolved();

// Auth token helpers for FastAPI
if (!window.getAuthToken) {
  window.getAuthToken = () => {
    try {
      return localStorage.getItem("auth_token");
    } catch {
      return null;
    }
  };
  window.setAuthToken = (token: string) => {
    try {
      localStorage.setItem("auth_token", token);
      document.cookie = `auth_token=${encodeURIComponent(token)}; path=/; max-age=${30 * 86400}; SameSite=Lax`;
    } catch {
      /* ignore */
    }
  };
  window.removeAuthToken = () => {
    try {
      localStorage.removeItem("auth_token");
      document.cookie = "auth_token=; path=/; max-age=0";
    } catch {
      /* ignore */
    }
  };
}

const nativeFetch = window.fetch.bind(window);
window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
  const initCopy = { ...init, credentials: init?.credentials ?? "include" };
  const rawUrl = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  let path = rawUrl;
  try {
    path = new URL(rawUrl, window.location.origin).pathname;
  } catch {
    /* ignore */
  }
  const needsAuth = path.startsWith("/api/") && !path.startsWith("/api/auth/");
  if (needsAuth && window.getAuthToken) {
    const token = window.getAuthToken();
    if (token) {
      const headers = new Headers(initCopy.headers);
      if (!headers.has("Authorization")) {
        headers.set("Authorization", `Bearer ${token}`);
      }
      initCopy.headers = headers;
    }
  }
  return nativeFetch(input, initCopy);
};

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <Providers>
      <RouterProvider router={router} />
    </Providers>
  </StrictMode>,
);
