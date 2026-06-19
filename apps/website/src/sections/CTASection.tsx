import { motion } from "framer-motion";
import { ArrowRight } from "lucide-react";
import { DASHBOARD_URL } from "../config";
import { openIntercom } from "../lib/intercom";

export function CTASection() {
  return (
    <section className="relative py-32 overflow-hidden">
      {/* Animated cyberpunk background */}
      <div className="absolute inset-0 bg-[#0A0A0B]">
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: `
              linear-gradient(rgba(0, 255, 42, 0.3) 1px, transparent 1px),
              linear-gradient(90deg, rgba(0, 255, 42, 0.3) 1px, transparent 1px)
            `,
            backgroundSize: "50px 50px",
          }}
        />
        {/* Radial glow from center */}
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, rgba(0, 255, 42, 0.15) 0%, transparent 60%)",
          }}
        />
        {/* Scanline effect */}
        <div
          className="absolute inset-0 opacity-5"
          style={{
            backgroundImage:
              "repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(0, 255, 42, 0.1) 2px, rgba(0, 255, 42, 0.1) 4px)",
          }}
        />
        {/* Perspective lines converging to center */}
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            className="w-full h-full max-w-4xl"
            style={{
              background: `
                linear-gradient(to right, transparent 49.5%, rgba(0, 255, 42, 0.1) 49.5%, rgba(0, 255, 42, 0.1) 50.5%, transparent 50.5%)
              `,
            }}
          />
        </div>
      </div>

      <div className="relative max-w-4xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          {/* Terminal-style badge */}
          <div className="inline-flex items-center gap-2 px-4 py-2 mb-8 rounded-full bg-[#00FF2A]/10 border border-[#00FF2A]/30">
            <span className="w-2 h-2 rounded-full bg-[#00FF2A] animate-pulse" />
            <span className="text-[#00FF2A] text-sm font-mono">
              FREE DEVELOPER TIER
            </span>
          </div>

          <h2 className="text-4xl md:text-5xl lg:text-6xl font-bold text-white mb-6 leading-tight">
            Start Governing Your Agents
          </h2>
          <p className="text-xl text-gray-400 mb-10 max-w-2xl mx-auto">
            Sign up free and see how GAL discovers, standardizes, and syncs
            agent configs across your entire organization in minutes.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            <a
              href={`${DASHBOARD_URL}/billing`}
              className="group px-8 py-4 text-lg font-semibold bg-[#00FF2A] text-black rounded-lg hover:bg-[#00FF2A]/90 transition-all shadow-[0_0_30px_rgba(0,255,42,0.4)] hover:shadow-[0_0_50px_rgba(0,255,42,0.6)] flex items-center gap-3"
            >
              Start Free
              <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
            </a>
            <button
              onClick={openIntercom}
              className="px-8 py-4 text-lg font-semibold text-white border border-white/20 rounded-lg hover:border-[#00FF2A]/50 hover:bg-white/5 transition-all"
            >
              See a Demo
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
