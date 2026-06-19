import { motion } from "framer-motion";
import { Eye, Shield, Zap, GitBranch, Layers, Users } from "lucide-react";
import { fadeInUp, staggerContainer } from "../lib/animations";

export function FeaturesSection() {
  const features = [
    {
      icon: Eye,
      title: "Config Discovery",
      description:
        "See every agent config across your GitHub org. Know exactly what instructions your agents are following.",
    },
    {
      icon: Shield,
      title: "Approved Config",
      description:
        "Define the official org-wide standard. One source of truth for agent behavior and permissions.",
    },
    {
      icon: Zap,
      title: "CLI Sync",
      description:
        "Developers pull approved configs with one command. Always up-to-date, never out of sync.",
    },
    {
      icon: GitBranch,
      title: "GitHub Integration",
      description:
        "Install the GitHub App and you're connected. Automatic discovery, no manual setup required.",
    },
    {
      icon: Layers,
      title: "Test & Approve",
      description:
        "Developers test workflows locally, submit for approval. Approved workflows sync to the entire org.",
    },
  ];

  return (
    <section
      className="py-24 relative section-dark overflow-hidden"
      id="features"
    >
      <div className="relative max-w-6xl mx-auto px-6">
        {/* Header row - asymmetric layout with title on RIGHT */}
        <div className="grid md:grid-cols-2 gap-8 mb-12">
          {/* Left: Featured card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            className="bg-white/[0.03] border border-white/10 rounded-2xl p-8 md:order-1"
          >
            <div className="w-16 h-16 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-6">
              <Users className="w-8 h-8 text-[#00FF2A]" />
            </div>
            <h4 className="text-xl font-bold text-white mb-2">
              Team Management
            </h4>
            <p className="text-gray-400">
              Invite team members, manage access levels. Everyone gets the same
              baseline config.
            </p>
          </motion.div>

          {/* Right: Section header - RIGHT aligned */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            whileInView={{ opacity: 1, x: 0 }}
            viewport={{ once: true }}
            className="flex flex-col justify-center md:order-2 md:text-right"
          >
            <div className="flex items-center gap-2 mb-6 md:justify-end">
              <span className="text-xs font-bold text-[#00FF2A] uppercase tracking-wider">
                Features
              </span>
              <div className="w-2 h-2 rounded-full bg-[#00FF2A]" />
            </div>
            <h2 className="text-4xl md:text-5xl font-bold text-white leading-tight">
              Configure Agents
              <br />
              With Confidence
            </h2>
          </motion.div>
        </div>

        {/* Cards Grid - asymmetric layout */}
        <motion.div
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
          variants={staggerContainer}
          className="grid md:grid-cols-3 gap-4"
        >
          {features.map((feature, index) => (
            <motion.div
              key={index}
              variants={fadeInUp}
              className="bg-white/[0.02] border border-white/10 rounded-2xl p-8 min-h-[260px] hover:bg-white/[0.04] hover:border-white/20 transition-all"
            >
              <div className="w-14 h-14 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center mb-16">
                <feature.icon className="w-7 h-7 text-gray-400" />
              </div>
              <h3 className="text-lg font-bold text-white mb-2">
                {feature.title}
              </h3>
              <p className="text-sm text-gray-500 leading-relaxed">
                {feature.description}
              </p>
            </motion.div>
          ))}
        </motion.div>
      </div>
    </section>
  );
}
