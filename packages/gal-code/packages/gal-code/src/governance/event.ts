import z from "zod"
import { BusEvent } from "@/bus/bus-event"

export const GovernanceEvent = {
  RuntimeUpdated: BusEvent.define(
    "governance.runtime.updated",
    z.object({
      sessionID: z.string(),
      entryType: z.enum(["decision", "result"]),
      tool: z.string(),
      timestamp_ms: z.number(),
      blocked: z.boolean().optional(),
      decision: z.enum(["clear_for_operator_review", "hold_for_operator_review"]).optional(),
      confidence: z.number().optional(),
    }),
  ),
}
