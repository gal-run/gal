import { promisify } from "util"
import { execFile } from "child_process"
import path from "path"
import { Log } from "../util/log"

const execFileAsync = promisify(execFile)

export namespace Claw {
  const log = Log.create({ service: "claw" })

  function binary() {
    const env = process.env.GAL_CLAW_PATH
    if (env) return env.startsWith("~") ? path.join(process.env.HOME!, env.slice(1)) : env
    return "gal-claw"
  }

  function inheritEnv(): NodeJS.ProcessEnv {
    const env = { ...process.env }
    if (env.ANTHROPIC_API_KEY && !env.OPENAI_API_KEY) {
      env.OPENAI_BASE_URL = env.ANTHROPIC_BASE_URL || "https://openrouter.ai/api/v1"
      env.OPENAI_API_KEY = env.ANTHROPIC_AUTH_TOKEN || env.ANTHROPIC_API_KEY
    }
    if (!env.OPENAI_BASE_URL && env.OPENROUTER_API_KEY) {
      env.OPENAI_BASE_URL = "https://openrouter.ai/api/v1"
      env.OPENAI_API_KEY = env.OPENROUTER_API_KEY
    }
    if (!env.OPENAI_BASE_URL && env.GAL_AUTH_TOKEN) {
      env.OPENAI_BASE_URL = "https://api.gal.run/api/gal-code/v1"
      env.OPENAI_API_KEY = env.GAL_AUTH_TOKEN
    }
    return env
  }

  export async function available(): Promise<boolean> {
    try {
      await execFileAsync(binary(), ["--version"], { timeout: 5000 })
      return true
    } catch {
      return false
    }
  }

  export async function version(): Promise<string> {
    const { stdout } = await execFileAsync(binary(), ["--version"], { timeout: 5000 })
    return stdout.trim()
  }

  export async function doctor(): Promise<ClawDoctor> {
    const { stdout } = await execFileAsync(binary(), ["doctor", "--output-format", "json"], {
      timeout: 15000,
      env: inheritEnv(),
    })
    return JSON.parse(stdout) as ClawDoctor
  }

  export async function status(): Promise<ClawStatus> {
    const { stdout } = await execFileAsync(binary(), ["status", "--output-format", "json"], {
      timeout: 15000,
      env: inheritEnv(),
    })
    return JSON.parse(stdout) as ClawStatus
  }

  export async function diff(): Promise<string> {
    const { stdout } = await execFileAsync(binary(), ["diff"], { timeout: 15000, env: inheritEnv() })
    return stdout.trim()
  }

  export async function systemPrompt(): Promise<string> {
    const { stdout } = await execFileAsync(binary(), ["system-prompt"], {
      timeout: 10000,
      env: inheritEnv(),
    })
    return stdout.trim()
  }

  export async function prompt(
    text: string,
    opts?: {
      model?: string
      compact?: boolean
      allowedTools?: string[]
      permissionMode?: "read-only" | "workspace-write" | "danger-full-access"
    },
  ): Promise<ClawPromptResult> {
    const args = ["prompt", text, "--output-format", "json"]
    const model = opts?.model ?? "deepseek/deepseek-v4-pro"
    args.push("--model", model)
    if (opts?.compact ?? true) args.push("--compact")
    if (opts?.allowedTools?.length) {
      for (const t of opts.allowedTools) args.push("--allowedTools", t)
    }
    if (opts?.permissionMode) args.push("--permission-mode", opts.permissionMode)

    const { stdout, stderr } = await execFileAsync(binary(), args, {
      timeout: 120_000,
      env: inheritEnv(),
    })

    const raw = stdout.trim()
    try {
      const parsed = JSON.parse(raw)
      if (parsed.status === "error" || parsed.exit_code === 1) {
        return { ok: false, error: parsed.message || parsed.error || "unknown error", raw: parsed }
      }
      return {
        ok: true,
        text: parsed.message || parsed.report || "",
        raw: parsed,
      }
    } catch {
      return { ok: true, text: raw, raw: { text: raw } }
    }
  }

  export async function run(
    args: string[],
    opts?: { cwd?: string; timeout?: number; env?: NodeJS.ProcessEnv },
  ): Promise<{ code: number; stdout: string; stderr: string }> {
    const env = { ...inheritEnv(), ...opts?.env }
    const { stdout, stderr } = await execFileAsync(binary(), args, {
      cwd: opts?.cwd,
      timeout: opts?.timeout ?? 30_000,
      env,
    })
    return { code: 0, stdout, stderr }
  }

  export type ClawDoctor = {
    status: string
    has_failures: boolean
    summary: { total: number; ok: number; warnings: number; failures: number }
    checks: Array<{
      id: string
      name: string
      status: string
      summary: string
      details?: Array<{ key: string; value: unknown }>
      hint?: string
    }>
  }

  export type ClawStatus = {
    status: string
    workspace?: {
      cwd: string
      project_root?: string
      git_branch?: string
      changed_files: number
    }
    model?: string
    permission_mode?: string
  }

  export type ClawPromptResult = { ok: true; text: string; raw: unknown } | { ok: false; error: string; raw: unknown }
}
