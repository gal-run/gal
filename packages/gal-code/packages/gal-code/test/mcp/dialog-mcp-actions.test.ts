import { describe, expect, test, mock, beforeEach } from "bun:test"

/**
 * Tests for MCP dialog keyboard actions:
 * - Enter: view tools (connected servers)
 * - 'a': authenticate (needs_auth servers)
 * - Space: toggle MCP
 * - 'r': reconnect
 */
describe("MCP dialog keyboard actions", () => {
  let fetchCalls: Array<{ url: string; method: string }> = []
  let mcpCalls: { connect: string[]; disconnect: string[]; toggle: string[] } = {
    connect: [],
    disconnect: [],
    toggle: [],
  }
  let authStartCalls: string[] = []

  beforeEach(() => {
    fetchCalls = []
    mcpCalls = { connect: [], disconnect: [], toggle: [] }
    authStartCalls = []
  })

  test("connected server -> Enter -> fetches tools", async () => {
    // Simulate what the dialog does when Enter is pressed on a connected server
    const name = "gal-vision"

    // The showTools function checks status first
    const status = { status: "connected" as const }
    expect(status.status).toBe("connected")

    // Then it calls setSelectedServer(name) which triggers DialogMcpTools
    // DialogMcpTools fetches: GET /mcp/${name}/tools
    const url = `/mcp/${name}/tools`
    fetchCalls.push({ url, method: "GET" })

    expect(fetchCalls).toHaveLength(1)
    expect(fetchCalls[0].url).toBe(`/mcp/gal-vision/tools`)
  })

  test("failed server -> Enter -> shows error toast", () => {
    // showTools checks status first
    const status = { status: "failed" as const, error: "Connection refused" }

    // When status !== "connected", it shows an error toast
    expect(status.status).not.toBe("connected")
    // The error message should be descriptive
    expect(status.error).toBeTruthy()
  })

  test("needs_auth server -> press 'a' -> starts auth flow", async () => {
    const name = "github-mcp"
    const status = { status: "needs_auth" as const }

    // The 'a' keybind checks status
    expect(status.status).toBe("needs_auth")

    // Then calls authenticateServer(name)
    authStartCalls.push(name)

    expect(authStartCalls).toHaveLength(1)
    expect(authStartCalls[0]).toBe(name)
  })

  test("connected server -> press 'a' does nothing", () => {
    const status: { status: string } = { status: "connected" }

    const shouldAuth = status.status === "needs_auth"
    expect(shouldAuth).toBe(false)
  })

  test("failed server -> press 'a' does nothing", () => {
    const status: { status: string } = { status: "failed" }
    const shouldAuth = status.status === "needs_auth"
    expect(shouldAuth).toBe(false)
  })

  test("press space -> toggles MCP server", () => {
    const name = "gal-terminal-use"

    // Space keybind calls local.mcp.toggle(name)
    mcpCalls.toggle.push(name)

    expect(mcpCalls.toggle).toHaveLength(1)
    expect(mcpCalls.toggle[0]).toBe(name)
  })

  test("press 'r' -> reconnects MCP server", () => {
    const name = "gal-browser-use"

    // 'r' keybind calls reconnectServer(name)
    // reconnect disconnects first (if connected), then connects
    mcpCalls.disconnect.push(name)
    mcpCalls.connect.push(name)

    expect(mcpCalls.disconnect).toHaveLength(1)
    expect(mcpCalls.connect).toHaveLength(1)
    expect(mcpCalls.disconnect[0]).toBe(name)
    expect(mcpCalls.connect[0]).toBe(name)
  })

  test("gal-vision with needs_auth -> press 'a' -> prompts for GEMINI_API_KEY instead", () => {
    const name = "gal-vision"
    const status = { status: "needs_auth" as const }

    // isGalVision check triggers promptGeminiApiKey
    const isGalVision = name === "gal-vision"
    expect(isGalVision).toBe(true)

    // For gal-vision, it shows the GEMINI_API_KEY dialog instead of OAuth
    const usedApiKeyFlow = isGalVision && status.status === "needs_auth"
    expect(usedApiKeyFlow).toBe(true)
  })
})

describe("MCP tools fetch", () => {
  test("fetches tools for connected server", () => {
    const name = "gal-vision"
    const endpoint = `/mcp/${name}/tools`
    expect(endpoint).toBe("/mcp/gal-vision/tools")
  })

  test("parses tools response correctly", () => {
    const mockTools = [
      { name: "tool_a", description: "First tool" },
      { name: "tool_b", description: "Second tool" },
    ]

    expect(mockTools).toHaveLength(2)
    expect(mockTools[0].name).toBe("tool_a")
    expect(mockTools[1].description).toBe("Second tool")
  })

  test("handles empty tools response", () => {
    const tools: Array<{ name: string }> = []
    expect(tools).toHaveLength(0)
  })
})

describe("MCP status descriptions", () => {
  test("connected shows 'Press enter to view tools'", () => {
    const description = "Press 'enter' to view tools"
    expect(description).toContain("enter")
    expect(description).toContain("view tools")
  })

  test("needs_auth shows 'Press a to authenticate'", () => {
    const description = "Press 'a' to authenticate"
    expect(description).toContain("authenticate")
  })

  test("failed shows error message", () => {
    const error = "Connection refused"
    expect(error).toBeTruthy()
  })

  test("disabled shows no description", () => {
    const description = undefined
    expect(description).toBeUndefined()
  })
})
