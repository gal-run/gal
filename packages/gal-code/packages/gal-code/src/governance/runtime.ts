import path from "path"
import { Global } from "@/global"
import { Filesystem } from "@/util/filesystem"

export type RuntimeRow = {
  entry_type: string
  tool?: string
  mode?: string
  blocked?: boolean
  decision?: string
  confidence?: number
  timestamp_ms?: number
}

export type RuntimeSummary = {
  decisions: number
  blocked: number
  holds: number
  clears: number
  latest?: {
    tool: string
    mode: string
    blocked: boolean
    decision: string
    confidence: number
    timestamp_ms: number
  }
}

function obj(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input)
}

function row(input: unknown): input is RuntimeRow {
  return obj(input) && typeof input.entry_type === "string"
}

function read(input: string) {
  try {
    return JSON.parse(input)
  } catch {
    return
  }
}

function latest(list: RuntimeRow[]) {
  const item = list.at(-1)
  if (!item || typeof item.tool !== "string" || typeof item.mode !== "string" || typeof item.decision !== "string") return
  return {
    tool: item.tool,
    mode: item.mode,
    blocked: item.blocked === true,
    decision: item.decision,
    confidence: typeof item.confidence === "number" ? item.confidence : 0,
    timestamp_ms: typeof item.timestamp_ms === "number" ? item.timestamp_ms : 0,
  }
}

export function summarizeRuntime(input: readonly unknown[]): RuntimeSummary {
  const list = input.filter(row).filter((item) => item.entry_type === "decision")
  return {
    decisions: list.length,
    blocked: list.filter((item) => item.blocked === true).length,
    holds: list.filter((item) => item.decision === "hold_for_operator_review").length,
    clears: list.filter((item) => item.decision === "clear_for_operator_review").length,
    latest: latest(list),
  }
}

export function runtimeDir(project: string) {
  return process.env.GAL_LEDGER_DIR ?? path.join(Global.Path.state, "governance", project)
}

export function runtimePath(project: string, session: string) {
  return path.join(runtimeDir(project), `${session}.jsonl`)
}

export async function readRuntime(project: string, session: string): Promise<RuntimeSummary> {
  const text = await Filesystem.readText(runtimePath(project, session)).catch(() => "")
  const list = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .flatMap((line) => {
      const item = read(line)
      return item === undefined ? [] : [item]
    })
  return summarizeRuntime(list)
}
