import { useCallback, useRef, useState } from "react";
import { useTelegram } from "./use-telegram";

const THRESHOLD = 72;

export function usePullRefresh(onRefresh: () => Promise<void>) {
  const { haptic } = useTelegram();
  const [pulling, setPulling] = useState(false);
  const [offset, setOffset] = useState(0);
  const startY = useRef(0);
  const refreshing = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const el = e.currentTarget as HTMLElement;
    if (el.scrollTop > 0 || refreshing.current) return;
    startY.current = e.touches[0].clientY;
    setPulling(true);
  }, []);

  const onTouchMove = useCallback(
    (e: React.TouchEvent) => {
      if (!pulling || refreshing.current) return;
      const el = e.currentTarget as HTMLElement;
      if (el.scrollTop > 0) {
        setPulling(false);
        setOffset(0);
        return;
      }
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0) {
        setOffset(Math.min(dy * 0.5, 100));
      }
    },
    [pulling],
  );

  const onTouchEnd = useCallback(async () => {
    if (!pulling) return;
    setPulling(false);
    if (offset >= THRESHOLD && !refreshing.current) {
      refreshing.current = true;
      haptic("light");
      try {
        await onRefresh();
        haptic("success");
      } finally {
        refreshing.current = false;
      }
    }
    setOffset(0);
  }, [pulling, offset, onRefresh, haptic]);

  return {
    pullProps: { onTouchStart, onTouchMove, onTouchEnd },
    pullOffset: offset,
    isRefreshing: refreshing.current,
  };
}
