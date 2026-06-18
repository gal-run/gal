import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { buildFeatures, GalPlugin } from "../../src/plugin/gal"
import { runtimePath } from "../../src/governance/runtime"
import { tmpdir } from "../fixture/fixture"

const env = {
  enabled: process.env.GAL_ENABLED,
  mode: process.env.GAL_MODE,
  cut: process.env.GAL_MIN_CONFIDENCE,
  log: process.env.GAL_LEDGER_DIR,
}

afterEach(() => {
  for (const [key, value] of Object.entries({
    GAL_ENABLED: env.enabled,
    GAL_MODE: env.mode,
    GAL_MIN_CONFIDENCE: env.cut,
    GAL_LEDGER_DIR: env.log,
  })) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe("GalPlugin", () => {
  test("maps external state changes into review features", () => {
    const out = buildFeatures("bash", 'git push origin dev && echo "ship"')
    expect(out.operator_review_required).toBeTrue()
    expect(out.detection_count).toBeGreaterThanOrEqual(1)
    expect(out.evidence_complete).toBeTrue()
  })

  test("blocks risky commands when sidecar returns hold", async () => {
    await using tmp = await tmpdir()
    process.env.GAL_ENABLED = "1"
    process.env.GAL_MODE = "block"
    process.env.GAL_LEDGER_DIR = path.join(tmp.path, "ledger")

    const hooks = await GalPlugin({ directory: tmp.path, project: { id: "proj" } } as never)

    await expect(
      hooks["command.execute.before"]?.(
        { command: "git", arguments: "push origin dev", sessionID: "ses" },
        { parts: [] },
      ),
    ).rejects.toThrow("Blocked by GAL")

    const rows = (await fs.readFile(path.join(tmp.path, "ledger", "ses.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({
      entry_type: "decision",
      blocked: true,
      tool: "bash",
      decision: "hold_for_operator_review",
    })
  })

  test("ignores read-only tools", async () => {
    process.env.GAL_ENABLED = "1"
    process.env.GAL_MODE = "block"

    const hooks = await GalPlugin({ directory: process.cwd(), project: { id: "proj" } } as never)

    await expect(
      hooks["tool.execute.before"]?.(
        { tool: "read", sessionID: "ses", callID: "call" },
        { args: { file_path: "README.md" } },
      ),
    ).resolves.toBeUndefined()
  })

  test("writes decision and result ledger rows for executed tools", async () => {
    await using tmp = await tmpdir()
    process.env.GAL_ENABLED = "1"
    process.env.GAL_MODE = "block"
    process.env.GAL_LEDGER_DIR = path.join(tmp.path, "ledger")

    const hooks = await GalPlugin({ directory: tmp.path, project: { id: "proj" } } as never)
    await hooks["tool.execute.before"]?.(
      { tool: "bash", sessionID: "ses", callID: "call" },
      { args: { command: "git status --short" } },
    )
    await hooks["tool.execute.after"]?.(
      { tool: "bash", sessionID: "ses", callID: "call", args: { command: "git status --short" } },
      { title: "ok", output: " M README.md", metadata: { exitCode: 0 } },
    )

    const rows = (await fs.readFile(path.join(tmp.path, "ledger", "ses.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({
      entry_type: "decision",
      blocked: false,
      tool: "bash",
      decision: "clear_for_operator_review",
    })
    expect(rows[1]).toMatchObject({
      entry_type: "result",
      tool: "bash",
      title: "ok",
      metadata_keys: ["exitCode"],
    })
  })

  test("defaults ledger outside the project directory", async () => {
    await using tmp = await tmpdir()
    process.env.GAL_ENABLED = "1"
    process.env.GAL_MODE = "block"
    delete process.env.GAL_LEDGER_DIR

    const session = "ses-default"
    const project = "proj-default"
    const file = runtimePath(project, session)
    await fs.rm(path.dirname(file), { recursive: true, force: true })

    const hooks = await GalPlugin({
      directory: tmp.path,
      project: { id: project },
    } as never)
    await hooks["tool.execute.before"]?.(
      { tool: "bash", sessionID: session, callID: "call" },
      { args: { command: "git status --short" } },
    )

    expect(await fs.readFile(file, "utf8")).toContain('"entry_type":"decision"')
    await expect(fs.stat(path.join(tmp.path, ".gal", "code", "governance", `${session}.jsonl`))).rejects.toBeDefined()
  })
})
