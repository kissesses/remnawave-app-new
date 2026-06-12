import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface SectionShellProps {
  id?: string;
  children: ReactNode;
  className?: string;
  title?: string;
  subtitle?: string;
}

export function SectionShell({ id, children, className, title, subtitle }: SectionShellProps) {
  return (
    <section id={id} className={cn("relative px-4 py-20 md:px-8 lg:px-16 lg:py-28", className)}>
      <div className="mx-auto max-w-7xl">
        {(title || subtitle) && (
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: "-80px" }}
            transition={{ duration: 0.6 }}
            className="mb-12 text-center md:mb-16"
          >
            {subtitle && (
              <p className="mb-3 text-sm font-semibold uppercase tracking-[0.2em] text-stealthx-accent">
                {subtitle}
              </p>
            )}
            {title && (
              <h2 className="text-3xl font-bold tracking-tight text-stealthx-text md:text-4xl lg:text-5xl">
                {title}
              </h2>
            )}
          </motion.div>
        )}
        {children}
      </div>
    </section>
  );
}
