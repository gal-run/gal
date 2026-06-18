import { Config } from "./config"

const remotes = new Set(["http", "sse", "streamable", "streamableHttp"])

interface Entry {
  type?: string
  command?: string
  args?: string[]
  url?: string
  transport?: string
  headers?: Record<string, string>
  env?: Record<string, string>
  enabled?: boolean
  timeout?: number
  builtin?: boolean
}

export function convertMcpJson(raw: unknown): Record<string, Config.Mcp> {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {}
  const servers = (raw as Record<string, unknown>).mcpServers
  if (!servers || typeof servers !== "object" || Array.isArray(servers)) return {}

  const out: Record<string, Config.Mcp> = {}
  for (const [name, value] of Object.entries(servers as Record<string, unknown>)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue
    const e = value as Entry

    const args = Array.isArray(e.args) ? e.args.map(String) : []

    const parsed: Config.Mcp =
      (e.type && remotes.has(e.type)) || (!e.command && e.url)
        ? { type: "remote" as const, url: e.url ?? "" }
        : { type: "local" as const, command: [...(e.command ? [e.command] : []), ...args] }

    if (parsed.type === "remote" && e.headers) parsed.headers = e.headers
    if (parsed.type === "local" && e.env) parsed.environment = e.env
    if (e.enabled !== undefined) parsed.enabled = e.enabled
    if (e.timeout !== undefined) parsed.timeout = e.timeout
    if (e.builtin !== undefined) parsed.builtin = e.builtin

    out[name] = parsed
  }
  return out
}
