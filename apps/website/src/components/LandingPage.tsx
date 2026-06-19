"use client";

import { FEATURE_FLAGS } from "@/src/config";
import { Header, Footer } from "@/src/layout";
import { IntercomWidget } from "@/src/widgets";
import {
  HeroSection,
  TerminalDemo,
  ProblemSection,
  SolutionSection,
  HowItWorksSection,
  WhyGALSection,
  FounderQuoteSection,
  FeaturesSection,
  PricingSection,
  VisionSection,
  EarlyAccessSection,
  CTASection,
} from "@/src/sections";

function App() {
  return (
    <div className="min-h-screen bg-white">
      <IntercomWidget />
      <Header />
      <main>
        <HeroSection />
        <TerminalDemo />
        <ProblemSection />
        <SolutionSection />
        <HowItWorksSection />
        <WhyGALSection />
        <FounderQuoteSection />
        <FeaturesSection />
        {FEATURE_FLAGS.showPricing && <PricingSection />}
        <VisionSection />
        {FEATURE_FLAGS.showEarlyAccessForm && <EarlyAccessSection />}
        <CTASection />
      </main>
      <Footer />
    </div>
  );
}

export { App as LandingPage };
