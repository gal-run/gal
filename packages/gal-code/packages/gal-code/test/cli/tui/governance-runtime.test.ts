import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { runtime, summarizeRuntime } from "../../../src/cli/cmd/tui/feature-plugins/governance/runtime"
import { runtimePath } from "../../../src/governance/runtime"

describe("governance runtime", () => {
  test("summarizes decision rows and ignores result rows", () => {
    const out = summarizeRuntime([
      {
        entry_type: "decision",
        tool: "bash",
        mode: "block",
        blocked: true,
        decision: "hold_for_operator_review",
        confidence: 1,
        timestamp_ms: 2,
      },
      {
        entry_type: "result",
        tool: "bash",
      },
      {
        entry_type: "decision",
        tool: "bash",
        mode: "block",
        blocked: false,
        decision: "clear_for_operator_review",
        confidence: 0.91,
        timestamp_ms: 3,
      },
    ])

    expect(out).toMatchObject({
      decisions: 2,
      blocked: 1,
      holds: 1,
      clears: 1,
      latest: {
        tool: "bash",
        mode: "block",
        blocked: false,
        decision: "clear_for_operator_review",
        confidence: 0.91,
      },
    })
  })

  test("reads a session ledger from disk", async () => {
    const project = "proj-runtime"
    const file = runtimePath(project, "ses")
    await fs.mkdir(path.dirname(file), { recursive: true })
    try {
      await Bun.write(
        file,
        [
          JSON.stringify({
            entry_type: "decision",
            tool: "bash",
            mode: "shadow",
            blocked: false,
            decision: "hold_for_operator_review",
            confidence: 0.94,
            timestamp_ms: 1,
          }),
          JSON.stringify({
            entry_type: "decision",
            tool: "write",
            mode: "shadow",
            blocked: false,
            decision: "clear_for_operator_review",
            confidence: 0.88,
            timestamp_ms: 2,
          }),
        ].join("\n") + "\n",
      )

      await expect(runtime(project, "ses")).resolves.toMatchObject({
        decisions: 2,
        blocked: 0,
        holds: 1,
        clears: 1,
        latest: {
          tool: "write",
          mode: "shadow",
          decision: "clear_for_operator_review",
          confidence: 0.88,
        },
      })
    } finally {
      await fs.rm(path.dirname(file), { recursive: true, force: true })
    }
  })
})
