import { motion } from "framer-motion";
import { fadeInUp, staggerContainer } from "../lib/animations";

export function VisionSection() {
  return (
    <section className="py-24 relative section-dark">
      <div className="max-w-4xl mx-auto px-6 text-center">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={staggerContainer}
        >
          <motion.div variants={fadeInUp} className="section-badge mb-8">
            The Vision
          </motion.div>

          <motion.h2
            variants={fadeInUp}
            className="text-3xl md:text-5xl font-bold text-white mb-6 leading-tight"
          >
            Every agent, same standards.
            <br />
            <span className="text-[#00FF2A] font-semibold">
              Every developer, in sync.
            </span>
          </motion.h2>

          <motion.p variants={fadeInUp} className="text-xl text-gray-400 mb-8">
            Stop fighting config drift across your organization.
            <br />
            GAL is the{" "}
            <span className="text-[#00FF2A] font-semibold">
              source of truth for AI agent instructions
            </span>
            .
          </motion.p>

          <motion.div
            variants={fadeInUp}
            className="flex flex-wrap justify-center gap-3"
          >
            {["GitHub Native", "Multi-Agent Support", "One Command Sync"].map(
              (tag) => (
                <div
                  key={tag}
                  className="px-4 py-2 rounded-lg bg-white/5 border border-white/10 text-gray-300 text-sm hover:border-[#00FF2A]/40 hover:text-white transition-all"
                >
                  {tag}
                </div>
              ),
            )}
          </motion.div>
        </motion.div>
      </div>
    </section>
  );
}
