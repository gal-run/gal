import { motion } from "framer-motion";

export function FounderQuoteSection() {
  return (
    <section className="py-24 relative section-dark overflow-hidden">
      {/* Huge background chevron */}
      <svg
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-[0.03]"
        viewBox="0 0 36 36"
        fill="none"
      >
        <path d="M8 12L18 6L28 12V18L18 12L8 18V12Z" fill="white" />
        <path
          d="M8 18L18 12L28 18V24L18 18L8 24V18Z"
          fill="white"
          fillOpacity="0.6"
        />
        <path
          d="M8 24L18 18L28 24V30L18 24L8 30V24Z"
          fill="white"
          fillOpacity="0.3"
        />
      </svg>

      <div className="relative max-w-6xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="grid md:grid-cols-12 gap-8 items-center"
        >
          {/* Large quote mark */}
          <div className="md:col-span-2 flex justify-center md:justify-end">
            <span className="text-[120px] md:text-[180px] font-serif text-[#00FF2A] leading-none opacity-80">
              &ldquo;
            </span>
          </div>

          {/* Quote text */}
          <div className="md:col-span-8">
            <p className="text-2xl md:text-4xl font-bold text-white leading-snug mb-6">
              The vision of GAL is to be the{" "}
              <span className="text-[#00FF2A]">foundation</span> of SDLC coding
              agent automation.
            </p>
            <div className="flex items-center gap-4">
              <div className="w-12 h-px bg-[#00FF2A]" />
              <span className="text-gray-400 text-sm uppercase tracking-wider">
                Our Mission
              </span>
            </div>
          </div>

          {/* Decorative element */}
          <div className="hidden md:flex md:col-span-2 justify-start">
            <div className="w-16 h-16 rounded-2xl bg-[#00FF2A]/10 border border-[#00FF2A]/20 flex items-center justify-center">
              <svg viewBox="0 0 36 36" className="w-8 h-8" fill="none">
                <path d="M8 12L18 6L28 12V18L18 12L8 18V12Z" fill="#00FF2A" />
                <path
                  d="M8 18L18 12L28 18V24L18 18L8 24V18Z"
                  fill="#00FF2A"
                  fillOpacity="0.6"
                />
                <path
                  d="M8 24L18 18L28 24V30L18 24L8 30V24Z"
                  fill="#00FF2A"
                  fillOpacity="0.3"
                />
              </svg>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
