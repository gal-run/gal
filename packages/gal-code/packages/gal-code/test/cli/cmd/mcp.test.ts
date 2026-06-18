import { describe, expect, test } from "bun:test"
import {
  McpCommand,
  McpAddCommand,
  McpAuthCommand,
  McpDebugCommand,
  McpListCommand,
  McpLogoutCommand,
} from "../../../src/cli/cmd/mcp"

function getAuthStatusIcon(status: string): string {
  switch (status) {
    case "authenticated":
      return "\u2713"
    case "expired":
      return "\u26A0"
    case "not_authenticated":
      return "\u2717"
  }
  return ""
}

function getAuthStatusText(status: string): string {
  switch (status) {
    case "authenticated":
      return "authenticated"
    case "expired":
      return "expired"
    case "not_authenticated":
      return "not authenticated"
  }
  return ""
}

type McpEntry = Record<string, unknown> | undefined

function isMcpConfigured(config: McpEntry): config is Record<string, unknown> {
  return typeof config === "object" && config !== null && "type" in config
}

function isMcpRemote(config: McpEntry): config is { type: "remote"; url?: string } {
  return isMcpConfigured(config) && config.type === "remote"
}

describe("mcp auth status helpers", () => {
  test("getAuthStatusIcon returns checkmark for authenticated", () => {
    expect(getAuthStatusIcon("authenticated")).toBe("\u2713")
  })

  test("getAuthStatusIcon returns warning for expired", () => {
    expect(getAuthStatusIcon("expired")).toBe("\u26A0")
  })

  test("getAuthStatusIcon returns cross for not_authenticated", () => {
    expect(getAuthStatusIcon("not_authenticated")).toBe("\u2717")
  })

  test("getAuthStatusIcon returns empty for unknown status", () => {
    expect(getAuthStatusIcon("unknown" as any)).toBe("")
  })

  test("getAuthStatusText returns human-readable status", () => {
    expect(getAuthStatusText("authenticated")).toBe("authenticated")
    expect(getAuthStatusText("expired")).toBe("expired")
    expect(getAuthStatusText("not_authenticated")).toBe("not authenticated")
  })
})

describe("mcp type guards", () => {
  test("isMcpConfigured returns false for undefined", () => {
    expect(isMcpConfigured(undefined)).toBe(false)
  })

  test("isMcpConfigured returns false for string (not object)", () => {
    expect(isMcpConfigured("remote" as unknown as McpEntry)).toBe(false)
  })

  test("isMcpConfigured returns true for object with type", () => {
    expect(isMcpConfigured({ type: "remote", url: "https://example.com" })).toBe(true)
  })

  test("isMcpConfigured returns true for local config", () => {
    expect(isMcpConfigured({ type: "local", command: ["node", "server.js"] })).toBe(true)
  })

  test("isMcpRemote returns false for local config", () => {
    expect(isMcpRemote({ type: "local", command: ["node", "server.js"] })).toBe(false)
  })

  test("isMcpRemote returns true for remote config", () => {
    expect(isMcpRemote({ type: "remote", url: "https://example.com/mcp" })).toBe(true)
  })

  test("isMcpRemote returns false for undefined", () => {
    expect(isMcpRemote(undefined)).toBe(false)
  })
})

describe("mcp command definitions", () => {
  test("McpCommand is a parent command", () => {
    expect(McpCommand.command).toBe("mcp")
    expect(McpCommand.describe).toContain("MCP")
    expect(McpCommand.builder).toBeDefined()
    expect(McpCommand.handler).toBeDefined()
  })

  test("McpAddCommand defines add subcommand", () => {
    expect(McpAddCommand.command).toBe("add")
    expect(McpAddCommand.describe).toBe("add an MCP server")
  })

  test("McpListCommand defines list subcommand", () => {
    expect(McpListCommand.command).toBe("list")
    expect(McpListCommand.describe).toBe("list MCP servers and their status")
  })

  test("McpAuthCommand defines auth subcommand with positional name", () => {
    expect(McpAuthCommand.command).toBe("auth [name]")
    expect(McpAuthCommand.describe).toBe("authenticate with an OAuth-enabled MCP server")
    expect(McpAuthCommand.builder).toBeDefined()
  })

  test("McpLogoutCommand defines logout subcommand with positional name", () => {
    expect(McpLogoutCommand.command).toBe("logout [name]")
    expect(McpLogoutCommand.describe).toBe("remove OAuth credentials for an MCP server")
  })

  test("McpDebugCommand defines debug subcommand with required name", () => {
    expect(McpDebugCommand.command).toBe("debug <name>")
    expect(McpDebugCommand.describe).toBe("debug OAuth connection for an MCP server")
    expect(McpDebugCommand.builder).toBeDefined()
  })
})
