"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  CheckCircle2,
  Eye,
  GitBranch,
  Lock,
  Shield,
  Sparkles,
} from "lucide-react";
import { DASHBOARD_URL } from "@/src/config";
import { Footer, Header } from "@/src/layout";
import { fadeInUp, staggerContainer } from "@/src/lib/animations";
import { IntercomWidget } from "@/src/widgets";

const northStar = [
  {
    title: "Full Visibility",
    description:
      "Know which agents, instructions, hooks, and workflows are active across every repository.",
    icon: Eye,
  },
  {
    title: "Approved Baselines",
    description:
      "Move from ad-hoc agent setup to a single org-owned standard that teams can trust.",
    icon: Shield,
  },
  {
    title: "Zero-Friction Compliance",
    description:
      "Make the safe path the easy path so every developer stays aligned without extra ceremony.",
    icon: Sparkles,
  },
];

const principles = [
  "Org-first governance that respects how engineering teams actually work.",
  "Transparent policy and runtime visibility instead of hidden prompts and guesswork.",
  "Sync beats mandate: approved standards should flow naturally into daily developer tooling.",
  "Multi-agent by design, because enterprises will not standardize on a single vendor forever.",
  "Security at the source, where instructions, tools, and network access are actually controlled.",
];

const roadmap = [
  {
    phase: "Phase 1",
    title: "Foundation",
    description:
      "Discover every agent config, establish approved baselines, and make sync effortless for developers.",
  },
  {
    phase: "Phase 2",
    title: "Enforcement",
    description:
      "Move from visibility into runtime controls, auditability, and policy-backed confidence for security teams.",
  },
  {
    phase: "Phase 3",
    title: "Automation",
    description:
      "Let GAL coordinate compliant agent workflows automatically across the SDLC, not just document them.",
  },
];

const problemCards = [
  {
    title: "Config Drift",
    description:
      "Every repo and every developer accumulates its own agent instructions, tools, and exceptions.",
  },
  {
    title: "Invisible Risk",
    description:
      "Security teams cannot govern what they cannot see, and most agent behavior is hidden in scattered files.",
  },
  {
    title: "Operational Drag",
    description:
      "Standardizing by docs alone fails. Teams need a real control plane, not another policy PDF.",
  },
];

