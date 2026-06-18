import type { Hooks, PluginInput } from "@scheduler-systems/gal-code-plugin"
import { execFileSync, spawnSync } from "node:child_process"
import { Log } from "@/util/log"

const log = Log.create({ service: "plugin.product-issue-gate" })

const GATED_TOOLS = new Set(["bash", "write", "edit", "patch", "apply_patch", "task", "terminal_exec"])

export async function ProductIssueGatePlugin(input: PluginInput): Promise<Hooks> {
  let issueContextKnown: boolean | undefined

  function hasIssueContext() {
    if (process.env.GAL_PRODUCT_ISSUE_URL || process.env.GITHUB_ISSUE_URL || process.env.GH_ISSUE_URL) return true
    if (process.env.GAL_PRODUCT_ISSUE_GATE_ALWAYS === "1") return true
    if (issueContextKnown !== undefined) return issueContextKnown

    issueContextKnown = false
    try {
      const branch = execFileSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
        cwd: input.directory,
        encoding: "utf-8",
        stdio: ["ignore", "pipe", "ignore"],
        timeout: 1500,
      }).trim()
      issueContextKnown = /(?:^|[/-])(?:issue|gh)?[-_]?\d{1,7}(?:\D|$)/i.test(branch)
    } catch {
      issueContextKnown = false
    }

    return issueContextKnown
  }

  function runGate(payload: unknown) {
    if (process.env.GAL_PRODUCT_ISSUE_GATE_MODE === "off") return
    if (!hasIssueContext()) return

    const result = spawnSync("gal", ["enforce", "product-issue", "hook", "--json"], {
      cwd: input.directory,
      input: JSON.stringify(payload),
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
      timeout: 15_000,
      env: {
        ...process.env,
        GAL_MACHINE: "1",
        GAL_HOOK_EVENT: "1",
        GAL_NO_AUTO_UPDATE: "1",
      },
    })

    if (result.error) {
      log.warn("product issue gate unavailable", { error: result.error.message })
      return
    }

    let decision: { decision?: string; reason?: string }
    try {
      decision = JSON.parse(result.stdout || "{}")
    } catch {
      log.warn("product issue gate returned invalid output", { output: result.stdout })
      return
    }

    if (decision.decision === "block") {
      throw new Error(decision.reason || "Blocked by GAL product issue gate")
    }
  }

  return {
    "command.execute.before": async (command) => {
      const commandLine = [command.command, command.arguments].filter(Boolean).join(" ").trim()
      runGate({
        tool_name: "command",
        command: commandLine,
        tool_input: {
          command: commandLine,
          arguments: command.arguments,
        },
      })
    },
    "tool.execute.before": async (tool, output) => {
      if (!GATED_TOOLS.has(tool.tool)) return
      runGate({
        tool_name: tool.tool,
        tool_input: output.args,
      })
    },
  }
}
