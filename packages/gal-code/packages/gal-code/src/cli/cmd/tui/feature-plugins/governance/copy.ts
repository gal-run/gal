export type TipPart = {
  text: string
  highlight: boolean
}

export type GovernanceTone = "accent" | "info" | "warning" | "success"

export type GovernanceLane = {
  id: "scope" | "inspect" | "scale" | "review"
  label: string
  title: string
  detail: string
  command: string
  tone: GovernanceTone
  indent: number
}

export type GovernanceMesh = {
  label: string
  detail: string
  tone: GovernanceTone
}

export type GovernanceCommand = {
  label: string
  command: string
  detail: string
}

export const GOVERNANCE_HOME_PLACEHOLDERS: { normal: string[]; shell: string[] } = {
  normal: [
    "Open a policy aperture for this repo",
    "Dispatch a bounded governance swarm",
    "Build an evidence ledger for closeout",
    "Map approval risk before edits",
  ],
  shell: ["git status --short", "gh pr checks --watch", "gh issue view --comments", "gal code run --governance"],
}

export const GOVERNANCE_HOME_TITLE = ["Governance", "cockpit"] as const

export const GOVERNANCE_HOME_SUBTITLE =
  "Policy aperture, worker mesh, and proof ledger stay visible while the agent acts."

export const GOVERNANCE_APERTURE = {
  label: "policy aperture",
  detail: "repo rules, approvals, tool surfaces",
  mesh: "contract -> action -> evidence",
} as const

export const GOVERNANCE_MESH: GovernanceMesh[] = [
  {
    label: "mesh",
    detail: "rules joined to tools and runtime",
    tone: "accent",
  },
  {
    label: "swarm",
    detail: "bounded lanes, independent proof",
    tone: "info",
  },
  {
    label: "ledger",
    detail: "diffs, checks, issue state, release evidence",
    tone: "success",
  },
]

export const GOVERNANCE_LANES: GovernanceLane[] = [
  {
    id: "scope",
    label: "lane 01",
    title: "Scope",
    detail: "load repo contract and ownership boundary",
    command: "@AGENTS.md",
    tone: "accent",
    indent: 0,
  },
  {
    id: "inspect",
    label: "lane 02",
    title: "Inspect",
    detail: "read config, MCP state, model, runtime",
    command: "/status",
    tone: "info",
    indent: 4,
  },
  {
    id: "scale",
    label: "lane 03",
    title: "Swarm",
    detail: "split bounded workers and reconcile",
    command: "@agents",
    tone: "success",
    indent: 9,
  },
  {
    id: "review",
    label: "lane 04",
    title: "Ledger",
    detail: "attach diff, tests, runtime proof",
    command: "/review",
    tone: "warning",
    indent: 3,
  },
]

export const GOVERNANCE_COMMANDS: GovernanceCommand[] = [
  {
    label: "Scope",
    command: "@AGENTS.md",
    detail: "attach project rules before work starts",
  },
  {
    label: "Assess",
    command: "/status",
    detail: "inspect config, MCP, model, and runtime state",
  },
  {
    label: "Scale",
    command: "@agents",
    detail: "fan out bounded workers and reconcile evidence",
  },
  {
    label: "Approve",
    command: "/review",
    detail: "check diffs and gates before merge or closeout",
  },
  {
    label: "Record",
    command: "/export",
    detail: "save a durable audit trail",
  },
]

export const GOVERNANCE_TIPS = [
  "Start with {highlight}AGENTS.md{/highlight}; governance begins with the repo contract",
  "Use {highlight}/status{/highlight} before edits to inspect model, MCP, and config state",
  "Use {highlight}/review{/highlight} before merge, deploy, or issue closeout",
  "Ask for proof: {highlight}checks, diff, issue state, and runtime evidence{/highlight}",
  "Attach policy and release context with {highlight}@file{/highlight} before risky work",
  "Use {highlight}Plan{/highlight} mode when the next action changes ownership, security, or release state",
  "Use governed swarms for scale: one task, bounded ownership, independent evidence, then reconcile",
  "Run shell checks with {highlight}!{/highlight} so command output becomes part of the session record",
  "Keep memory and project rules short enough that the agent can actually follow them",
  "Treat MCP tools as governed capabilities; approve what they can access before they run",
  "Use {highlight}gal code run{/highlight} for repeatable non-interactive governance checks",
  "Use {highlight}/sessions{/highlight} to resume prior audit context instead of restarting from scratch",
  "Use {highlight}/compact{/highlight} to preserve decisions when a long governance session nears context limits",
]

export function parseTip(tip: string): TipPart[] {
  const parts: TipPart[] = []
  const regex = /\{highlight\}(.*?)\{\/highlight\}/g
  const found = Array.from(tip.matchAll(regex))
  const state = found.reduce(
    (acc, match) => {
      const start = match.index ?? 0
      if (start > acc.index) {
        acc.parts.push({ text: tip.slice(acc.index, start), highlight: false })
      }
      acc.parts.push({ text: match[1], highlight: true })
      acc.index = start + match[0].length
      return acc
    },
    { parts, index: 0 },
  )

  if (state.index < tip.length) {
    parts.push({ text: tip.slice(state.index), highlight: false })
  }

  return parts
}
