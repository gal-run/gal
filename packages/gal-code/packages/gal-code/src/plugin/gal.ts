import type { Hooks, PluginInput } from "@scheduler-systems/gal-code-plugin"
import path from "node:path"
import { appendFile, mkdir } from "node:fs/promises"
import { createHash } from "node:crypto"
import { Log } from "@/util/log"
import { Bus } from "@/bus"
import { GovernanceEvent } from "@/governance/event"
import { runtimeDir } from "@/governance/runtime"
import { GalModel } from "./gal-model.gen"
import { infer, type GalRequest } from "./gal-runtime"

const log = Log.create({ service: "plugin.gal" })

const LEDGER_REF = "gal-code://gal/v1"
const TOOLS = new Set([
  "bash",
  "write",
  "edit",
  "apply_patch",
  "multiedit",
  "webfetch",
  "external_directory",
  "task",
  "terminal_exec",
])
const DESTRUCTIVE = ["rm -rf", "git reset --hard", "git checkout --", "kubectl delete", "terraform destroy"]
const NETWORK = ["curl ", "wget ", "ssh ", "scp ", "rsync ", "nmap ", "nc ", "http://", "https://"]
const STATE = [
  "git push",
  "gh issue create",
  "gh issue close",
  "gh issue comment",
  "gh pr create",
  "gh pr merge",
  "gh release create",
  "npm publish",
  "pnpm publish",
  "runpodctl pod create",
  "kubectl apply",
  "kubectl patch",
  "terraform apply",
]

type Cfg = {
  mode: "shadow" | "warn" | "block"
  cut: number
  log: string
}

type Sum = {
  destructive: boolean
  network: boolean
  state: boolean
}

function has(txt: string, list: readonly string[]) {
  const low = txt.toLowerCase()
  return list.some((item) => low.includes(item))
}

function json(value: unknown) {
  return JSON.stringify(value, undefined, 2)
}

function cfg(project: string): Cfg | undefined {
  if (process.env.GAL_ENABLED !== "1") return
  const raw = process.env.GAL_MODE
  const mode = raw === "block" ? "block" : raw === "shadow" ? "shadow" : "warn"
  const cut = Number(process.env.GAL_MIN_CONFIDENCE ?? "0.9")
  return {
    mode,
    cut: Number.isFinite(cut) ? cut : 0.9,
    log: runtimeDir(project),
  }
}

function subject(tool: string, args: unknown) {
  if (tool === "bash" && args && typeof args === "object" && "command" in args && typeof args.command === "string") {
    return args.command
  }
  if (tool === "task" && args && typeof args === "object" && "prompt" in args && typeof args.prompt === "string") {
    return args.prompt
  }
  if (typeof args === "string") return args
  return json(args)
}

function refs() {
  return Boolean(process.env.GAL_PRODUCT_ISSUE_URL || process.env.GITHUB_ISSUE_URL || process.env.GH_ISSUE_URL)
}

function sum(tool: string, txt: string): Sum {
  return {
    destructive: tool === "external_directory" || has(txt, DESTRUCTIVE),
    network: tool === "webfetch" || has(txt, NETWORK),
    state: has(txt, STATE),
  }
}

export function buildFeatures(tool: string, txt: string) {
  const risk = sum(tool, txt)
  const review = risk.destructive || risk.network || risk.state
  const count = [risk.destructive, risk.network, risk.state].filter(Boolean).length
  return {
    people_present: tool === "task",
    vehicles_present: txt.includes("|") || txt.includes("&&") || txt.includes(";"),
    obstacles_present: tool === "external_directory" || txt.includes(">") || txt.includes(">>"),
    evidence_complete: Boolean(tool && txt),
    operator_review_required: review,
    latency_measured: Boolean(tool && txt && !txt.includes("\n")),
    approval_refs_complete: refs(),
    detection_count: count,
  }
}

export function buildRequest(input: {
  tool: string
  sessionID: string
  callID: string
  args: unknown
}): GalRequest {
  const txt = subject(input.tool, input.args)
  return {
    request_id: `${input.sessionID}:${input.callID}:${input.tool}`,
    application: "gal-code",
    model_ref: GalModel.model_ref,
    evidence_ref: `gal://sessions/${input.sessionID}/tool/${input.callID}`,
    features: buildFeatures(input.tool, txt),
  }
}

function hash(txt: string) {
  return createHash("sha256").update(txt).digest("hex")
}

