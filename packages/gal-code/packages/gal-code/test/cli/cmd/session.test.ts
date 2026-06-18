import { describe, expect, test } from "bun:test"
import { SessionCommand, SessionListCommand, SessionDeleteCommand } from "../../../src/cli/cmd/session"
import { Locale } from "../../../src/util/locale"
import yargs from "yargs"

describe("SessionCommand option definitions", () => {
  test("defines session command", () => {
    expect(SessionCommand.command).toBe("session")
    expect(SessionCommand.describe).toBe("manage sessions")
    expect(SessionCommand.builder).toBeDefined()
    expect(SessionCommand.handler).toBeDefined()
  })

  test("SessionListCommand defines list subcommand", () => {
    expect(SessionListCommand.command).toBe("list")
    expect(SessionListCommand.describe).toBe("list sessions")
  })

  test("SessionListCommand defines --max-count with alias -n", () => {
    const y = yargs([])
    const built = (SessionListCommand.builder as any)(y)
    const opts = built.getOptions()
    expect(opts.key["max-count"]).toBeDefined()
    expect(opts.key["n"]).toBeDefined()
    expect(opts.number).toContain("max-count")
  })

  test("SessionListCommand defines --format with choices table:json", () => {
    const y = yargs([])
    const built = (SessionListCommand.builder as any)(y)
    const opts = built.getOptions()
    expect(opts.key["format"]).toBeDefined()
    expect(opts.string).toContain("format")
  })

  test("SessionDeleteCommand defines delete subcommand with required sessionID", () => {
    expect(SessionDeleteCommand.command).toBe("delete <sessionID>")
    expect(SessionDeleteCommand.describe).toBe("delete a session")
  })
})

describe("Locale helpers", () => {
  test("truncate shortens long strings", () => {
    const result = Locale.truncate("Hello World", 8)
    expect(result.length).toBeLessThanOrEqual(8)
    expect(result.endsWith("\u2026")).toBe(true)
  })

  test("truncate keeps short strings unchanged", () => {
    const result = Locale.truncate("Hello", 10)
    expect(result).toBe("Hello")
  })

  test("truncate returns exact for length-match", () => {
    const result = Locale.truncate("Hello", 5)
    expect(result).toBe("Hello")
  })

  test("titlecase capitalizes words", () => {
    const result = Locale.titlecase("hello world")
    expect(result).toBe("Hello World")
  })

  test("titlecase handles single word", () => {
    const result = Locale.titlecase("agent")
    expect(result).toBe("Agent")
  })

  test("pluralize singular", () => {
    const result = Locale.pluralize(1, "{} session", "{} sessions")
    expect(result).toBe("1 session")
  })

  test("pluralize plural", () => {
    const result = Locale.pluralize(5, "{} session", "{} sessions")
    expect(result).toBe("5 sessions")
  })

  test("number formats millions", () => {
    const result = Locale.number(2500000)
    expect(result).toBe("2.5M")
  })

  test("number formats thousands", () => {
    const result = Locale.number(5400)
    expect(result).toBe("5.4K")
  })

  test("number formats small numbers as-is", () => {
    const result = Locale.number(42)
    expect(result).toBe("42")
  })
})

describe("session ID lexicographic sort", () => {
  test("session IDs sort lexicographically", () => {
    const ids = ["ses_zzz", "ses_aaa", "ses_mmm"]
    const sorted = [...ids].sort()
    expect(sorted).toEqual(["ses_aaa", "ses_mmm", "ses_zzz"])
  })
})
