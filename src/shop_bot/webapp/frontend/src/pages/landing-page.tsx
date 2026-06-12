import { useEffect, useState } from "react";
import { applyStealthxTheme } from "@/lib/stealthx-tokens";
import { LoadingScreen } from "@/components/stealthx/LoadingScreen";
import { Navbar } from "@/components/stealthx/Navbar";
import { HeroSection } from "@/sections/hero-section";
import { VpnWidget } from "@/sections/vpn-widget";
import { FeaturesSection } from "@/sections/features-section";
import { ServersSection } from "@/sections/servers-section";
import { PricingSection } from "@/sections/pricing-section";
import { StatsSection } from "@/sections/stats-section";
import { TestimonialsSection } from "@/sections/testimonials-section";
import { FaqSection } from "@/sections/faq-section";
import { FooterSection } from "@/sections/footer-section";

export function LandingPage() {
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    applyStealthxTheme();
    document.documentElement.classList.add("stealthx-theme");
    document.body.classList.add("sx-landing-scroll");
    return () => {
      document.body.classList.remove("sx-landing-scroll");
    };
  }, []);

  return (
    <>
      {!loaded && <LoadingScreen onComplete={() => setLoaded(true)} />}
      <div className="stealthx-theme sx-ambient-gradient min-h-screen bg-stealthx-bg text-stealthx-text">
        <Navbar />
        <main>
          <HeroSection />
          <VpnWidget />
          <FeaturesSection />
          <ServersSection />
          <StatsSection />
          <PricingSection />
          <TestimonialsSection />
          <FaqSection />
        </main>
        <FooterSection />
      </div>
    </>
  );
}
