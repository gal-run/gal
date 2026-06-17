import { motion } from "framer-motion";

export function TerminalDemo() {
  return (
    <section className="relative py-24 overflow-hidden bg-white">
      <div className="max-w-5xl mx-auto px-6">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6 }}
          className="terminal "
        >
          {/* Terminal header */}
          <div className="terminal-header flex items-center gap-2 px-4 py-3">
            <div className="flex gap-2">
              <div className="w-3 h-3 rounded-full bg-red-500/80" />
              <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
              <div className="w-3 h-3 rounded-full bg-green-500/80" />
            </div>
            <span className="ml-4 text-xs text-gray-500 font-mono">
              AI Agent — your-project
            </span>
          </div>

          {/* Terminal content - Claude Code session with GAL hooks */}
          <div className="p-6 font-mono text-sm space-y-3">
            {/* User prompt */}
            <div className="flex items-start gap-2">
              <span className="text-[#00FF2A]">&gt;</span>
              <span className="text-gray-700">
                yesterday we installed playwright mcp extensions, did we have a
                document created on how to do it?
              </span>
            </div>

            {/* GAL Hook Notification - UserPromptSubmit */}
            <div className="pl-4 py-2 border-l-2 border-amber-500">
              <div className="flex items-center gap-2 text-amber-400 text-xs">
                <span>{"\u2514"}</span>
                <span>UserPromptSubmit says:</span>
                <span className="text-amber-300">
                  {"\uD83D\uDD10"} GAL: Authentication required. Run: gal auth login
                </span>
              </div>
            </div>

            <div className="my-4 divider" />

            {/* Search operations */}
            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <span className="text-[#00FF2A]">{"\u25CF"}</span>
              <span>Search (pattern: {"\u201C"}playwright.*mcp|mcp.*playwright{"\u201D"})</span>
            </div>
            <div className="pl-4 text-gray-600 text-xs">
              {"\u2514"} Found 83 files (ctrl+o to expand)
            </div>

            <div className="flex items-center gap-2 text-gray-500 text-xs">
              <span className="text-[#00FF2A]">{"\u25CF"}</span>
              <span>Search (pattern: {"\u201C"}**/*playwright*.md{"\u201D"})</span>
            </div>

            <div className="my-4 divider" />

            {/* Discovered commands notification */}
            <div className="text-gray-600 text-xs mb-2">
              // Discovered slash commands from org config:
            </div>

            <div className="space-y-2">
              {[
                {
                  name: "/code-review",
                  desc: "AI-assisted code review with security checks",
                  tools: ["Read", "Grep", "Bash"],
                },
                {
                  name: "/generate-tests",
                  desc: "Generate Playwright E2E tests for feature",
                  tools: ["Read", "Write", "Bash"],
                },
              ].map((cmd) => (
                <div
                  key={cmd.name}
                  className="pl-4 py-2 border-l-2 border-[#00FF2A]"
                >
                  <div className="flex items-center gap-2">
                    <span className="text-[#00FF2A] font-semibold">
                      {cmd.name}
                    </span>
                  </div>
                  <div className="text-gray-500 text-xs mt-1">{cmd.desc}</div>
                  <div className="text-gray-600 text-xs mt-1">
                    Allowed tools:{" "}
                    {cmd.tools.map((t, i) => (
                      <span key={t} className="text-sky-400">
                        {t}
                        {i < cmd.tools.length - 1 ? ", " : ""}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="my-4 divider" />

            <div className="text-gray-500 text-xs">
              <span className="text-[#00FF2A]">[GAL]</span> 12 org commands
              loaded {"\u2022"} Policy:{" "}
              <span className="text-sky-400">production-safe</span>
            </div>

            <div className="flex items-start gap-2 mt-4">
              <span className="text-[#00FF2A]">&gt;</span>
              <span className="text-[#00FF2A] cursor-blink"></span>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
