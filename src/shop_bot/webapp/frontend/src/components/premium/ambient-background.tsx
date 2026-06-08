import { motion } from "framer-motion";

export function AmbientBackground() {
  return (
    <div className="ambient-bg pointer-events-none fixed inset-0 z-0 overflow-hidden" aria-hidden>
      <motion.div
        className="ambient-orb ambient-orb--1"
        animate={{ x: [0, 24, 0], y: [0, -16, 0], scale: [1, 1.08, 1] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="ambient-orb ambient-orb--2"
        animate={{ x: [0, -20, 0], y: [0, 12, 0], scale: [1, 1.05, 1] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="ambient-orb ambient-orb--3"
        animate={{ opacity: [0.4, 0.7, 0.4] }}
        transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
      />
      <div className="ambient-grid" />
    </div>
  );
}
