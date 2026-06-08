import { Loader2 } from "lucide-react";
import { motion } from "framer-motion";

interface PullRefreshIndicatorProps {
  offset: number;
  refreshing?: boolean;
}

export function PullRefreshIndicator({ offset, refreshing }: PullRefreshIndicatorProps) {
  if (offset <= 0 && !refreshing) return null;
  return (
    <motion.div
      className="flex items-center justify-center py-2 text-primary"
      style={{ height: Math.max(offset, refreshing ? 40 : 0) }}
      initial={false}
      animate={{ opacity: offset > 20 || refreshing ? 1 : 0 }}
    >
      <Loader2 className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} />
    </motion.div>
  );
}
