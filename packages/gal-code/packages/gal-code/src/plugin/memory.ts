import type { Hooks, PluginInput } from "@scheduler-systems/gal-code-plugin"
import { Log } from "@/util/log"

const log = Log.create({ service: "plugin.memory" })

const SIGNIFICANT_TOOLS = ["bash", "read", "write", "edit", "grep", "glob"]
const API = process.env.GAL_API_URL || "https://api.gal.run"

interface MemoryItem {
  content: string
  tags: string[]
}

let pending: MemoryItem[] = []
let sessionLearned = new Set<string>()

async function flush(sessionID: string) {
  if (pending.length === 0) return
  const items = pending.splice(0)

  let written = 0
  for (const item of items) {
    try {
      const res = await fetch(`${API}/api/memory`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: item.content,
          tags: item.tags,
          source: "agent",
          sessionID,
        }),
        signal: AbortSignal.timeout(5000),
      })
      if (res.status === 200 || res.status === 201) written++
    } catch {
      // best-effort
    }
  }
  log.info("flushed memory", { sessionID, total: items.length, written })
}

function shouldCapture(tool: string, output: unknown): output is string {
  if (!SIGNIFICANT_TOOLS.includes(tool)) return false
  if (typeof output !== "string") return false
  if (output.length < 100) return false
  if (output.length > 50000) return false
  return true
}

function extractTags(args: unknown): string[] {
  const tags: string[] = []
  const str = JSON.stringify(args)
  if (str.includes("test")) tags.push("testing")
  if (str.includes("config")) tags.push("configuration")
  if (str.includes("build")) tags.push("build")
  if (str.includes("deploy")) tags.push("deployment")
  if (str.includes("fix") || str.includes("bug")) tags.push("bug-fix")
  if (str.includes("refactor")) tags.push("refactoring")
  if (str.includes("doc")) tags.push("documentation")
  if (str.includes("api")) tags.push("api")
  if (str.includes("schema") || str.includes("migration")) tags.push("schema")
  return tags
}

function dedupe(item: MemoryItem): boolean {
  const key = item.content.slice(0, 200)
  if (sessionLearned.has(key)) return false
  sessionLearned.add(key)
  return true
}

export async function MemoryPlugin(input: PluginInput): Promise<Hooks> {
  sessionLearned = new Set<string>()
  pending = []

  return {
    "tool.execute.after": async (ctx, output) => {
      if (!output) return
      const text = output?.output
      if (!shouldCapture(ctx.tool, text)) return
      const item: MemoryItem = {
        content: `Tool ${ctx.tool} produced significant output:\n${text.slice(0, 2000)}`,
        tags: extractTags(ctx.args),
      }
      if (dedupe(item)) {
        pending.push(item)
      }
    },
    "session.end": async (ctx) => {
      await flush(ctx.sessionID)
    },
  }
}
