export type Gov = {
  mode: "shadow" | "warn" | "block"
  cut: number
}

type GovArgs = {
  attach?: string
  model?: string
  governance?: boolean
  "governance-mode"?: string
  "governance-min-confidence"?: number
}

export function pickModel(args: {
  model?: string
  governance?: boolean
}, fallback?: string) {
  if (args.model) return args.model
  if (args.governance === false) return
  if (args.governance !== true && process.env.GAL_ENABLED !== "1") return
  return fallback
}

function forced(args: GovArgs) {
  if (args.governance === true) return true
  return process.env.GAL_ENABLED === "1"
}

function disabled(args: GovArgs) {
  if (args.governance === false) return true
  return process.env.GAL_ENABLED === "0"
}

export function gov(args: GovArgs) {
  if (disabled(args)) return
  const cut = args["governance-min-confidence"]
  return {
    mode: args["governance-mode"] === "shadow" ? "shadow" : args["governance-mode"] === "warn" ? "warn" : "block",
    cut: typeof cut === "number" && Number.isFinite(cut) ? cut : 0.9,
  } satisfies Gov
}

function clear() {
  delete process.env.GAL_GOVERNANCE_SIDECAR_ROOT
  delete process.env.GAL_GOVERNANCE_SIDECAR_PYTHON
  delete process.env.GAL_MODEL
  delete process.env.GAL_GOVERNANCE_SIDECAR_ARTIFACT
}

export async function applyGov(args: GovArgs) {
  const cfg = gov(args)
  if (!cfg) {
    process.env.GAL_ENABLED = "0"
    clear()
    return false
  }

  if (args.attach) {
    if (forced(args)) throw new Error("--governance is only supported for local runs")
    process.env.GAL_ENABLED = "0"
    clear()
    return false
  }

  process.env.GAL_ENABLED = "1"
  process.env.GAL_MODE = cfg.mode
  process.env.GAL_GOVERNANCE_SIDECAR_MIN_CONFIDENCE = String(cfg.cut)
  clear()
  return true
}
