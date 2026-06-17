import { motion } from "framer-motion";
import { Eye, Shield, Zap } from "lucide-react";

export function HowItWorksSection() {
  return (
    <section className="py-24 relative bg-gray-50 overflow-hidden">
      {/* Huge background chevron */}
      <svg
        className="absolute -top-20 -left-40 w-[400px] h-[400px]"
        viewBox="0 0 36 36"
        fill="none"
      >
        <path
          d="M8 12L18 6L28 12V18L18 12L8 18V12Z"
          fill="#E5E7EB"
          fillOpacity="0.5"
        />
        <path
          d="M8 18L18 12L28 18V24L18 18L8 24V18Z"
          fill="#D1D5DB"
          fillOpacity="0.4"
        />
        <path
          d="M8 24L18 18L28 24V30L18 24L8 30V24Z"
          fill="#9CA3AF"
          fillOpacity="0.3"
        />
      </svg>

      <div className="relative max-w-6xl mx-auto px-6">
        {/* Header row - asymmetric layout */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {/* Left: Section header - LEFT aligned */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="flex flex-col justify-center"
          >
            <div className="flex items-center gap-2 mb-6">
              <div className="w-2 h-2 rounded-full bg-gray-900" />
              <span className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                How It Works
              </span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 leading-tight">
              Three Steps to
              <br />
              Full Governance
            </h2>
          </motion.div>

          {/* Right: Featured card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-white rounded-2xl p-8 border border-gray-200"
          >
            <div className="text-6xl font-black text-gray-900 mb-4">5min</div>
            <h4 className="text-xl font-bold text-gray-900 mb-2">Setup Time</h4>
            <p className="text-gray-500">
              From zero to full governance in under 5 minutes. No complex
              configurations.
            </p>
          </motion.div>
        </div>

        {/* Steps - horizontal cards */}
        <div className="grid md:grid-cols-3 gap-6">
          {/* Step 1 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.1 }}
            className="relative bg-white rounded-2xl p-6 border border-gray-200 hover:border-gray-900 transition-all group"
          >
            <div className="absolute -top-4 -left-2 text-7xl font-black text-gray-100 group-hover:text-gray-200 transition-colors">
              01
            </div>
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mb-4">
                <Eye className="w-6 h-6 text-gray-900" />
              </div>
              <h4 className="text-lg font-bold text-gray-900 mb-2">
                Discovery
              </h4>
              <p className="text-sm text-gray-500">
                Connect GitHub and instantly see all agent configurations across
                your organization's repos.
              </p>
            </div>
          </motion.div>

          {/* Step 2 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.2 }}
            className="relative bg-white rounded-2xl p-6 border border-gray-200 hover:border-gray-900 transition-all group"
          >
            <div className="absolute -top-4 -left-2 text-7xl font-black text-gray-100 group-hover:text-gray-200 transition-colors">
              02
            </div>
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-gray-100 flex items-center justify-center mb-4">
                <Shield className="w-6 h-6 text-gray-900" />
              </div>
              <h4 className="text-lg font-bold text-gray-900 mb-2">
                Define Standards
              </h4>
              <p className="text-sm text-gray-500">
                Set org-wide rules, permissions, and best practices in one
                centralized place.
              </p>
            </div>
          </motion.div>

          {/* Step 3 - Accent card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ delay: 0.3 }}
            className="relative bg-gray-900 rounded-2xl p-6 group"
          >
            <div className="absolute -top-4 -left-2 text-7xl font-black text-white/10">
              03
            </div>
            <div className="relative">
              <div className="w-12 h-12 rounded-xl bg-[#00FF2A] flex items-center justify-center mb-4">
                <Zap className="w-6 h-6 text-gray-900" />
              </div>
              <h4 className="text-lg font-bold text-white mb-2">
                Sync & Deploy
              </h4>
              <p className="text-sm text-gray-400">
                Run{" "}
                <code className="bg-white/10 text-[#00FF2A] px-1.5 py-0.5 rounded font-mono text-xs">
                  gal sync --pull
                </code>{" "}
                and every developer gets the approved config instantly.
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
