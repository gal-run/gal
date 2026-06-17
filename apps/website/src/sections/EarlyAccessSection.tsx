"use client";

import { motion } from "framer-motion";
import { ArrowRight, Check, Users } from "lucide-react";
import { useState } from "react";

type State = "idle" | "loading" | "success" | "error";

export function EarlyAccessSection() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<State>("idle");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || state === "loading") return;

    setState("loading");
    try {
      const res = await fetch("/api/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      setState(res.ok ? "success" : "error");
    } catch {
      setState("error");
    }
  }

  return (
    <section className="py-20 bg-gray-50 border-y border-gray-100">
      <div className="max-w-3xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
        >
          {/* Social proof */}
          <div className="flex items-center justify-center gap-2 mb-6">
            <Users className="w-4 h-4 text-gray-400" />
            <span className="text-sm text-gray-500">
              Join teams already using GAL to govern their AI agents
            </span>
          </div>

          <h2 className="text-3xl md:text-4xl font-bold text-gray-900 mb-4">
            Not ready to sign up yet?
          </h2>
          <p className="text-lg text-gray-500 mb-8">
            Get product updates, early access to new features, and governance
            best practices — straight to your inbox.
          </p>

          {state === "success" ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="flex items-center justify-center gap-3 py-4 px-6 bg-[#00FF2A]/10 border border-[#00FF2A]/30 rounded-xl inline-flex"
            >
              <Check className="w-5 h-5 text-[#00D639]" />
              <span className="text-gray-900 font-medium">
                You&apos;re on the list. We&apos;ll be in touch.
              </span>
            </motion.div>
          ) : (
            <form
              onSubmit={handleSubmit}
              className="flex flex-col sm:flex-row gap-3 max-w-md mx-auto"
            >
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@company.com"
                required
                className="flex-1 px-4 py-3 rounded-lg border border-gray-200 bg-white text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#00FF2A]/50 focus:border-[#00FF2A] transition-all"
              />
              <button
                type="submit"
                disabled={state === "loading"}
                className="flex items-center justify-center gap-2 px-6 py-3 bg-gray-900 text-white font-semibold rounded-lg hover:bg-gray-700 disabled:opacity-60 transition-all whitespace-nowrap"
              >
                {state === "loading" ? (
                  "Sending..."
                ) : (
                  <>
                    Stay Updated
                    <ArrowRight className="w-4 h-4" />
                  </>
                )}
              </button>
            </form>
          )}

          {state === "error" && (
            <p className="mt-3 text-sm text-red-500">
              Something went wrong. Try again or email us at{" "}
              <a href="mailto:hello@gal.run" className="underline">
                hello@gal.run
              </a>
            </p>
          )}

          <p className="mt-4 text-xs text-gray-400">
            No spam. Unsubscribe any time.
          </p>
        </motion.div>
      </div>
    </section>
  );
}
