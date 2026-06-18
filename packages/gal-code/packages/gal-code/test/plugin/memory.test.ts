import { afterEach, describe, expect, test } from "bun:test"
import { MemoryPlugin } from "../../src/plugin/memory"

const originalFetch = globalThis.fetch

afterEach(() => {
  globalThis.fetch = originalFetch
})

describe("MemoryPlugin", () => {
  test("flushes captured significant tool output to the memory API on session end", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return new Response("{}", { status: 201 })
    }) as typeof fetch

    const hooks = await MemoryPlugin({} as any)
    await hooks["tool.execute.after"]?.(
      { tool: "bash", args: { command: "bun test packages/gal-code/test/session/prompt.test.ts" } } as any,
      { title: "bash", output: `tests passed\n${"x".repeat(150)}`, metadata: {} },
    )
    await hooks["session.end"]?.({ sessionID: "ses_memory_test" }, {})

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toContain("/api/memory")
    expect(calls[0].init?.method).toBe("POST")
    expect(calls[0].init?.signal).toBeInstanceOf(AbortSignal)

    const body = JSON.parse(String(calls[0].init?.body))
    expect(body.sessionID).toBe("ses_memory_test")
    expect(body.source).toBe("agent")
    expect(body.tags).toContain("testing")
    expect(body.content).toContain("Tool bash produced significant output")
  })

  test("does not flush short or duplicate outputs", async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = []
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return new Response("{}", { status: 201 })
    }) as typeof fetch

    const hooks = await MemoryPlugin({} as any)
    await hooks["tool.execute.after"]?.({ tool: "bash", args: { command: "echo tiny" } } as any, {
      title: "bash",
      output: "tiny",
      metadata: {},
    })

    const significant = `config fix\n${"y".repeat(150)}`
    await hooks["tool.execute.after"]?.({ tool: "grep", args: { pattern: "config" } } as any, {
      title: "grep",
      output: significant,
      metadata: {},
    })
    await hooks["tool.execute.after"]?.({ tool: "grep", args: { pattern: "config" } } as any, {
      title: "grep",
      output: significant,
      metadata: {},
    })
    await hooks["session.end"]?.({ sessionID: "ses_memory_test" }, {})

    expect(calls).toHaveLength(1)
    const body = JSON.parse(String(calls[0].init?.body))
    expect(body.tags).toContain("configuration")
  })
})
