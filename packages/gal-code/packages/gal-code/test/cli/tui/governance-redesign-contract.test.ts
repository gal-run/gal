import { describe, expect, test } from "bun:test"
import {
  GOVERNANCE_APERTURE,
  GOVERNANCE_COMMANDS,
  GOVERNANCE_HOME_PLACEHOLDERS,
  GOVERNANCE_HOME_SUBTITLE,
  GOVERNANCE_HOME_TITLE,
  GOVERNANCE_LANES,
  GOVERNANCE_MESH,
  GOVERNANCE_TIPS,
  parseTip,
} from "../../../src/cli/cmd/tui/feature-plugins/governance/copy"
import {
  basename,
  hasGovernancePolicy,
  summarizeGovernance,
} from "../../../src/cli/cmd/tui/feature-plugins/governance/state"
import theme from "../../../src/cli/cmd/tui/context/theme/gal-code.json" with { type: "json" }

const banned = [
  "opencode",
  "OpenCode",
  "prompt rail",
  "prompt composer",
  "centered logo",
  "chat stack",
  "chat shell",
  "Ask gal.run anything",
  "Run a command",
] as const

function rejectLegacy(text: string) {
  banned.forEach((term) => {
    expect(text).not.toContain(term)
  })
}

function clean(text: string) {
  return text
    .replaceAll("No centered logo", "")
    .replaceAll("No inherited OpenCode", "")
    .replaceAll("No prompt rail", "")
}

