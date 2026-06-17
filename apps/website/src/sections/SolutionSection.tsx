import { motion } from "framer-motion";
import { SandboxVisualization } from "../components/SandboxVisualization";
import { fadeInUp, staggerContainer } from "../lib/animations";

export function SolutionSection() {
  return (
    <section className="py-24 relative section-dark" id="how-it-works">
      <div className="relative max-w-6xl mx-auto px-6">
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={staggerContainer}
          className="text-center mb-16"
        >
          <motion.div variants={fadeInUp} className="section-badge mb-6">
            The Solution
          </motion.div>
          <motion.h2
            variants={fadeInUp}
            className="text-4xl md:text-5xl font-bold mb-6"
          >
            <span className="text-white">One source of truth. </span>
            <span className="text-[#00FF2A] font-semibold">
              For every agent.
            </span>
          </motion.h2>
          <motion.p
            variants={fadeInUp}
            className="text-xl text-gray-400 max-w-3xl mx-auto"
          >
            GAL discovers configs across your repos, lets you define org-wide
            standards, and syncs them to every developer's machine with a single
            command.
          </motion.p>
        </motion.div>

        {/* 3D Visualization */}
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
        >
          <SandboxVisualization />
        </motion.div>
      </div>
    </section>
  );
}
