export const supportedAgents = [
  {
    agent: "Claude Code",
    configFiles: "`.claude/`, `CLAUDE.md`",
    localScan: "✓",
    localSync: "✓",
    memory: "Native",
  },
  {
    agent: "Cursor",
    configFiles: "`.cursor/rules/`, `.cursorrules`",
    localScan: "✓",
    localSync: "✓",
    memory: "Via GAL",
  },
  {
    agent: "GitHub Copilot",
    configFiles: "`.github/copilot-instructions.md`",
    localScan: "✓",
    localSync: "✓",
    memory: "Via GAL",
  },
  {
    agent: "Gemini CLI",
    configFiles: "`.gemini/`, `GEMINI.md`",
    localScan: "✓",
    localSync: "✓",
    memory: "Via GAL",
  },
  {
    agent: "Codex (OpenAI)",
    configFiles: "`AGENTS.md`",
    localScan: "✓",
    localSync: "✓",
    memory: "Via GAL",
  },
  {
    agent: "Windsurf",
    configFiles: "`.windsurfrules`, `.codeium/windsurf/memories/`",
    localScan: "✓",
    localSync: "✓",
    memory: "Native",
  },
  {
    agent: "Antigravity",
    configFiles: "`.gemini/antigravity/`",
    localScan: "✓",
    localSync: "✓",
    memory: "Native",
  },
  {
    agent: "Amp",
    configFiles: "`AGENTS.md`",
    localScan: "✓",
    localSync: "✓",
    memory: "Via GAL",
  },
];

export function renderSupportedAgentsSection() {
  const lines = [
    "This table is for local CLI support. MCP client compatibility is broader and is documented separately in the MCP section above.",
    "",
    "| Agent | Config Files | Local Scan | Local Sync | Memory |",
    "|-------|-------------|-----------|-----------|--------|",
  ];

  for (const row of supportedAgents) {
    lines.push(
      `| ${row.agent} | ${row.configFiles} | ${row.localScan} | ${row.localSync} | ${row.memory} |`,
    );
  }

  return lines.join("\n");
}