describe("governance redesign contract", () => {
  test("positions GAL Code as a light governance coding agent", () => {
    expect(GOVERNANCE_HOME_TITLE).toEqual(["Governance", "cockpit"])
    expect(GOVERNANCE_HOME_SUBTITLE).toContain("Policy aperture")
    expect(GOVERNANCE_HOME_SUBTITLE).toContain("proof ledger")
    expect(GOVERNANCE_HOME_PLACEHOLDERS.normal).toContain("Dispatch a bounded governance swarm")
    expect(GOVERNANCE_HOME_PLACEHOLDERS.shell).toContain("gal code run --governance")
    expect(GOVERNANCE_APERTURE).toMatchObject({
      label: "policy aperture",
      mesh: "contract -> action -> evidence",
    })
    expect(GOVERNANCE_MESH.map((item) => item.label)).toEqual(["mesh", "swarm", "ledger"])
  })

  test("keeps governance intelligence distinct from a generic assistant entry", () => {
    expect(GOVERNANCE_LANES.map((lane) => lane.id)).toEqual(["scope", "inspect", "scale", "review"])
    expect(GOVERNANCE_LANES.find((lane) => lane.id === "scale")).toMatchObject({
      label: "lane 03",
      title: "Swarm",
      detail: "split bounded workers and reconcile",
      command: "@agents",
      tone: "success",
      indent: 9,
    })
    expect(GOVERNANCE_LANES.map((lane) => lane.indent)).toEqual([0, 4, 9, 3])
    expect(GOVERNANCE_COMMANDS.map((command) => command.label)).toEqual([
      "Scope",
      "Assess",
      "Scale",
      "Approve",
      "Record",
    ])
    expect(GOVERNANCE_TIPS.some((tip) => tip.includes("governed swarms"))).toBe(true)
  })

  test("keeps redesign copy free of inherited shell terms", async () => {
    rejectLegacy(GOVERNANCE_HOME_TITLE.join(" "))
    rejectLegacy(GOVERNANCE_HOME_SUBTITLE)
    rejectLegacy(JSON.stringify(GOVERNANCE_HOME_PLACEHOLDERS))
    rejectLegacy(JSON.stringify(GOVERNANCE_LANES))
    rejectLegacy(JSON.stringify(GOVERNANCE_COMMANDS))
    rejectLegacy(JSON.stringify(GOVERNANCE_TIPS))
    rejectLegacy(
      clean(await Bun.file(new URL("../../../../../docs/governance-agent-redesign.md", import.meta.url)).text()),
    )
  })

  test("parses highlighted governance tips", () => {
    expect(parseTip("Use {highlight}/review{/highlight} before closeout")).toEqual([
      { text: "Use ", highlight: false },
      { text: "/review", highlight: true },
      { text: " before closeout", highlight: false },
    ])
    expect(parseTip("{highlight}AGENTS.md{/highlight} first")).toEqual([
      { text: "AGENTS.md", highlight: true },
      { text: " first", highlight: false },
    ])
    expect(parseTip("plain signal")).toEqual([{ text: "plain signal", highlight: false }])
  })

  test("detects custom policy from top-level, agent, and mode rules", () => {
    expect(hasGovernancePolicy({})).toBe(false)
    expect(hasGovernancePolicy({ permission: { bash: "ask" } })).toBe(true)
    expect(hasGovernancePolicy({ tools: { write: false } })).toBe(true)
    expect(hasGovernancePolicy({ agent: { plan: { permission: { edit: "ask" } } } })).toBe(true)
    expect(hasGovernancePolicy({ mode: { build: { tools: { bash: true } } } })).toBe(true)
    expect(hasGovernancePolicy({ permission: { __originalKeys: [] } })).toBe(false)
  })

  test("summarizes governance risk and next actions from runtime facts", () => {
    expect(
      summarizeGovernance({
        branch: "feature/governance",
        config: { permission: { bash: "ask" } },
        permissions: [{}],
        questions: [{}],
        diffs: [{ path: "a.ts" }],
        lsp: [{ id: "ts" }],
        mcp: [{ status: "connected" }],
      }),
    ).toMatchObject({
      scope: "feature/governance",
      policy: "custom baseline",
      status: "approval pending",
      approvals: 2,
      changedFiles: 1,
      lsp: 1,
      mcpConnected: 1,
      mcpAttention: 0,
      risk: "high",
    })

    expect(
      summarizeGovernance({
        directory: "/tmp/project",
        mcp: [{ status: "needs_auth" }, { status: "needs_client_registration" }, { status: "failed" }],
      }),
    ).toMatchObject({
      scope: "project",
      status: "runtime attention",
      mcpAttention: 3,
      risk: "medium",
    })

    expect(
      summarizeGovernance({
        branch: "worker/governance",
        runtime: {
          decisions: 3,
          blocked: 1,
          holds: 1,
          clears: 2,
          latest: {
            tool: "bash",
            mode: "block",
            blocked: true,
            decision: "hold_for_operator_review",
            confidence: 1,
          },
        },
      }),
    ).toMatchObject({
      scope: "worker/governance",
      status: "runtime attention",
      runtimeDecisions: 3,
      runtimeBlocked: 1,
      runtimeHolds: 1,
      runtimeClears: 2,
      runtimeDecision: "hold_for_operator_review",
      runtimeTool: "bash",
      runtimeMode: "block",
      runtimeConfidence: 1,
      risk: "high",
    })

    expect(summarizeGovernance({ worktree: "/tmp/worktree", diffs: [{}] })).toMatchObject({
      scope: "worktree",
      status: "changes need review",
      risk: "medium",
    })

    expect(summarizeGovernance({})).toMatchObject({
      policy: "default baseline",
      status: "clear",
      risk: "low",
    })

    expect(
      summarizeGovernance({
        mcp: {
          github: { status: "connected" },
          sentry: { status: "failed" },
          empty: null,
        },
      }),
    ).toMatchObject({
      mcpConnected: 1,
      mcpAttention: 1,
      status: "runtime attention",
    })
  })

  test("keeps brand, success, warning, and info visually distinct", () => {
    const colors = theme.defs
    expect(colors.darkStep1).toBe("#000000")
    expect(colors.darkAccent).toBe("#00FF2A")
    expect(colors.darkStep9).toBe("#00FF2A")
    expect(colors.darkGreen).toBe("#00D639")
    expect(JSON.stringify(colors)).not.toContain("#7cf7d4")
    expect(JSON.stringify(colors)).not.toContain("#5ed3f3")
    expect(colors.darkAccent).not.toEqual(colors.darkCyan)
    expect(colors.darkAccent).not.toEqual(colors.darkGreen)
    expect(colors.darkOrange).not.toEqual(colors.darkGreen)
    expect(colors.darkRed).not.toEqual(colors.darkGreen)
    expect(theme.theme.accent.dark).toBe("darkAccent")
    expect(theme.theme.success.dark).toBe("darkGreen")
    expect(theme.theme.warning.dark).toBe("darkOrange")
    expect(theme.theme.info.dark).toBe("darkCyan")
  })

  test("documents the cockpit and directive dock shape", async () => {
    const doc = await Bun.file(new URL("../../../../../docs/governance-agent-redesign.md", import.meta.url)).text()

    expect(doc).toContain("asymmetric cockpit")
    expect(doc).toContain("directive dock")
    expect(doc).toContain("No centered logo")
    expect(doc).toContain("No inherited OpenCode")
    expect(doc).toContain("No prompt rail")
    rejectLegacy(clean(doc))
  })

  test("keeps the home implementation structurally away from the old centered shell", async () => {
    const home = await Bun.file(new URL("../../../src/cli/cmd/tui/routes/home.tsx", import.meta.url)).text()
    const sidebar = await Bun.file(
      new URL("../../../src/cli/cmd/tui/feature-plugins/sidebar/governance.tsx", import.meta.url),
    ).text()
    const prompt = await Bun.file(
      new URL("../../../src/cli/cmd/tui/component/prompt/index.tsx", import.meta.url),
    ).text()
    const sessionFooter = await Bun.file(
      new URL("../../../src/cli/cmd/tui/routes/session/footer.tsx", import.meta.url),
    ).text()
    const sessionSidebar = await Bun.file(
      new URL("../../../src/cli/cmd/tui/routes/session/sidebar.tsx", import.meta.url),
    ).text()
    const copy = await Bun.file(
      new URL("../../../src/cli/cmd/tui/feature-plugins/governance/copy.ts", import.meta.url),
    ).text()

    expect(home).toContain("GovernanceDeck")
    expect(home).toContain("GOVERNANCE_LANES")
    expect(home).toContain("GOVERNANCE_APERTURE")
    expect(home).toContain("GOVERNANCE_MESH")
    expect(home).toContain("evidence ledger")
    expect(home).toContain("directive dock")
    expect(home).toContain("useTerminalDimensions")
    expect(home).toContain("CompactDeck")
    expect(home).toContain("RunwayBoard")
    expect(home).toContain("LaneStrip")
    expect(home).toContain("The Governance Layer")
    expect(home).toContain("height < 28")
    expect(home).toContain('maxWidth={compact() ? "100%" : 250}')
    expect(home).toContain("summarizeGovernance")
    expect(home).toContain("PromptLabel")
    expect(home).not.toContain("maxWidth={118}")
    expect(home).not.toContain("width={38}")
    expect(home.indexOf("GovernanceDeck")).toBeLessThan(home.indexOf("<Prompt"))
    expect(home.indexOf("GOVERNANCE_APERTURE")).toBeLessThan(home.indexOf("GOVERNANCE_LANES"))
    expect(home.indexOf("directive dock")).toBeLessThan(home.indexOf("<Prompt"))
    expect(home).not.toContain("swarm ready")
    expect(home).not.toContain("tracked")
    expect(home).not.toContain("import { Logo }")
    expect(home).not.toContain("<Logo")
    expect(home).not.toContain("UI.logo")
    expect(home).not.toContain("chat")
    expect(sidebar).toContain("Runtime signals")
    expect(sidebar).toContain("approval")
    expect(sidebar).not.toContain("Swarm lane")
    expect(prompt).toContain("GOVERNANCE DIRECTIVE")
    expect(prompt).toContain("SHELL POLICY GATE")
    expect(prompt).toContain("Directive target")
    expect(prompt).toContain("Command awaits policy gate")
    expect(prompt).toContain("swarm</span>")
    expect(prompt).toContain("docket</span>")
    expect(prompt).not.toContain('horizontal: "▀"')
    expect(prompt).not.toContain("backgroundColor={highlight()}")
    expect(prompt).not.toContain("agents</span>")
    expect(prompt).not.toContain("commands</span>")
    expect(prompt).not.toContain("Ask gal.run anything")
    expect(prompt).not.toContain("Run a command")
    expect(prompt).not.toContain("local.agent.color(local.agent.current().name)")
    expect(sessionFooter).toContain("GAL Code runtime")
    expect(sessionFooter).toContain("ledger {permissions().length}")
    expect(sessionFooter).toContain("lattice {lsp().length}")
    expect(sessionFooter).toContain("swarm {mcpConnected()}/{mcpItems().length}")
    expect(sessionSidebar).toContain("<b>GAL</b>")
    expect(sessionSidebar).not.toContain("<b>Open</b>")
    rejectLegacy(copy)
    rejectLegacy(home)
    rejectLegacy(sidebar)
    rejectLegacy(prompt)
    rejectLegacy(sessionFooter)
    rejectLegacy(sessionSidebar)
    expect(basename("/one/two/three")).toBe("three")
  })
})
