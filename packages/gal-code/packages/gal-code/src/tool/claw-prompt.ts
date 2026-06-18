import z from "zod"
import { Tool } from "./tool"
import { Claw } from "../claw"
import { Effect } from "effect"
import DESCRIPTION from "./claw-prompt.txt"

export const ClawPromptTool = Tool.define(
  "claw_prompt",
  Effect.gen(function* () {
    return () =>
      Effect.sync(() => ({
        description: DESCRIPTION,
        parameters: z.object({
          prompt: z.string().describe("The prompt to send to claw."),
          model: z.string().describe("Optional model override.").optional(),
          compact: z.boolean().describe("Compact output.").optional(),
        }),
        execute: (params: { prompt: string; model?: string; compact?: boolean }) =>
          Effect.promise(async () => {
            const result = await Claw.prompt(params.prompt, {
              model: params.model,
              compact: params.compact ?? true,
            })
            const meta: Record<string, string> = {}
            if (!result.ok) {
              meta.error = result.error
              return {
                title: "Claw prompt failed",
                output: result.error,
                metadata: meta,
              }
            }
            meta.length = String(result.text.length)
            return {
              title: "Claw response",
              output: result.text,
              metadata: meta,
            }
          }),
      }))
  }),
)
