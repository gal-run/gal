import type { Hooks, PluginInput } from "@scheduler-systems/gal-code-plugin"
import { GALT } from "@/galt"
import { Log } from "@/util/log"

const log = Log.create({ service: "plugin.galt" })

const DANGEROUS_TOOLS = ["bash", "write", "edit", "terminal_create_session", "terminal_exec"]

export async function GALTPlugin(input: PluginInput): Promise<Hooks> {
  return {
    "experimental.text.complete": async (ctx, output) => {
      const config = await GALT.getConfig().catch(() => null)
      if (!config?.enabled || !config.output_sanitization) return

      try {
        const result = await GALT.sanitizeOutput({
          request_id: ctx.partID,
          content: output.text,
          classification: config.default_classification,
          metadata: {
            session_id: ctx.sessionID,
            message_id: ctx.messageID,
            part_id: ctx.partID,
          },
        })

        if (!result.allowed) {
          log.warn("output blocked", {
            request_id: ctx.partID,
            violations: result.violations,
          })
          output.text = `[Output blocked by security policy: ${result.violations?.map((v) => v.type).join(", ")}]`
          return
        }

        if (result.redactions > 0) {
          log.info("output sanitized", {
            request_id: ctx.partID,
            redactions: result.redactions,
          })
        }

        output.text = result.sanitized_content ?? output.text
      } catch (e) {
        log.error("output sanitization failed", { error: e })
        if (config.block_on_failure) {
          output.text = "[Output blocked: sanitization error]"
        }
      }
    },

    "tool.execute.before": async (input, output) => {
      const config = await GALT.getConfig().catch(() => null)
      if (!config?.enabled) return

      if (!DANGEROUS_TOOLS.includes(input.tool)) return

      try {
        const argsStr = JSON.stringify(output.args)
        const result = await GALT.sanitizeInput({
          request_id: `${input.callID}-tool-${input.tool}`,
          prompt: argsStr,
          model: "unknown",
          classification: config.default_classification,
          metadata: {
            session_id: input.sessionID,
            tool_name: input.tool,
            call_id: input.callID,
          },
        })

        if (!result.allowed) {
          log.warn("tool call blocked", {
            tool: input.tool,
            call_id: input.callID,
            violations: result.violations,
          })
          throw new Error(`Tool call blocked by security policy: ${result.violations?.map((v) => v.type).join(", ")}`)
        }

        if (result.redactions > 0 && result.sanitized_content) {
          log.info("tool args sanitized", {
            tool: input.tool,
            call_id: input.callID,
            redactions: result.redactions,
          })
          try {
            output.args = JSON.parse(result.sanitized_content)
          } catch {
            // Keep original args if parse fails
          }
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes("blocked by security policy")) {
          throw e
        }
        log.error("tool args sanitization failed", { error: e, tool: input.tool })
      }
    },

    "tool.execute.after": async (input, output) => {
      const config = await GALT.getConfig().catch(() => null)
      if (!config?.enabled || !config.output_sanitization) return

      try {
        const resultStr = output.output
        const result = await GALT.sanitizeOutput({
          request_id: `${input.callID}-tool-result-${input.tool}`,
          content: resultStr,
          classification: config.default_classification,
          metadata: {
            session_id: input.sessionID,
            tool_name: input.tool,
            call_id: input.callID,
          },
        })

        if (!result.allowed) {
          log.warn("tool result blocked", {
            tool: input.tool,
            call_id: input.callID,
            violations: result.violations,
          })
          output.output = `[Tool result blocked by security policy]`
          return
        }

        if (result.redactions > 0) {
          log.info("tool result sanitized", {
            tool: input.tool,
            call_id: input.callID,
            redactions: result.redactions,
          })
          output.output = result.sanitized_content ?? resultStr
        }
      } catch (e) {
        log.error("tool result sanitization failed", { error: e, tool: input.tool })
        if (config.block_on_failure) {
          output.output = "[Tool result blocked: sanitization error]"
        }
      }
    },
  }
}
