import { motion } from "framer-motion";
import { GitBranch, Users, Zap, Layers, Eye, ArrowRight } from "lucide-react";
import { fadeInUp, staggerContainer } from "../lib/animations";
import { openIntercom } from "../lib/intercom";

export function WhyGALSection() {
  return (
    <section className="py-24 relative bg-gray-50 overflow-hidden">
      {/* Huge background chevron */}
      <svg
        className="absolute -bottom-24 -right-24 w-[450px] h-[450px]"
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
        {/* Centered Header */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 mb-6">
            <div className="w-2 h-2 rounded-full bg-[#00FF2A]" />
            <span className="text-xs font-bold text-[#00FF2A] uppercase tracking-wider">
              Benefits
            </span>
          </div>
          <h2 className="text-4xl md:text-5xl font-bold text-gray-900 leading-tight mb-4">
            What Makes GAL Different?
          </h2>
          <p className="text-xl text-gray-600 max-w-2xl mx-auto">
            Simple governance that just works. Discover configs across all
            repos, set approved standards, and sync them to every developer.
          </p>
        </motion.div>

        {/* Cards Grid - 3 columns with left-aligned content */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={staggerContainer}
          className="grid md:grid-cols-3 gap-4"
        >
          {/* Card 1 */}
          <motion.div
            variants={fadeInUp}
            className="bg-white rounded-2xl p-8 min-h-[280px]"
          >
            <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center mb-16">
              <GitBranch className="w-7 h-7 text-gray-600" />
            </div>
            <h4 className="text-lg font-bold text-gray-900 mb-2">
              GitHub Native
            </h4>
            <p className="text-gray-500 text-sm">
              One-click install. Auto-discovers configs across all your repos.
              No setup required.
            </p>
          </motion.div>

          {/* Card 2 */}
          <motion.div
            variants={fadeInUp}
            className="bg-white rounded-2xl p-8 min-h-[280px]"
          >
            <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center mb-16">
              <Users className="w-7 h-7 text-gray-600" />
            </div>
            <h4 className="text-lg font-bold text-gray-900 mb-2">
              Team-Wide Standards
            </h4>
            <p className="text-gray-500 text-sm">
              Set org-approved configs that apply to everyone. New hires get the
              right setup from day one.
            </p>
          </motion.div>

          {/* Card 3 */}
          <motion.div
            variants={fadeInUp}
            className="bg-white rounded-2xl p-8 min-h-[280px]"
          >
            <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center mb-16">
              <Zap className="w-7 h-7 text-gray-600" />
            </div>
            <h4 className="text-lg font-bold text-gray-900 mb-2">
              One Command Sync
            </h4>
            <p className="text-gray-500 text-sm">
              Developers run{" "}
              <code className="text-[#00FF2A] font-medium bg-gray-100 px-1.5 py-0.5 rounded">
                gal sync
              </code>{" "}
              and they're done. Zero friction.
            </p>
          </motion.div>

          {/* Card 4 */}
          <motion.div
            variants={fadeInUp}
            className="bg-white rounded-2xl p-8 min-h-[280px]"
          >
            <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center mb-16">
              <Layers className="w-7 h-7 text-gray-600" />
            </div>
            <h4 className="text-lg font-bold text-gray-900 mb-2">
              Test & Approve
            </h4>
            <p className="text-gray-500 text-sm">
              Developers test workflows locally, then submit for approval. Only
              validated workflows get distributed org-wide.
            </p>
          </motion.div>

          {/* Card 5 */}
          <motion.div
            variants={fadeInUp}
            className="bg-white rounded-2xl p-8 min-h-[280px]"
          >
            <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center mb-16">
              <Eye className="w-7 h-7 text-gray-600" />
            </div>
            <h4 className="text-lg font-bold text-gray-900 mb-2">
              Full Visibility
            </h4>
            <p className="text-gray-500 text-sm">
              See every agent config across your organization. Know what's
              running where, always.
            </p>
          </motion.div>

          {/* CTA Card - Green accent like RedAccess red card */}
          <motion.div
            variants={fadeInUp}
            className="bg-[#00FF2A] rounded-2xl p-8 min-h-[280px] flex flex-col justify-between cursor-pointer group"
            onClick={openIntercom}
          >
            <div className="w-10 h-10 rounded-lg bg-black/10 flex items-center justify-center">
              <Zap className="w-5 h-5 text-black" />
            </div>
            <div>
              <h4 className="text-xl font-bold text-black mb-4">
                See GAL in action
              </h4>
              <div className="flex items-center justify-between bg-black rounded-lg px-4 py-3 group-hover:bg-gray-900 transition-colors">
                <span className="text-white text-sm font-medium uppercase tracking-wide">
                  See a Demo
                </span>
                <ArrowRight className="w-4 h-4 text-white" />
              </div>
            </div>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
