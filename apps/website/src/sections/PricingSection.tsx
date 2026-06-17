import { motion } from "framer-motion";
import { CheckCircle2, Zap } from "lucide-react";
import { fadeInUp, staggerContainer } from "../lib/animations";
import { DASHBOARD_URL } from "../config";

export function PricingSection() {
  return (
    <section className="py-24 relative bg-white overflow-hidden" id="pricing">
      {/* Huge background chevron */}
      <svg
        className="absolute -top-32 -left-32 w-[500px] h-[500px]"
        viewBox="0 0 36 36"
        fill="none"
      >
        <path
          d="M8 12L18 6L28 12V18L18 12L8 18V12Z"
          fill="#F3F4F6"
          fillOpacity="0.8"
        />
        <path
          d="M8 18L18 12L28 18V24L18 18L8 24V18Z"
          fill="#E5E7EB"
          fillOpacity="0.6"
        />
        <path
          d="M8 24L18 18L28 24V30L18 24L8 30V24Z"
          fill="#D1D5DB"
          fillOpacity="0.4"
        />
      </svg>

      <div className="relative max-w-6xl mx-auto px-6">
        {/* Header - Left aligned */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="flex flex-col justify-center"
          >
            <div className="flex items-center gap-2 mb-6">
              <div className="w-2 h-2 rounded-full bg-gray-900" />
              <span className="text-xs font-bold text-gray-900 uppercase tracking-wider">
                Pricing
              </span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 leading-tight">
              Simple,
              <br />
              Transparent
            </h2>
          </motion.div>

          {/* Price highlight card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-gray-50 rounded-2xl p-8 flex flex-col justify-center border border-gray-100"
          >
            <div className="text-6xl font-black text-gray-900 mb-2">$10</div>
            <p className="text-gray-500">per developer, per month</p>
          </motion.div>
        </div>

        {/* Plan Card */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={staggerContainer}
          className="flex justify-center mb-12"
        >
          {/* Convenience */}
          <motion.div
            variants={fadeInUp}
            className="relative group rounded-2xl p-8 bg-gray-900 overflow-hidden max-w-md w-full"
          >
            <div className="mb-6">
              <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#00FF2A] text-black">
                <Zap className="w-3.5 h-3.5" />
                RECOMMENDED
              </span>
            </div>

            <h3 className="text-2xl font-bold text-white mb-2">Convenience</h3>
            <p className="text-gray-400 text-sm mb-6">
              Config discovery, approval, and sync for teams
            </p>

            <div className="flex items-baseline gap-2 mb-8">
              <span className="text-5xl font-bold text-white">$10</span>
              <span className="text-gray-500">/dev/month</span>
            </div>

            <div className="space-y-4 mb-8">
              {[
                "GitHub App integration",
                "Auto-discovery + approved configs",
                "CLI sync + approval workflows",
              ].map((item, i) => (
                <div key={i} className="flex items-center gap-3">
                  <CheckCircle2 className="w-4 h-4 text-[#00FF2A] flex-shrink-0" />
                  <span className="text-gray-300 text-sm">{item}</span>
                </div>
              ))}
            </div>

            <a
              href={`${DASHBOARD_URL}/billing`}
              className="block w-full py-3.5 px-6 rounded-xl font-semibold transition-all bg-[#00FF2A] text-black hover:bg-[#00D639] text-center"
            >
              Get Started
            </a>
          </motion.div>
        </motion.div>

        {/* What's Included */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
        >
          <div className="flex items-center justify-center gap-3 mb-8">
            <div className="h-px flex-1 max-w-[100px] bg-gradient-to-r from-transparent to-gray-200" />
            <span className="text-sm font-semibold text-gray-400 uppercase tracking-wider">
              All Plans Include
            </span>
            <div className="h-px flex-1 max-w-[100px] bg-gradient-to-l from-transparent to-gray-200" />
          </div>

          <div className="flex flex-wrap justify-center gap-3">
            {[
              "Unlimited repos",
              "Auto-discovery",
              "Approved configs",
              "Approval workflows",
              "CLI sync",
              "Team sharing",
              "GitHub App",
              "Priority support",
            ].map((feature, i) => (
              <div
                key={i}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gray-50 border border-gray-200 hover:border-gray-300 transition-all"
              >
                <div className="w-1.5 h-1.5 rounded-full bg-[#00FF2A]" />
                <span className="text-sm text-gray-600">{feature}</span>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </section>
  );
}
