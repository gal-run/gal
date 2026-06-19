import { describe, expect, test } from "bun:test"
import { convertMcpJson } from "../../src/config/mcp-json"

describe("convertMcpJson", () => {
  test("empty input", () => {
    expect(convertMcpJson(null)).toEqual({})
    expect(convertMcpJson(undefined)).toEqual({})
    expect(convertMcpJson(42)).toEqual({})
    expect(convertMcpJson("string")).toEqual({})
    expect(convertMcpJson([])).toEqual({})
    expect(convertMcpJson({})).toEqual({})
  })

  test("null when mcpServers is not an object", () => {
    expect(convertMcpJson({ mcpServers: null })).toEqual({})
    expect(convertMcpJson({ mcpServers: [] })).toEqual({})
    expect(convertMcpJson({ mcpServers: "not-object" })).toEqual({})
  })

  test("local server with command and args", () => {
    const out = convertMcpJson({
      mcpServers: {
        lint: { command: "npx", args: ["@biomejs/biome", "lsp-proxy"] },
      },
    })
    expect(out["lint"]).toEqual({
      type: "local",
      command: ["npx", "@biomejs/biome", "lsp-proxy"],
    })
  })

  test("local server with command only", () => {
    const out = convertMcpJson({
      mcpServers: { echo: { command: "echo" } },
    })
    expect(out["echo"]).toEqual({ type: "local", command: ["echo"] })
  })

  test("local server via type stdio isn't in remotes set", () => {
    const out = convertMcpJson({
      mcpServers: { echo: { type: "stdio", command: "echo" } },
    })
    expect(out["echo"]).toEqual({ type: "local", command: ["echo"] })
  })

  test("remote server via sse type", () => {
    const out = convertMcpJson({
      mcpServers: {
        search: { type: "sse", url: "https://search.example.com/sse" },
      },
    })
    expect(out["search"]).toEqual({
      type: "remote",
      url: "https://search.example.com/sse",
    })
  })

  test("remote server via streamableHttp type", () => {
    const out = convertMcpJson({
      mcpServers: {
        api: { type: "streamableHttp", url: "https://api.example.com/mcp" },
      },
    })
    expect(out["api"]).toEqual({
      type: "remote",
      url: "https://api.example.com/mcp",
    })
  })

  test("remote auto-detected from url without command", () => {
    const out = convertMcpJson({
      mcpServers: {
        remote: { url: "https://example.com/mcp" },
      },
    })
    expect(out["remote"]).toEqual({
      type: "remote",
      url: "https://example.com/mcp",
    })
  })

  test("remote with headers", () => {
    const out = convertMcpJson({
      mcpServers: {
        auth: {
          type: "sse",
          url: "https://example.com/sse",
          headers: { Authorization: "Bearer token" },
        },
      },
    })
    expect(out["auth"]).toEqual({
      type: "remote",
      url: "https://example.com/sse",
      headers: { Authorization: "Bearer token" },
    })
  })

  test("local with environment variables", () => {
    const out = convertMcpJson({
      mcpServers: {
        db: { command: "node", args: ["server.js"], env: { NODE_ENV: "production" } },
      },
    })
    expect(out["db"]).toEqual({
      type: "local",
      command: ["node", "server.js"],
      environment: { NODE_ENV: "production" },
    })
  })

  test("enabled flag", () => {
    const out = convertMcpJson({
      mcpServers: {
        on: { command: "echo", enabled: true },
        off: { command: "echo", enabled: false },
      },
    })
    expect(out["on"]!.enabled).toBe(true)
    expect(out["off"]!.enabled).toBe(false)
  })

  test("timeout flag", () => {
    const out = convertMcpJson({
      mcpServers: { slow: { command: "echo", timeout: 30000 } },
    })
    expect(out["slow"]!.timeout).toBe(30000)
  })

  test("builtin flag", () => {
    const out = convertMcpJson({
      mcpServers: { core: { command: "echo", builtin: true } },
    })
    expect(out["core"]!.builtin).toBe(true)
  })

  test("multiple servers", () => {
    const out = convertMcpJson({
      mcpServers: {
        a: { command: "echo" },
        b: { type: "sse", url: "https://b.example.com" },
      },
    })
    expect(Object.keys(out)).toEqual(["a", "b"])
    expect(out["a"]!.type).toBe("local")
    expect(out["b"]!.type).toBe("remote")
  })

  test("skips non-object server entries", () => {
    const out = convertMcpJson({
      mcpServers: {
        valid: { command: "echo" },
        invalidString: "nope",
        invalidArray: [1, 2, 3],
        invalidNull: null,
      },
    })
    expect(Object.keys(out)).toEqual(["valid"])
  })

  test("local with no command falls back to empty array", () => {
    const out = convertMcpJson({
      mcpServers: { broken: { args: ["some", "args"] } },
    })
    // No command and no url — defaults to local with args only
    expect(out["broken"]).toEqual({
      type: "local",
      command: ["some", "args"],
    })
  })

  test("remote with empty url defaults to blank", () => {
    const out = convertMcpJson({
      mcpServers: { remote: { type: "sse" } },
    })
    expect(out["remote"]).toEqual({ type: "remote", url: "" })
  })

  test("http type treated as remote", () => {
    const out = convertMcpJson({
      mcpServers: { r: { type: "http", url: "https://x.com" } },
    })
    expect(out["r"]).toEqual({ type: "remote", url: "https://x.com" })
  })

  test("streamable type treated as remote", () => {
    const out = convertMcpJson({
      mcpServers: { r: { type: "streamable", url: "https://x.com" } },
    })
    expect(out["r"]).toEqual({ type: "remote", url: "https://x.com" })
  })

  test("args is not an array", () => {
    const out = convertMcpJson({
      mcpServers: { s: { command: "echo", args: "not-array" } },
    })
    expect(out["s"]).toEqual({ type: "local", command: ["echo"] })
  })

  test("env on remote is ignored", () => {
    const out = convertMcpJson({
      mcpServers: { r: { type: "sse", url: "https://x.com", env: { X: "1" } } },
    })
    expect(out["r"]).toEqual({ type: "remote", url: "https://x.com" })
    expect((out["r"] as any).environment).toBeUndefined()
  })

  test("headers on local is ignored", () => {
    const out = convertMcpJson({
      mcpServers: { s: { command: "echo", headers: { X: "1" } } },
    })
    expect(out["s"]).toEqual({ type: "local", command: ["echo"] })
    expect((out["s"] as any).headers).toBeUndefined()
  })

  test("empty mcpServers object", () => {
    const out = convertMcpJson({ mcpServers: {} })
    expect(out).toEqual({})
  })

  test("command alone prevents remote auto-detection", () => {
    const out = convertMcpJson({
      mcpServers: { s: { command: "echo", url: "https://x.com" } },
    })
    expect(out["s"]!.type).toBe("local")
  })
})
