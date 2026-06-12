import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

const TAB_ORDER = ["/app", "/app/wallet", "/app/profile", "/app/support"];

const STACK_PREFIXES = ["/app/history", "/app/notifications", "/app/settings", "/app/vpn", "/app/keys"];

function isStack(path: string) {
  return STACK_PREFIXES.some((p) => path.startsWith(p));
}

function tabIndex(path: string) {
  if (path === "/app" || path === "/app/") return 0;
  const idx = TAB_ORDER.findIndex((t) => t !== "/app" && path.startsWith(t));
  return idx >= 0 ? idx : 0;
}

function stackDepth(path: string) {
  return path.split("/").filter(Boolean).length;
}

export function useNavigationDirection() {
  const location = useLocation();
  const prevRef = useRef(location.pathname);
  const [direction, setDirection] = useState(1);

  useEffect(() => {
    const prev = prevRef.current;
    const next = location.pathname;
    if (prev === next) return;

    const prevStack = isStack(prev);
    const nextStack = isStack(next);
    let dir = 1;

    if (!prevStack && nextStack) {
      dir = 1;
    } else if (prevStack && !nextStack) {
      dir = -1;
    } else if (!prevStack && !nextStack) {
      dir = tabIndex(next) >= tabIndex(prev) ? 1 : -1;
    } else {
      dir = stackDepth(next) >= stackDepth(prev) ? 1 : -1;
    }

    setDirection(dir);
    prevRef.current = next;
  }, [location.pathname]);

  return {
    direction,
    isStack: isStack(location.pathname),
  };
}
