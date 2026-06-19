"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Chrome,
  Command,
  Download,
  Globe,
  Keyboard,
  Monitor,
  Shield,
  Terminal,
} from "lucide-react";
import { DASHBOARD_URL } from "@/src/config";
import { Footer, Header } from "@/src/layout";
import { fadeInUp, staggerContainer } from "@/src/lib/animations";
import { IntercomWidget } from "@/src/widgets";

const CHROME_WEB_STORE_URL =
  "https://chromewebstore.google.com/detail/gal-governance-chrome-extension";

const supportedSites = [
  { name: "Claude.ai", category: "LLM Chat" },
  { name: "ChatGPT", category: "LLM Chat" },
  { name: "Gemini", category: "LLM Chat" },
  { name: "GitHub Copilot", category: "Code" },
  { name: "Midjourney", category: "Image" },
  { name: "Ideogram", category: "Image" },
  { name: "Leonardo.ai", category: "Image" },
  { name: "RunwayML", category: "Video" },
  { name: "Pika", category: "Video" },
];

const cliCommands = [
  {
    command: "gal sync --pull",
    description: "Pull approved config from your organization",
  },
  {
    command: "gal auth login",
    description: "Authenticate with GitHub",
  },
  {
    command: "gal config",
    description: "View and manage CLI configuration",
  },
  {
    command: "gal status",
    description: "Check sync status and drift",
  },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-[#070809] text-white">
      <IntercomWidget />
      <Header />

      <main className="pt-28">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-white/10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(0,255,42,0.16),_transparent_42%),radial-gradient(circle_at_bottom_right,_rgba(0,255,42,0.08),_transparent_34%)]" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#00FF2A]/60 to-transparent" />

          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="relative max-w-6xl mx-auto px-6 py-20 md:py-28"
          >
            <motion.div
              variants={fadeInUp}
              className="inline-flex items-center gap-2 section-badge mb-8"
            >
              Documentation
            </motion.div>

            <motion.div variants={fadeInUp}>
              <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[0.95] text-white">
                Get started with{" "}
                <span className="text-[#00FF2A]">GAL</span>
              </h1>
              <p className="mt-6 max-w-2xl text-lg md:text-xl text-gray-300 leading-relaxed">
                Install the CLI, browser extension, or VS Code extension to
                bring org-approved AI agent governance into your workflow.
              </p>
            </motion.div>
          </motion.div>
        </section>

        {/* Chrome Extension Section */}
        <section id="chrome-extension" className="border-b border-white/10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="max-w-6xl mx-auto px-6 py-20"
          >
            <motion.div variants={fadeInUp} className="flex items-center gap-3 mb-2">
              <Chrome className="w-6 h-6 text-[#00FF2A]" />
              <h2 className="text-3xl md:text-4xl font-bold text-white">
                Chrome Extension
              </h2>
            </motion.div>
            <motion.p
              variants={fadeInUp}
              className="text-gray-400 mb-10 max-w-2xl"
            >
              Access your organization&apos;s approved commands and policies
              directly inside Claude, ChatGPT, Gemini, and other AI platforms.
            </motion.p>

            <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
              {/* Install card */}
              <motion.div
                variants={fadeInUp}
                className="rounded-[24px] border border-white/10 bg-white/[0.03] p-8"
              >
                <div className="flex items-center gap-3 mb-6">
                  <Download className="w-5 h-5 text-[#00FF2A]" />
                  <h3 className="text-xl font-semibold text-white">Install</h3>
                </div>

                <a
                  href={CHROME_WEB_STORE_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-3 w-full px-6 py-4 rounded-2xl bg-white text-black font-semibold text-base transition-transform hover:-translate-y-0.5 mb-6"
                >
                  <Chrome className="w-5 h-5" />
                  Add to Chrome
                  <ArrowRight className="w-4 h-4" />
                </a>

                <div className="space-y-4 text-sm text-gray-400">
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-[#00FF2A]/10 border border-[#00FF2A]/20 flex items-center justify-center text-[#00FF2A] text-xs font-bold shrink-0">
                      1
                    </span>
                    <span>
                      Click the button above to open the Chrome Web Store listing.
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-[#00FF2A]/10 border border-[#00FF2A]/20 flex items-center justify-center text-[#00FF2A] text-xs font-bold shrink-0">
                      2
                    </span>
                    <span>
                      Click <strong className="text-white">&quot;Add to Chrome&quot;</strong> and
                      confirm the permissions prompt.
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-[#00FF2A]/10 border border-[#00FF2A]/20 flex items-center justify-center text-[#00FF2A] text-xs font-bold shrink-0">
                      3
                    </span>
                    <span>
                      Click the GAL icon in your toolbar and{" "}
                      <strong className="text-white">sign in with GitHub</strong>.
                    </span>
                  </div>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 w-5 h-5 rounded-full bg-[#00FF2A]/10 border border-[#00FF2A]/20 flex items-center justify-center text-[#00FF2A] text-xs font-bold shrink-0">
                      4
                    </span>
                    <span>
                      Select your organization and start browsing approved commands.
                    </span>
                  </div>
                </div>
              </motion.div>

              {/* Features card */}
              <motion.div
                variants={fadeInUp}
                className="rounded-[24px] border border-white/10 bg-white/[0.03] p-8"
              >
                <div className="flex items-center gap-3 mb-6">
                  <Command className="w-5 h-5 text-[#00FF2A]" />
                  <h3 className="text-xl font-semibold text-white">
                    Features
                  </h3>
                </div>

                <div className="space-y-5">
                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-[#00FF2A]/10 border border-[#00FF2A]/20 flex items-center justify-center text-[#00FF2A] shrink-0">
                      <Monitor className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-medium text-white">
                        Floating command palette
                      </div>
                      <div className="text-sm text-gray-400 mt-1">
                        A green button appears on supported AI sites. Click it
                        to open your org&apos;s approved commands.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-[#00FF2A]/10 border border-[#00FF2A]/20 flex items-center justify-center text-[#00FF2A] shrink-0">
                      <Keyboard className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-medium text-white">
                        Keyboard shortcut
                      </div>
                      <div className="text-sm text-gray-400 mt-1">
                        Press{" "}
                        <code className="px-1.5 py-0.5 rounded bg-white/10 text-xs text-white">
                          Cmd+Shift+P
                        </code>{" "}
                        (Mac) or{" "}
                        <code className="px-1.5 py-0.5 rounded bg-white/10 text-xs text-white">
                          Ctrl+Shift+P
                        </code>{" "}
                        (Windows/Linux) to open the palette.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-[#00FF2A]/10 border border-[#00FF2A]/20 flex items-center justify-center text-[#00FF2A] shrink-0">
                      <Globe className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-medium text-white">
                        Multi-platform support
                      </div>
                      <div className="text-sm text-gray-400 mt-1">
                        Works on Claude.ai, ChatGPT, Gemini, GitHub, Midjourney,
                        and more.
                      </div>
                    </div>
                  </div>

                  <div className="flex items-start gap-4">
                    <div className="w-10 h-10 rounded-xl bg-[#00FF2A]/10 border border-[#00FF2A]/20 flex items-center justify-center text-[#00FF2A] shrink-0">
                      <Shield className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="font-medium text-white">
                        Privacy-first
                      </div>
                      <div className="text-sm text-gray-400 mt-1">
                        Only communicates with GAL API. No browsing history
                        tracked, no data sent to third parties.
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>

            {/* Supported sites */}
            <motion.div
              variants={fadeInUp}
              className="mt-8 rounded-[24px] border border-white/10 bg-white/[0.03] p-8"
            >
              <h3 className="text-lg font-semibold text-white mb-4">
                Supported Sites
              </h3>
              <div className="flex flex-wrap gap-2">
                {supportedSites.map((site) => (
                  <span
                    key={site.name}
                    className="px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03] text-sm text-gray-300"
                  >
                    {site.name}
                  </span>
                ))}
              </div>
            </motion.div>
          </motion.div>
        </section>

        {/* CLI Section */}
        <section id="cli" className="border-b border-white/10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="max-w-6xl mx-auto px-6 py-20"
          >
            <motion.div variants={fadeInUp} className="flex items-center gap-3 mb-2">
              <Terminal className="w-6 h-6 text-[#00FF2A]" />
              <h2 className="text-3xl md:text-4xl font-bold text-white">
                CLI
              </h2>
            </motion.div>
            <motion.p
              variants={fadeInUp}
              className="text-gray-400 mb-10 max-w-2xl"
            >
              Install the GAL CLI to sync approved configurations, manage
              policies, and integrate governance into your terminal workflow.
            </motion.p>

            <div className="grid gap-8 lg:grid-cols-[1fr_1fr]">
              {/* Install */}
              <motion.div
                variants={fadeInUp}
                className="rounded-[24px] border border-white/10 bg-white/[0.03] p-8"
              >
                <h3 className="text-xl font-semibold text-white mb-6">
                  Install
                </h3>

                <div className="rounded-xl bg-black/50 border border-white/10 p-4 mb-6 font-mono text-sm">
                  <div className="text-gray-500 mb-2"># Install via npm</div>
                  <div className="text-[#00FF2A]">
                    npm install -g @anthropic-ai/gal
                  </div>
                  <div className="text-gray-500 mt-4 mb-2">
                    # Or via Homebrew (macOS)
                  </div>
                  <div className="text-[#00FF2A]">
                    brew install scheduler-systems/tap/gal
                  </div>
                </div>

                <div className="text-sm text-gray-400">
                  After installing, authenticate with your GitHub account:
                </div>
                <div className="mt-3 rounded-xl bg-black/50 border border-white/10 p-4 font-mono text-sm">
                  <div className="text-[#00FF2A]">gal auth login</div>
                </div>
              </motion.div>

              {/* Common commands */}
              <motion.div
                variants={fadeInUp}
                className="rounded-[24px] border border-white/10 bg-white/[0.03] p-8"
              >
                <h3 className="text-xl font-semibold text-white mb-6">
                  Common Commands
                </h3>

                <div className="space-y-4">
                  {cliCommands.map((item) => (
                    <div key={item.command} className="flex items-start gap-3">
                      <code className="shrink-0 px-2 py-1 rounded-lg bg-black/50 border border-white/10 text-sm text-[#00FF2A] font-mono">
                        {item.command}
                      </code>
                      <span className="text-sm text-gray-400 pt-1">
                        {item.description}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          </motion.div>
        </section>

        {/* CTA */}
        <section className="max-w-6xl mx-auto px-6 py-20">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="rounded-[32px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.04),rgba(0,255,42,0.08))] p-8 md:p-12 text-center"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-white">
              Ready to get started?
            </h2>
            <p className="mt-4 text-lg text-gray-300 max-w-xl mx-auto">
              Sign up for free and bring governance to every AI coding agent in
              your organization.
            </p>
            <div className="mt-8 flex flex-wrap justify-center gap-4">
              <a
                href={`${DASHBOARD_URL}/login`}
                className="inline-flex items-center gap-2 rounded-full bg-white px-6 py-3 text-sm font-semibold text-black transition-transform hover:-translate-y-0.5"
              >
                Get Started Free
                <ArrowRight className="w-4 h-4" />
              </a>
              <Link
                href="/"
                className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition-colors hover:border-[#00FF2A]/40 hover:text-[#00FF2A]"
              >
                Back to Home
              </Link>
            </div>
          </motion.div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
