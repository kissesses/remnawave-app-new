import { motion } from "framer-motion";
import { Download, ChevronRight } from "lucide-react";
import { NeonButton } from "@/components/stealthx/NeonButton";
import { ParticleField } from "@/components/stealthx/ParticleField";
import { ParallaxLayer } from "@/components/stealthx/ParallaxLayer";
import { useSmoothScroll } from "@/hooks/use-smooth-scroll";

export function HeroSection() {
  const { scrollTo } = useSmoothScroll();

  return (
    <section className="relative min-h-screen overflow-hidden pt-24">
      <ParticleField count={50} />
      <div className="sx-hero-glow absolute inset-0" />

      <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-4 py-16 md:px-8 lg:grid-cols-2 lg:gap-16 lg:py-24">
        <motion.div
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          className="flex flex-col gap-6"
        >
          <p className="text-sm font-semibold uppercase tracking-[0.25em] text-stealthx-accent">
            VPN сервис нового поколения
          </p>
          <h1 className="text-4xl font-bold leading-tight tracking-tight text-stealthx-text md:text-5xl lg:text-6xl">
            ТВОЯ СВОБОДА.
            <br />
            ТВОЯ БЕЗОПАСНОСТЬ.
            <br />
            <span className="sx-text-gradient">STEALTHX.</span>
          </h1>
          <p className="max-w-lg text-lg text-stealthx-muted">
            STEALTHX — быстрый, защищённый и анонимный VPN-сервис для свободного интернета.
          </p>
          <div className="flex flex-wrap gap-4">
            <NeonButton size="lg">
              <Download className="h-5 w-5" />
              Скачать для Windows
            </NeonButton>
            <NeonButton variant="outline" size="lg" onClick={() => scrollTo("#pricing")}>
              Выбрать тариф
              <ChevronRight className="h-5 w-5" />
            </NeonButton>
          </div>
        </motion.div>

        <ParallaxLayer intensity={0.015} className="relative flex justify-center lg:justify-end">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1, delay: 0.2 }}
            className="relative h-[420px] w-full max-w-md md:h-[520px]"
          >
            <div className="absolute inset-0 rounded-3xl bg-gradient-to-br from-stealthx-accent/30 via-stealthx-card to-stealthx-bg opacity-80" />
            <div
              className="absolute inset-0 rounded-3xl"
              style={{
                background:
                  "radial-gradient(ellipse at 50% 30%, rgba(139,92,255,0.4) 0%, transparent 60%)",
              }}
            />
            <div className="absolute bottom-0 left-1/2 h-[85%] w-[70%] -translate-x-1/2">
              <div className="relative h-full w-full">
                <div className="absolute inset-x-0 bottom-0 top-[15%] rounded-t-[40%] bg-gradient-to-t from-stealthx-accent/20 to-transparent" />
                <div className="absolute left-1/2 top-[8%] h-16 w-16 -translate-x-1/2 rounded-full bg-gradient-to-b from-white/30 to-stealthx-glow/50 blur-sm" />
                <div className="absolute left-1/2 top-[18%] h-32 w-24 -translate-x-1/2 rounded-full bg-gradient-to-b from-stealthx-muted/40 to-stealthx-card" />
                <div className="absolute left-1/2 top-[35%] h-48 w-36 -translate-x-1/2 rounded-2xl bg-gradient-to-b from-stealthx-card to-stealthx-bg/80 shadow-neon" />
              </div>
            </div>
            <div className="absolute -right-4 top-1/4 h-32 w-32 rounded-full bg-stealthx-accent/20 blur-3xl" />
            <div className="absolute -left-4 bottom-1/4 h-24 w-24 rounded-full bg-stealthx-glow/15 blur-2xl" />
          </motion.div>
        </ParallaxLayer>
      </div>
    </section>
  );
}
