export type GovernanceMcpStatus = "connected" | "disabled" | "failed" | "needs_auth" | "needs_client_registration"

export type GovernanceMcp = {
  status: GovernanceMcpStatus | string
}

export type GovernanceSummaryInput = {
  config?: unknown
  branch?: string
  directory?: string
  worktree?: string
  permissions?: readonly unknown[]
  questions?: readonly unknown[]
  diffs?: readonly unknown[]
  lsp?: readonly unknown[]
  mcp?: unknown
  runtime?: {
    decisions?: number
    blocked?: number
    holds?: number
    clears?: number
    latest?: {
      tool?: string
      mode?: string
      blocked?: boolean
      decision?: string
      confidence?: number
    }
  }
}

export type GovernanceSummary = {
  scope: string
  policy: "custom baseline" | "default baseline"
  status: "approval pending" | "runtime attention" | "changes need review" | "clear"
  approvals: number
  changedFiles: number
  lsp: number
  mcpConnected: number
  mcpAttention: number
  runtimeDecisions: number
  runtimeBlocked: number
  runtimeHolds: number
  runtimeClears: number
  runtimeDecision: string
  runtimeTool: string
  runtimeMode: string
  runtimeConfidence: number
  risk: "high" | "medium" | "low"
  nextAction: string
}

function obj(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input)
}

function values(input: unknown) {
  if (!obj(input)) return []
  return Object.values(input)
}

function has(input: unknown): boolean {
  if (input === undefined || input === null) return false
  if (typeof input === "string") return input.length > 0
  if (Array.isArray(input)) return input.length > 0
  if (!obj(input)) return true
  return Object.entries(input).some(([key, value]) => key !== "__originalKeys" && has(value))
}

export function basename(input: string | undefined) {
  if (!input) return ""
  const list = input.split("/").filter(Boolean)
  return list.at(-1) ?? input
}

export function hasGovernancePolicy(config: unknown) {
  if (!obj(config)) return false
  const agent = values(config.agent).some((item) => obj(item) && (has(item.permission) || has(item.tools)))
  const mode = values(config.mode).some((item) => obj(item) && (has(item.permission) || has(item.tools)))
  return has(config.permission) || has(config.tools) || agent || mode
}

function list(input: unknown): readonly unknown[] {
  if (Array.isArray(input)) return input
  if (!obj(input)) return []
  return Object.values(input)
}

function mcpList(input: unknown): readonly GovernanceMcp[] {
  return list(input).filter((item): item is GovernanceMcp => obj(item) && typeof item.status === "string")
}

function latest(input: GovernanceSummaryInput["runtime"]) {
  if (!obj(input) || !obj(input.latest)) return
  const tool = typeof input.latest.tool === "string" ? input.latest.tool : ""
  const mode = typeof input.latest.mode === "string" ? input.latest.mode : ""
  const decision = typeof input.latest.decision === "string" ? input.latest.decision : ""
  const confidence = typeof input.latest.confidence === "number" ? input.latest.confidence : 0
  return {
    tool,
    mode,
    blocked: input.latest.blocked === true,
    decision,
    confidence,
  }
}

function runtime(input: GovernanceSummaryInput["runtime"]) {
  const item = obj(input) ? input : {}
  const last = latest(input)
  return {
    decisions: typeof item.decisions === "number" ? item.decisions : 0,
    blocked: typeof item.blocked === "number" ? item.blocked : 0,
    holds: typeof item.holds === "number" ? item.holds : 0,
    clears: typeof item.clears === "number" ? item.clears : 0,
    latest: last,
  }
}

export function summarizeGovernance(input: GovernanceSummaryInput): GovernanceSummary {
  const permissions = list(input.permissions)
  const questions = list(input.questions)
  const diffs = list(input.diffs)
  const lsp = list(input.lsp)
  const mcp = mcpList(input.mcp)
  const sidecar = runtime(input.runtime)
  const approvals = permissions.length + questions.length
  const mcpConnected = mcp.filter((item) => item.status === "connected").length
  const mcpAttention = mcp.filter(
    (item) => item.status === "failed" || item.status === "needs_auth" || item.status === "needs_client_registration",
  ).length
  const changedFiles = diffs.length
  const policy = hasGovernancePolicy(input.config) ? "custom baseline" : "default baseline"
  const scope = input.branch ?? (basename(input.directory) || basename(input.worktree))
  const base = {
    scope,
    policy,
    approvals,
    changedFiles,
    lsp: lsp.length,
    mcpConnected,
    mcpAttention,
    runtimeDecisions: sidecar.decisions,
    runtimeBlocked: sidecar.blocked,
    runtimeHolds: sidecar.holds,
    runtimeClears: sidecar.clears,
    runtimeDecision: sidecar.latest?.decision ?? "",
    runtimeTool: sidecar.latest?.tool ?? "",
    runtimeMode: sidecar.latest?.mode ?? "",
    runtimeConfidence: sidecar.latest?.confidence ?? 0,
  } as const

  if (approvals > 0) {
    return {
      ...base,
      status: "approval pending",
      risk: "high",
      nextAction: "answer the approval queue before the agent can proceed",
    }
  }

  if (sidecar.blocked > 0 || sidecar.holds > 0) {
    return {
      ...base,
      status: "runtime attention",
      risk: sidecar.blocked > 0 ? "high" : "medium",
      nextAction: "inspect the latest held tool in the governance ledger before proceeding",
    }
  }

  if (mcpAttention > 0) {
    return {
      ...base,
      status: "runtime attention",
      risk: "medium",
      nextAction: "inspect MCP auth and failed tool surfaces with /status",
    }
  }

  if (changedFiles > 0) {
    return {
      ...base,
      status: "changes need review",
      risk: "medium",
      nextAction: "run /review and attach test evidence before closeout",
    }
  }

  return {
    ...base,
    status: "clear",
    risk: "low",
    nextAction: "start with policy scope, then gather evidence",
  }
}