async function write(cfg: Cfg, sessionID: string, row: Record<string, unknown>) {
  const file = path.join(cfg.log, `${sessionID}.jsonl`)
  try {
    await mkdir(cfg.log, { recursive: true })
    await appendFile(file, JSON.stringify(row) + "\n")
    return true
  } catch (err) {
    log.warn("ledger append failed", { file, error: err instanceof Error ? err.message : String(err) })
    return false
  }
}

async function publishRuntimeUpdate(payload: {
  sessionID: string
  entryType: "decision" | "result"
  tool: string
  timestamp_ms: number
  blocked?: boolean
  decision?: "clear_for_operator_review" | "hold_for_operator_review"
  confidence?: number
}) {
  try {
    await Bus.publish(GovernanceEvent.RuntimeUpdated, payload)
  } catch (err) {
    log.debug("runtime update publish skipped", { error: err instanceof Error ? err.message : String(err) })
  }
}

async function result(
  input: { tool: string; sessionID: string; callID: string; args: unknown },
  output: { title: string; output: string; metadata: unknown } | undefined,
  cfg: Cfg,
) {
  if (!output) return
  const timestamp_ms = Date.now()
  const ok = await write(cfg, input.sessionID, {
    schema_ref: LEDGER_REF,
    entry_type: "result",
    timestamp_ms,
    session_id: input.sessionID,
    call_id: input.callID,
    tool: input.tool,
    title: output.title,
    output_sha256: hash(output.output ?? ""),
    output_bytes: Buffer.byteLength(output.output ?? "", "utf8"),
    metadata_keys:
      output.metadata && typeof output.metadata === "object" && !Array.isArray(output.metadata)
        ? Object.keys(output.metadata).sort()
        : [],
  })
  if (!ok) return
  await publishRuntimeUpdate({
    sessionID: input.sessionID,
    entryType: "result",
    tool: input.tool,
    timestamp_ms,
  })
}

async function decide(input: { tool: string; sessionID: string; callID: string; args: unknown }, cfg: Cfg) {
  const txt = subject(input.tool, input.args)
  const req = buildRequest(input)
  const res = infer(req)
  const confidence = res.confidence
  const blocked = res.decision === "hold_for_operator_review" && confidence >= cfg.cut && cfg.mode === "block"
  const risk = sum(input.tool, txt)
  const timestamp_ms = Date.now()
  const ok = await write(cfg, input.sessionID, {
    schema_ref: LEDGER_REF,
    entry_type: "decision",
    timestamp_ms,
    session_id: input.sessionID,
    call_id: input.callID,
    request_id: req.request_id,
    tool: input.tool,
    mode: cfg.mode,
    blocked,
    decision: res.decision,
    confidence,
    escalate_for_deeper_review: res.escalate_for_deeper_review,
    evidence_ref: req.evidence_ref,
    model_ref: req.model_ref,
    subject_sha256: hash(txt),
    subject_bytes: Buffer.byteLength(txt, "utf8"),
    features: req.features,
    risk,
  })
  if (ok) {
    await publishRuntimeUpdate({
      sessionID: input.sessionID,
      entryType: "decision",
      tool: input.tool,
      timestamp_ms,
      blocked,
      decision: res.decision as "clear_for_operator_review" | "hold_for_operator_review",
      confidence,
    })
  }
  if (res.decision !== "hold_for_operator_review" || confidence < cfg.cut) return
  const msg = `GAL hold: tool=${input.tool} decision=${res.decision} confidence=${confidence.toFixed(6)}`
  if (cfg.mode === "shadow") {
    log.info("sidecar hold", { tool: input.tool, decision: res.decision, confidence, request_id: req.request_id })
    return
  }
  if (cfg.mode === "warn") {
    log.info("sidecar hold", { tool: input.tool, decision: res.decision, confidence, request_id: req.request_id })
    process.stderr.write(`\n[GAL governance] ${msg}\n`)
    return
  }
  throw new Error(`Blocked by ${msg}`)
}

export async function GalPlugin(input: PluginInput): Promise<Hooks> {
  const conf = cfg(input.project.id)
  if (!conf) return {}

  return {
    "command.execute.before": async (entry) => {
      await decide(
        {
          tool: "bash",
          sessionID: entry.sessionID,
          callID: `command:${entry.command}`,
          args: entry.command + " " + entry.arguments,
        },
        conf,
      )
    },
    "tool.execute.before": async (entry, output) => {
      if (!TOOLS.has(entry.tool)) return
      await decide({ tool: entry.tool, sessionID: entry.sessionID, callID: entry.callID, args: output.args }, conf)
    },
    "tool.execute.after": async (entry, output) => {
      if (!TOOLS.has(entry.tool)) return
      await result(entry, output, conf)
    },
  }
}
