import z from "zod"
import { Tool } from "./tool"
import { Claw } from "../claw"
import { Effect } from "effect"
import DESCRIPTION from "./claw-status.txt"

export const ClawStatusTool = Tool.define(
  "claw_status",
  Effect.gen(function* () {
    return () =>
      Effect.sync(() => ({
        description: DESCRIPTION,
        parameters: z.object({
          command: z.enum(["doctor", "status", "version", "diff"]).describe("Which claw introspection command to run."),
        }),
        execute: (params: { command: string }) =>
          Effect.promise(async () => {
            const info: Record<string, string> = {}
            if (params.command === "doctor") {
              const result = await Claw.doctor()
              info.status = result.status
              info.has_failures = String(result.has_failures)
              return {
                title: "Claw doctor",
                output: JSON.stringify(result, null, 2),
                metadata: info,
              }
            }
            if (params.command === "status") {
              const result = await Claw.status()
              info.status = result.status
              info.branch = result.workspace?.git_branch ?? ""
              return {
                title: "Claw status",
                output: JSON.stringify(result, null, 2),
                metadata: info,
              }
            }
            if (params.command === "version") {
              const version = await Claw.version()
              info.version = version
              return {
                title: "Claw version",
                output: version,
                metadata: info,
              }
            }
            if (params.command === "diff") {
              const diff = await Claw.diff()
              info.lines = String(diff.split("\n").length)
              return {
                title: "Claw diff",
                output: diff,
                metadata: info,
              }
            }
            return { title: "Unknown", output: "", metadata: { status: "unknown" } }
          }),
      }))
  }),
)
