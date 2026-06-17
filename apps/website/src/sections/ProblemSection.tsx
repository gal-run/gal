import { motion } from "framer-motion";
import { AlertTriangle, Search, ShieldX, RefreshCw } from "lucide-react";
import { fadeInUp, staggerContainer } from "../lib/animations";

export function ProblemSection() {
  return (
    <section className="py-24 relative bg-gray-50 overflow-hidden" id="why-gal">
      <div className="relative max-w-6xl mx-auto px-6">
        {/* Header row - asymmetric layout */}
        <div className="grid md:grid-cols-2 gap-8 mb-8">
          {/* Left: Section header - LEFT aligned */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="flex flex-col justify-center"
          >
            <div className="flex items-center gap-2 mb-6">
              <div className="w-2 h-2 rounded-full bg-red-500" />
              <span className="text-xs font-bold text-red-500 uppercase tracking-wider">
                The Problem
              </span>
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-gray-900 leading-tight">
              Agent Configs Are
              <br />
              Everywhere
            </h2>
          </motion.div>

          {/* Right: Featured problem card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-white rounded-2xl p-8"
          >
            <div className="w-16 h-16 rounded-xl bg-red-50 flex items-center justify-center mb-6">
              <AlertTriangle className="w-8 h-8 text-red-500" />
            </div>
            <h4 className="text-xl font-bold text-gray-900 mb-2">
              No Central Control
            </h4>
            <p className="text-gray-500">
              Every developer configures AI agents their own way. No visibility,
              no standards, no governance.
            </p>
          </motion.div>
        </div>

        {/* Cards Grid */}
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
            className="bg-white rounded-2xl p-8 min-h-[260px]"
          >
            <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center mb-16">
              <Search className="w-7 h-7 text-gray-600" />
            </div>
            <h4 className="text-lg font-bold text-gray-900 mb-2">Can't Find</h4>
            <p className="text-gray-500 text-sm">
              You don't know what agent configs exist across your repos.
            </p>
          </motion.div>

          {/* Card 2 */}
          <motion.div
            variants={fadeInUp}
            className="bg-white rounded-2xl p-8 min-h-[260px]"
          >
            <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center mb-16">
              <ShieldX className="w-7 h-7 text-gray-600" />
            </div>
            <h4 className="text-lg font-bold text-gray-900 mb-2">
              Can't Standardize
            </h4>
            <p className="text-gray-500 text-sm">
              No approval process. Every developer configures agents their own
              way.
            </p>
          </motion.div>

          {/* Card 3 */}
          <motion.div
            variants={fadeInUp}
            className="bg-white rounded-2xl p-8 min-h-[260px]"
          >
            <div className="w-14 h-14 rounded-xl bg-gray-100 flex items-center justify-center mb-16">
              <RefreshCw className="w-7 h-7 text-gray-600" />
            </div>
            <h4 className="text-lg font-bold text-gray-900 mb-2">
              Can't Distribute
            </h4>
            <p className="text-gray-500 text-sm">
              No easy way to sync approved configs to your team.
            </p>
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
