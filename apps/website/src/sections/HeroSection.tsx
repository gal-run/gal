import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { HeroIntegrationDiagram } from "../components/HeroIntegrationDiagram";
import { DASHBOARD_URL } from "../config";
import { fadeInUp, staggerContainer } from "../lib/animations";

export function HeroSection() {
  return (
    <section className="relative min-h-screen pt-20 overflow-hidden">
      {/* Split background */}
      <div className="absolute inset-0 flex">
        <div className="w-full lg:w-[50%] bg-gray-50" />
        <div className="hidden lg:block w-[50%] bg-white" />
      </div>

      {/* Huge background chevron - teasing the logo */}
      <svg
        className="absolute -bottom-32 -right-32 w-[500px] h-[500px]"
        viewBox="0 0 36 36"
        fill="none"
      >
        <path
          d="M8 12L18 6L28 12V18L18 12L8 18V12Z"
          fill="#E5E7EB"
          fillOpacity="0.4"
        />
        <path
          d="M8 18L18 12L28 18V24L18 18L8 24V18Z"
          fill="#D1D5DB"
          fillOpacity="0.3"
        />
        <path
          d="M8 24L18 18L28 24V30L18 24L8 30V24Z"
          fill="#9CA3AF"
          fillOpacity="0.2"
        />
      </svg>

      <div className="relative z-10 max-w-7xl mx-auto">
        <div className="grid lg:grid-cols-2 min-h-[calc(100vh-80px)]">
          {/* Left side - Text content */}
          <div className="flex flex-col justify-center px-6 lg:px-12 py-16 lg:py-24">
            <motion.div
              initial="hidden"
              animate="visible"
              variants={staggerContainer}
              className="space-y-6"
            >
              {/* Main heading */}
              <motion.h1
                variants={fadeInUp}
                className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-[1.1] tracking-tight"
              >
                <span className="text-gray-900">The </span>
                <span className="text-[#00FF2A]">Governance Layer</span>
                <br />
                <span className="text-gray-900">for Coding Agents</span>
              </motion.h1>

              {/* Subheading */}
              <motion.p
                variants={fadeInUp}
                className="text-lg text-gray-600 max-w-lg leading-relaxed"
              >
                gal is a config-and-policy control plane for AI coding
                agents — it discovers, standardizes, and installs one{" "}
                <em className="text-gray-900 not-italic font-medium">
                  canonical ruleset
                </em>{" "}
                as hooks across Claude Code, Cursor, Copilot, Gemini,
                Windsurf, and Codex (per-tool blocking enforcement is in
                active development).
              </motion.p>

              {/* CTA button */}
              <motion.div variants={fadeInUp} className="pt-4">
                <a
                  href={`${DASHBOARD_URL}/login`}
                  className="inline-flex items-center gap-2 px-8 py-4 bg-[#00FF2A] text-black text-base font-semibold rounded-lg hover:bg-[#00D639] transition-all shadow-lg hover:shadow-xl"
                  style={{ boxShadow: "0 4px 20px rgba(0, 255, 42, 0.3)" }}
                >
                  GET STARTED
                  <ArrowRight className="w-5 h-5" />
                </a>
              </motion.div>

              {/* Backed by branding */}
              <motion.div variants={fadeInUp} className="pt-6">
                <span className="text-sm text-gray-500">
                  Backed by{" "}
                  <span className="text-gray-700 font-medium">
                    Scheduler Systems Ltd
                  </span>
                </span>
              </motion.div>
            </motion.div>
          </div>

          {/* Right side - Visual diagram */}
          <div className="hidden lg:flex items-center justify-center p-8 bg-white">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              className="w-full h-full"
            >
              <HeroIntegrationDiagram />
            </motion.div>
          </div>
        </div>
      </div>
    </section>
  );
}
