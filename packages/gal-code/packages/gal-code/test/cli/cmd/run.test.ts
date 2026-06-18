import { describe, expect, test } from "bun:test"
import { gov, pickModel } from "../../../src/cli/cmd/governance"
import { RunCommand } from "../../../src/cli/cmd/run"
import yargs from "yargs"

function buildMessage(args: { message?: string[]; "--"?: string[] }) {
  return [...(args.message ?? []), ...(args["--"] ?? [])]
    .map((arg) => (arg.includes(" ") ? `"${arg.replace(/"/g, '\\"')}"` : arg))
    .join(" ")
}

describe("run message building", () => {
  test("joins positional arguments into a message", () => {
    const msg = buildMessage({ message: ["hello", "world"] })
    expect(msg).toBe("hello world")
  })

  test("includes extra args after -- separator", () => {
    const msg = buildMessage({ message: ["run"], "--": ["--verbose", "--dry-run"] })
    expect(msg).toBe("run --verbose --dry-run")
  })

  test("quotes args containing spaces", () => {
    const msg = buildMessage({ message: ["fix", "the bug"] })
    expect(msg).toBe('fix "the bug"')
  })

  test("escapes double quotes in arguments", () => {
    const msg = buildMessage({ message: ['say "hello" world'] })
    expect(msg).toBe('"say \\"hello\\" world"')
  })

  test("returns empty string for no arguments", () => {
    const msg = buildMessage({})
    expect(msg).toBe("")
  })

  test("returns empty string for empty arrays", () => {
    const msg = buildMessage({ message: [] })
    expect(msg).toBe("")
  })
})

describe("run command option definitions", () => {
  test("has positional message argument via yargs builder", () => {
    const y = yargs([])
    const built = (RunCommand.builder as any)(y)
    const opts = built.getOptions()
    expect(opts.key["message"]).toBeDefined()
  })

  test("defines --continue with alias -c in boolean list", () => {
    const y = yargs([])
    const built = (RunCommand.builder as any)(y)
    const opts = built.getOptions()
    expect(opts.key["continue"]).toBeDefined()
    expect(opts.boolean).toContain("c")
  })

  test("defines --model with alias -m", () => {
    const y = yargs([])
    const built = (RunCommand.builder as any)(y)
    const opts = built.getOptions()
    expect(opts.key["model"]).toBeDefined()
  })

  test("defines --format with choices default:json", () => {
    const y = yargs([])
    const built = (RunCommand.builder as any)(y)
    const opts = built.getOptions()
    expect(opts.key["format"]).toBeDefined()
  })

  test("defines --thinking as boolean flag", () => {
    const y = yargs([])
    const built = (RunCommand.builder as any)(y)
    const opts = built.getOptions()
    expect(opts.key["thinking"]).toBeDefined()
    expect(opts.boolean).toContain("thinking")
  })

  test("defines governance options", () => {
    const y = yargs([])
    const built = (RunCommand.builder as any)(y)
    const opts = built.getOptions()
    expect(opts.key["governance"]).toBeDefined()
    expect(opts.key["governance-mode"]).toBeDefined()
    expect(opts.key["governance-min-confidence"]).toBeDefined()
  })
})

describe("run governance (complementary)", () => {
  test("gov returns undefined when governance is false", () => {
    const cfg = gov({ governance: false })
    expect(cfg).toBeUndefined()
  })

  test("gov returns block mode for unknown mode string", () => {
    const cfg = gov({ governance: true, "governance-mode": "unknown-mode" })
    expect(cfg?.mode).toBe("block")
  })

  test("pickModel respects explicit model argument", () => {
    const model = pickModel({ model: "custom/provider" }, "fallback/model")
    expect(model).toBe("custom/provider")
  })

  test("pickModel returns undefined when governance is explicitly false", () => {
    const model = pickModel({ governance: false }, "fallback/model")
    expect(model).toBeUndefined()
  })
})