export default function VisionPage() {
  return (
    <div className="min-h-screen bg-[#070809] text-white">
      <IntercomWidget />
      <Header />

      <main className="pt-28">
        <section className="relative overflow-hidden border-b border-white/10">
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(0,255,42,0.16),_transparent_42%),radial-gradient(circle_at_bottom_right,_rgba(0,255,42,0.08),_transparent_34%)]" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#00FF2A]/60 to-transparent" />

          <motion.div
            initial="hidden"
            animate="visible"
            variants={staggerContainer}
            className="relative max-w-6xl mx-auto px-6 py-20 md:py-28"
          >
            <motion.div variants={fadeInUp} className="inline-flex items-center gap-2 section-badge mb-8">
              Vision
            </motion.div>

            <div className="grid gap-10 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
              <motion.div variants={fadeInUp}>
                <h1 className="text-4xl md:text-6xl font-black tracking-tight leading-[0.95] text-white">
                  Every agent.
                  <br />
                  <span className="text-[#00FF2A]">Same standards.</span>
                </h1>
                <p className="mt-6 max-w-2xl text-lg md:text-xl text-gray-300 leading-relaxed">
                  GAL exists to turn AI coding agents from unmanaged local experiments into an
                  organization-wide capability with visibility, policy, and trust built in.
                </p>

                <div className="mt-8 flex flex-wrap gap-4">
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
                    Back to Landing
                  </Link>
                </div>
              </motion.div>

              <motion.div variants={fadeInUp}>
                <div className="rounded-[28px] border border-white/10 bg-white/[0.03] p-6 backdrop-blur-sm">
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-gray-500">
                        Mission
                      </div>
                      <div className="mt-3 text-xl font-semibold text-white">
                        Governance for the agent era
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-gray-500">
                        Operating Model
                      </div>
                      <div className="mt-3 text-xl font-semibold text-white">
                        Discover, approve, enforce, automate
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-gray-500">
                        Outcome
                      </div>
                      <div className="mt-3 text-xl font-semibold text-white">
                        Every developer in sync
                      </div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
                      <div className="text-xs uppercase tracking-[0.2em] text-gray-500">
                        Standard
                      </div>
                      <div className="mt-3 text-xl font-semibold text-white">
                        Runtime controls, not static promises
                      </div>
                    </div>
                  </div>
                </div>
              </motion.div>
            </div>
          </motion.div>
        </section>

        <section className="max-w-6xl mx-auto px-6 py-20">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="grid gap-6 lg:grid-cols-3"
          >
            {problemCards.map((card) => (
              <motion.div
                key={card.title}
                variants={fadeInUp}
                className="rounded-[24px] border border-white/10 bg-white/[0.03] p-6"
              >
                <div className="text-xs uppercase tracking-[0.22em] text-[#00FF2A]">
                  The Problem
                </div>
                <h2 className="mt-4 text-2xl font-semibold text-white">{card.title}</h2>
                <p className="mt-3 text-sm leading-6 text-gray-400">{card.description}</p>
              </motion.div>
            ))}
          </motion.div>
        </section>

        <section className="border-y border-white/10 bg-white/[0.02]">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="max-w-6xl mx-auto px-6 py-20"
          >
            <motion.div variants={fadeInUp} className="max-w-2xl">
              <div className="section-badge mb-6">Our North Star</div>
              <h2 className="text-3xl md:text-5xl font-bold text-white">
                One control plane for every coding agent in the enterprise.
              </h2>
              <p className="mt-5 text-lg text-gray-300 leading-relaxed">
                The long-term product is not a library of prompt files. It is the operating
                system that makes agent usage visible, governable, and automatable across the SDLC.
              </p>
            </motion.div>

            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              {northStar.map((item) => {
                const Icon = item.icon;
                return (
                  <motion.div
                    key={item.title}
                    variants={fadeInUp}
                    className="rounded-[24px] border border-white/10 bg-black/30 p-6"
                  >
                    <div className="w-12 h-12 rounded-2xl bg-[#00FF2A]/10 border border-[#00FF2A]/20 flex items-center justify-center text-[#00FF2A]">
                      <Icon className="w-5 h-5" />
                    </div>
                    <h3 className="mt-5 text-2xl font-semibold text-white">{item.title}</h3>
                    <p className="mt-3 text-sm leading-6 text-gray-400">{item.description}</p>
                  </motion.div>
                );
              })}
            </div>
          </motion.div>
        </section>

        <section className="max-w-6xl mx-auto px-6 py-20 grid gap-14 lg:grid-cols-[0.9fr_1.1fr]">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
          >
            <motion.div variants={fadeInUp} className="section-badge mb-6">
              Principles
            </motion.div>
            <motion.h2 variants={fadeInUp} className="text-3xl md:text-5xl font-bold text-white">
              Product principles that scale beyond a single tool vendor.
            </motion.h2>
            <motion.p variants={fadeInUp} className="mt-5 text-lg text-gray-300 leading-relaxed">
              GAL should make secure, standardized agent usage feel natural to engineering teams,
              not imposed from the outside.
            </motion.p>
          </motion.div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="space-y-4"
          >
            {principles.map((principle) => (
              <motion.div
                key={principle}
                variants={fadeInUp}
                className="rounded-[20px] border border-white/10 bg-white/[0.03] px-5 py-4 flex items-start gap-3"
              >
                <CheckCircle2 className="w-5 h-5 mt-0.5 text-[#00FF2A] shrink-0" />
                <p className="text-sm leading-6 text-gray-300">{principle}</p>
              </motion.div>
            ))}
          </motion.div>
        </section>

        <section className="border-t border-white/10">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={staggerContainer}
            className="max-w-6xl mx-auto px-6 py-20"
          >
            <motion.div variants={fadeInUp} className="max-w-2xl">
              <div className="section-badge mb-6">Where We&apos;re Headed</div>
              <h2 className="text-3xl md:text-5xl font-bold text-white">
                A roadmap from visibility to full agent automation.
              </h2>
            </motion.div>

            <div className="mt-12 grid gap-5 lg:grid-cols-3">
              {roadmap.map((item) => (
                <motion.div
                  key={item.phase}
                  variants={fadeInUp}
                  className="rounded-[24px] border border-white/10 bg-white/[0.03] p-6"
                >
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs uppercase tracking-[0.22em] text-[#00FF2A]">
                      {item.phase}
                    </span>
                    <div className="flex items-center gap-2 text-gray-500">
                      {item.phase === "Phase 1" && <Eye className="w-4 h-4" />}
                      {item.phase === "Phase 2" && <Lock className="w-4 h-4" />}
                      {item.phase === "Phase 3" && <GitBranch className="w-4 h-4" />}
                    </div>
                  </div>
                  <h3 className="mt-5 text-2xl font-semibold text-white">{item.title}</h3>
                  <p className="mt-3 text-sm leading-6 text-gray-400">{item.description}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </section>

        <section className="max-w-6xl mx-auto px-6 pb-24">
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            variants={fadeInUp}
            className="rounded-[32px] border border-white/10 bg-[linear-gradient(135deg,rgba(255,255,255,0.04),rgba(0,255,42,0.08))] p-8 md:p-12"
          >
            <div className="max-w-3xl">
              <div className="section-badge mb-6">Build Toward The Standard</div>
              <h2 className="text-3xl md:text-5xl font-bold text-white">
                The future is not more agent sprawl. It is governed velocity.
              </h2>
              <p className="mt-5 text-lg text-gray-300 leading-relaxed">
                If coding agents are becoming part of the SDLC, they need the same operational
                standards as source control, CI, and production infrastructure. That is the bar GAL
                is designed to meet.
              </p>
            </div>

            <div className="mt-8 flex flex-wrap gap-4">
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
                Learn More
              </Link>
            </div>
          </motion.div>
        </section>
      </main>

      <Footer />
    </div>
  );
}
