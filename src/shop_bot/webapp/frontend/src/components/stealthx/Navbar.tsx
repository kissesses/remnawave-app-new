import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Download } from "lucide-react";
import { Logo } from "./Logo";
import { NeonButton } from "./NeonButton";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { label: "Преимущества", href: "#features" },
  { label: "Функции", href: "#servers" },
  { label: "Тарифы", href: "#pricing" },
  { label: "Поддержка", href: "#faq" },
];

interface NavbarProps {
  className?: string;
}

export function Navbar({ className }: NavbarProps) {
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 20);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const scrollTo = (href: string) => {
    setMenuOpen(false);
    const el = document.querySelector(href);
    el?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <motion.header
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5 }}
      className={cn(
        "fixed left-0 right-0 top-0 z-50 px-4 py-4 transition-all duration-300 md:px-8",
        scrolled ? "sx-glass-elevated shadow-lg" : "bg-transparent",
        className,
      )}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between">
        <Logo size="sm" />

        <nav className="hidden items-center gap-8 md:flex">
          {NAV_LINKS.map((link) => (
            <button
              key={link.href}
              type="button"
              onClick={() => scrollTo(link.href)}
              className="text-sm text-stealthx-muted transition-colors hover:text-stealthx-text"
            >
              {link.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-3">
          <NeonButton size="sm" className="hidden sm:inline-flex">
            <Download className="h-4 w-4" />
            Скачать
          </NeonButton>
          <button
            type="button"
            className="flex h-10 w-10 flex-col items-center justify-center gap-1.5 md:hidden"
            onClick={() => setMenuOpen(!menuOpen)}
            aria-label="Меню"
          >
            <span className={cn("h-0.5 w-5 bg-stealthx-text transition-transform", menuOpen && "translate-y-2 rotate-45")} />
            <span className={cn("h-0.5 w-5 bg-stealthx-text transition-opacity", menuOpen && "opacity-0")} />
            <span className={cn("h-0.5 w-5 bg-stealthx-text transition-transform", menuOpen && "-translate-y-2 -rotate-45")} />
          </button>
        </div>
      </div>

      {menuOpen && (
        <motion.nav
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mt-4 flex flex-col gap-3 border-t border-white/10 pt-4 md:hidden"
        >
          {NAV_LINKS.map((link) => (
            <button
              key={link.href}
              type="button"
              onClick={() => scrollTo(link.href)}
              className="py-2 text-left text-stealthx-muted hover:text-stealthx-text"
            >
              {link.label}
            </button>
          ))}
          <NeonButton size="sm" className="w-full">
            <Download className="h-4 w-4" />
            Скачать
          </NeonButton>
        </motion.nav>
      )}
    </motion.header>
  );
}
