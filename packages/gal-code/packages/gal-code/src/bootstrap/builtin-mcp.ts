import path from "path"
import { homedir } from "os"
import { existsSync } from "fs"

type McpEntry = {
  type: "local"
  command: string[]
  enabled: boolean
  builtin: boolean
  timeout?: number
}

type McpConfig = {
  mcp: Record<string, McpEntry>
}

const BUILTIN_GAL_MCP_TIMEOUT = 120_000

export function resolveGalCli(env: NodeJS.ProcessEnv = process.env): string[] | undefined {
  if (env.GAL_CODE_MODE !== "dev") return
  const home = env.GAL_CLI_HOME
  if (home) {
    const cjs = path.join(home, "dist", "index.cjs")
    if (existsSync(cjs)) return [process.execPath, cjs]
  }
  const root = env.GAL_CODE_WORKSPACE_ROOT || env.GAL_DEV_WORKSPACE_ROOT
  if (root) {
    let cjs = path.join(root, "dist", "index.cjs")
    if (existsSync(cjs)) return [process.execPath, cjs]
    cjs = path.join(root, "gal-cli", "dist", "index.cjs")
    if (existsSync(cjs)) return [process.execPath, cjs]
  }
}

function resolveStandaloneMcp(localPath: string, pkg: string, altPath?: string): [string, ...string[]] {
  if (existsSync(localPath)) return ["node", localPath]
  if (altPath && existsSync(altPath)) return ["node", altPath]
  return ["npx", pkg]
}

export function buildBuiltinMcp(env: NodeJS.ProcessEnv = process.env, cwd = process.cwd()): McpConfig {
  const hasVision = env.GEMINI_API_KEY || env.GOOGLE_CLOUD_PROJECT || env.GCP_PROJECT
  const hasVoice = env.OPENAI_API_KEY
  const stratus =
    env.STRATUS_MCP_PATH || path.join(homedir(), "stratus/stratus-shell/mcp/dist/index.js")
  const gal = resolveGalCli(env)
  const cmd = gal ?? ["gal"]
  const root =
    env.GAL_CODE_WORKSPACE_ROOT ||
    env.GAL_DEV_WORKSPACE_ROOT ||
    path.join(homedir(), "gal-run")
  // Normalize: if root is a sub-repo (e.g. gal-cli), go up to monorepo root
  const monoRoot = existsSync(path.join(root, "packages", "gal-code")) ? root : path.resolve(root, "..")
  const terminalUseMcp = resolveStandaloneMcp(
    path.join(root, "gal-terminal-use-mcp", "dist", "index.js"),
    "@scheduler-systems/gal-terminal-use-mcp",
    path.join(monoRoot, "gal-terminal-use-mcp", "dist", "index.js"),
  )
  const browserUseMcp = resolveStandaloneMcp(
    path.join(root, "gal-browser-use-mcp", "dist", "index.js"),
    "@scheduler-systems/gal-browser-use-mcp",
    path.join(monoRoot, "gal-browser-use-mcp", "dist", "index.js"),
  )
  const ideUseMcp = resolveStandaloneMcp(
    path.join(root, "gal-ide-use-mcp", "dist", "index.js"),
    "@scheduler-systems/gal-ide-use-mcp",
    path.join(monoRoot, "gal-ide-use-mcp", "dist", "index.js"),
  )
  const visionMcp = resolveStandaloneMcp(
    path.join(root, "gal-vision-mcp", "dist", "index.js"),
    "@scheduler-systems/vision-mcp",
    path.join(monoRoot, "gal-vision-mcp", "dist", "index.js"),
  )
  const voiceMcp = resolveStandaloneMcp(
    path.join(root, "gal-voice-mcp", "dist", "index.js"),
    "@scheduler-systems/gal-voice-mcp",
    path.join(monoRoot, "gal-voice-mcp", "dist", "index.js"),
  )
  const computerUseMcp = resolveStandaloneMcp(
    path.join(root, "gal-computer-use-mcp", "dist", "index.js"),
    "@scheduler-systems/gal-computer-use-mcp",
    path.join(monoRoot, "gal-computer-use-mcp", "dist", "index.js"),
  )
  const out: McpConfig = {
    mcp: {
      gal: {
        type: "local",
        command: [...cmd, "mcp", "server"],
        enabled: true,
        builtin: true,
        timeout: BUILTIN_GAL_MCP_TIMEOUT,
      },
      "gal-terminal-use": {
        type: "local",
        command: terminalUseMcp,
        enabled: true,
        builtin: true,
      },
      "gal-ide-use": {
        type: "local",
        command: ideUseMcp,
        enabled: true,
        builtin: true,
      },
      "gal-browser-use": {
        type: "local",
        command: browserUseMcp,
        enabled: true,
        builtin: true,
      },
      "gal-computer-use": {
        type: "local",
        command: computerUseMcp,
        enabled: true,
        builtin: true,
      },
    },
  }
  if (hasVision) {
    out.mcp["gal-vision"] = {
      type: "local",
      command: visionMcp,
      enabled: true,
      builtin: true,
    }
  }
  if (hasVoice) {
    out.mcp["gal-voice"] = {
      type: "local",
      command: voiceMcp,
      enabled: true,
      builtin: true,
    }
  }
  if (stratus && existsSync(stratus)) {
    out.mcp["stratus"] = {
      type: "local",
      command: ["node", stratus],
      enabled: true,
      builtin: true,
    }
  }
  return out
}
