import { test, expect, mock, beforeEach } from "bun:test"

// --- Mock infrastructure ---

// Per-client state for controlling mock behavior
interface MockClientState {
  tools: Array<{ name: string; description?: string; inputSchema: object }>
  listToolsCalls: number
  listToolsShouldFail: boolean
  listToolsError: string
  listPromptsShouldFail: boolean
  listResourcesShouldFail: boolean
  prompts: Array<{ name: string; description?: string }>
  resources: Array<{ name: string; uri: string; description?: string }>
  closed: boolean
  notificationHandlers: Map<unknown, (...args: any[]) => any>
}

const clientStates = new Map<string, MockClientState>()
let lastCreatedClientName: string | undefined
let connectShouldFail = false
let connectShouldHang = false
let connectError = "Mock transport cannot connect"
// Tracks how many Client instances were created (detects leaks)
let clientCreateCount = 0
// Tracks how many times transport.close() is called across all mock transports
let transportCloseCount = 0

function getOrCreateClientState(name?: string): MockClientState {
  const key = name ?? "default"
  let state = clientStates.get(key)
  if (!state) {
    state = {
      tools: [{ name: "test_tool", description: "A test tool", inputSchema: { type: "object", properties: {} } }],
      listToolsCalls: 0,
      listToolsShouldFail: false,
      listToolsError: "listTools failed",
      listPromptsShouldFail: false,
      listResourcesShouldFail: false,
      prompts: [],
      resources: [],
      closed: false,
      notificationHandlers: new Map(),
    }
    clientStates.set(key, state)
  }
  return state
}

// Mock transport that succeeds or fails based on connectShouldFail / connectShouldHang
class MockStdioTransport {
  stderr: null = null
  pid = 12345
  constructor(_opts: any) {}
  async start() {
    if (connectShouldHang) return new Promise<void>(() => {}) // never resolves
    if (connectShouldFail) throw new Error(connectError)
  }
  async close() {
    transportCloseCount++
  }
}

class MockStreamableHTTP {
  constructor(_url: URL, _opts?: any) {}
  async start() {
    if (connectShouldHang) return new Promise<void>(() => {}) // never resolves
    if (connectShouldFail) throw new Error(connectError)
  }
  async close() {
    transportCloseCount++
  }
  async finishAuth() {}
}

class MockSSE {
  constructor(_url: URL, _opts?: any) {}
  async start() {
    if (connectShouldHang) return new Promise<void>(() => {}) // never resolves
    if (connectShouldFail) throw new Error(connectError)
  }
  async close() {
    transportCloseCount++
  }
}

mock.module("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: MockStdioTransport,
}))

mock.module("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: MockStreamableHTTP,
}))

mock.module("@modelcontextprotocol/sdk/client/sse.js", () => ({
  SSEClientTransport: MockSSE,
}))

mock.module("@modelcontextprotocol/sdk/client/auth.js", () => ({
  UnauthorizedError: class extends Error {
    constructor() {
      super("Unauthorized")
    }
  },
}))

// Mock Client that delegates to per-name MockClientState
mock.module("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class MockClient {
    _state!: MockClientState
    transport: any

    constructor(_opts: any) {
      clientCreateCount++
    }

    async connect(transport: { start: () => Promise<void> }) {
      this.transport = transport
      await transport.start()
      // After successful connect, bind to the last-created client name
      this._state = getOrCreateClientState(lastCreatedClientName)
    }

    setNotificationHandler(schema: unknown, handler: (...args: any[]) => any) {
      this._state?.notificationHandlers.set(schema, handler)
    }

    async listTools() {
      if (this._state) this._state.listToolsCalls++
      if (this._state?.listToolsShouldFail) {
        throw new Error(this._state.listToolsError)
      }
      return { tools: this._state?.tools ?? [] }
    }

    async listPrompts() {
      if (this._state?.listPromptsShouldFail) {
        throw new Error("listPrompts failed")
      }
      return { prompts: this._state?.prompts ?? [] }
    }

    async listResources() {
      if (this._state?.listResourcesShouldFail) {
        throw new Error("listResources failed")
      }
      return { resources: this._state?.resources ?? [] }
    }

    async close() {
      if (this._state) this._state.closed = true
    }
  },
}))

beforeEach(() => {
  clientStates.clear()
  lastCreatedClientName = undefined
  connectShouldFail = false
  connectShouldHang = false
  connectError = "Mock transport cannot connect"
  clientCreateCount = 0
  transportCloseCount = 0
})

// Import after mocks
const { MCP } = await import("../../src/mcp/index")
const { Instance } = await import("../../src/project/instance")
const { tmpdir } = await import("../fixture/fixture")

// --- Helper ---

function withInstance(config: Record<string, any>, fn: () => Promise<void>) {
  return async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        await Bun.write(
          `${dir}/gal-code.json`,
          JSON.stringify({
            $schema: "https://gal.run/config.json",
            mcp: config,
          }),
        )
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        await fn()
        // dispose instance to clean up state between tests
        await Instance.dispose()
      },
    })
  }
}

// Tool definitions matching the real gal-cli-mcp server tool set
const builtinTools = [
  {
    name: "gal_swarm_run",
    description: "Create and execute a GAL Swarm run plan",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "gal_dispatch_agent",
    description: "Create a new background agent session",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "gal_read_memory",
    description: "Read shared organization memory entries",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "gal_write_memory",
    description: "Write a shared memory entry",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "gal_list_workspaces",
    description: "List connected GitHub workspaces",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "gal_get_session_output",
    description: "Fetch recent tool activity output",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "gal_list_sessions",
    description: "List all active GAL sessions",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "gal_list_proposals",
    description: "List config change proposals",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "gal_sync_workspace",
    description: "Trigger a quick-sync to refresh workspace data",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "gal_get_active_workspace",
    description: "Get the currently active workspace",
    inputSchema: { type: "object", properties: {} },
  },
]

// ========================================================================
// Test: builtin-style gal-cli-mcp server connects successfully
// ========================================================================

test(
  "builtin cli-mcp server connects and tools are accessible",
  withInstance({}, async () => {
    // Trigger lazy MCP state init first so builtins bind to "default" state
    await MCP.status()

    lastCreatedClientName = "builtin-cli-mcp"
    const state = getOrCreateClientState("builtin-cli-mcp")
    state.tools = builtinTools

    const addResult = await MCP.add("builtin-cli-mcp", {
      type: "local",
      command: ["node", "path/to/gal-cli-mcp/dist/index.js"],
    })

    expect((addResult.status as any)["builtin-cli-mcp"]?.status ?? (addResult.status as any).status).toBe("connected")

    // Verify listTools() was called during connect
    expect(state.listToolsCalls).toBeGreaterThanOrEqual(1)

    // Verify all tools are accessible
    const tools = await MCP.tools()
    const keys = Object.keys(tools).filter((k) => k.startsWith("builtin-cli-mcp"))
    expect(keys.length).toBe(builtinTools.length)

    // Each builtin tool should be present with its namespaced name
    for (const tool of builtinTools) {
      const ns = `builtin-cli-mcp_${tool.name}`
      expect(keys).toContain(ns)
    }

    // Verify toolsForServer works
    const serverTools = await MCP.toolsForServer("builtin-cli-mcp")
    expect(serverTools.length).toBe(builtinTools.length)
    for (const tool of builtinTools) {
      expect(serverTools.some((t) => t.name === tool.name)).toBe(true)
    }
  }),
)

// ========================================================================
// Test: builtin server tools survive re-query (cache works)
// ========================================================================

test(
  "builtin server tools are cached and reused on subsequent queries",
  withInstance({}, async () => {
    await MCP.status()

    lastCreatedClientName = "builtin-cli-mcp"
    const state = getOrCreateClientState("builtin-cli-mcp")
    state.tools = builtinTools

    await MCP.add("builtin-cli-mcp", {
      type: "local",
      command: ["node", "path/to/gal-cli-mcp/dist/index.js"],
    })

    const callsAfterConnect = state.listToolsCalls

    // Multiple queries should not re-fetch
    await MCP.tools()
    await MCP.tools()
    await MCP.tools()

    expect(state.listToolsCalls).toBe(callsAfterConnect)
  }),
)

// ========================================================================
// Test: failing connection sets status to "failed"
// ========================================================================

test(
  "failing builtin server connection sets status to failed",
  withInstance(
    {
      "builtin-cli-mcp": {
        type: "local",
        command: ["node", "path/to/gal-cli-mcp/dist/index.js"],
      },
    },
    async () => {
      await MCP.status()

      lastCreatedClientName = "builtin-cli-mcp"
      getOrCreateClientState("builtin-cli-mcp")
      connectShouldFail = true
      connectError = "spawn node ENOENT"

      await MCP.add("builtin-cli-mcp", {
        type: "local",
        command: ["node", "path/to/gal-cli-mcp/dist/index.js"],
      })

      const status = await MCP.status()
      expect(status["builtin-cli-mcp"]?.status).toBe("failed")
      if (status["builtin-cli-mcp"]?.status === "failed") {
        expect(status["builtin-cli-mcp"].error).toContain("ENOENT")
      }

      // No tools from failed server should appear
      const tools = await MCP.tools()
      const keys = Object.keys(tools).filter((k) => k.startsWith("builtin-cli-mcp"))
      expect(keys.length).toBe(0)
    },
  ),
)

// ========================================================================
// Test: transports are closed on connection failure
// ========================================================================

test(
  "transports are closed when builtin server fails to connect",
  withInstance({}, async () => {
    await MCP.status()

    lastCreatedClientName = "builtin-cli-mcp"
    getOrCreateClientState("builtin-cli-mcp")
    connectShouldFail = true
    connectError = "spawn node ENOENT"

    await MCP.add("builtin-cli-mcp", {
      type: "local",
      command: ["node", "path/to/gal-cli-mcp/dist/index.js"],
    })

    // Transport must be closed to avoid orphaned child process
    expect(transportCloseCount).toBeGreaterThanOrEqual(1)
  }),
)

// ========================================================================
// Test: transport close on timeout
// ========================================================================

test(
  "builtin server transport is closed when connect times out",
  withInstance({}, async () => {
    // Trigger lazy MCP state init first so builtins don't hang
    await MCP.status()

    lastCreatedClientName = "builtin-hanging"
    getOrCreateClientState("builtin-hanging")
    connectShouldHang = true

    const addResult = await MCP.add("builtin-hanging", {
      type: "local",
      command: ["node", "path/to/gal-cli-mcp/dist/index.js"],
      timeout: 100,
    })

    const serverStatus = (addResult.status as any)["builtin-hanging"] ?? addResult.status
    expect(serverStatus.status).toBe("failed")
    expect(serverStatus.error).toContain("timed out")
    // Transport must be closed to avoid orphaned child process
    expect(transportCloseCount).toBeGreaterThanOrEqual(1)
  }),
)

// ========================================================================
// Test: builtins connect independently — one failure does not break others
// ========================================================================

test(
  "builtin servers connect independently — one failure does not break others",
  withInstance(
    {
      "builtin-cli-mcp": {
        type: "local",
        command: ["node", "path/to/gal-cli-mcp/dist/index.js"],
      },
      "builtin-extra": {
        type: "local",
        command: ["echo", "test"],
      },
    },
    async () => {
      await MCP.status()

      // Set up cli-mcp server (fails)
      const cliState = getOrCreateClientState("builtin-cli-mcp")
      connectShouldFail = true
      connectError = "Cannot find gal-cli-mcp"

      lastCreatedClientName = "builtin-cli-mcp"
      await MCP.add("builtin-cli-mcp", {
        type: "local",
        command: ["node", "path/to/gal-cli-mcp/dist/index.js"],
      })

      // Reset failure flag for the extra server
      connectShouldFail = false
      lastCreatedClientName = "builtin-extra"
      const extraState = getOrCreateClientState("builtin-extra")
      extraState.tools = [{ name: "extra_tool", description: "Extra", inputSchema: { type: "object", properties: {} } }]

      await MCP.add("builtin-extra", {
        type: "local",
        command: ["echo", "test"],
      })

      const status = await MCP.status()
      expect(status["builtin-cli-mcp"]?.status).toBe("failed")
      expect(status["builtin-extra"]?.status).toBe("connected")

      // Extra server tools should still be available
      const tools = await MCP.tools()
      const keys = Object.keys(tools)
      expect(keys.some((k) => k.includes("extra_tool"))).toBe(true)
    },
  ),
)

// ========================================================================
// Test: disconnect then reconnect builtin server
// ========================================================================

test(
  "disconnect then reconnect builtin server restores tools",
  withInstance(
    {
      "builtin-cli-mcp": {
        type: "local",
        command: ["node", "path/to/gal-cli-mcp/dist/index.js"],
      },
    },
    async () => {
      await MCP.status()

      lastCreatedClientName = "builtin-cli-mcp"
      const state = getOrCreateClientState("builtin-cli-mcp")
      state.tools = builtinTools

      await MCP.add("builtin-cli-mcp", {
        type: "local",
        command: ["node", "path/to/gal-cli-mcp/dist/index.js"],
      })

      expect((await MCP.status())["builtin-cli-mcp"]?.status).toBe("connected")

      await MCP.disconnect("builtin-cli-mcp")
      expect((await MCP.status())["builtin-cli-mcp"]?.status).toBe("disabled")

      const toolsAfterDisconnect = await MCP.toolsForServer("builtin-cli-mcp")
      expect(toolsAfterDisconnect).toEqual([])

      // Reconnect
      await MCP.connect("builtin-cli-mcp")
      expect((await MCP.status())["builtin-cli-mcp"]?.status).toBe("connected")

      const toolsAfterReconnect = await MCP.toolsForServer("builtin-cli-mcp")
      expect(toolsAfterReconnect.length).toBe(builtinTools.length)
    },
  ),
)

// ========================================================================
// Test: tool change notification refreshes builtin tool cache
// ========================================================================

test(
  "tool change notification refreshes builtin server tool cache",
  withInstance({}, async () => {
    await MCP.status()

    lastCreatedClientName = "builtin-cli-mcp"
    const state = getOrCreateClientState("builtin-cli-mcp")
    state.tools = builtinTools

    await MCP.add("builtin-cli-mcp", {
      type: "local",
      command: ["node", "path/to/gal-cli-mcp/dist/index.js"],
    })

    const before = await MCP.tools()
    const beforeKeys = Object.keys(before).filter((k) => k.startsWith("builtin-cli-mcp"))
    expect(beforeKeys.length).toBe(builtinTools.length)

    // Simulate tool list change
    state.tools = [
      { name: "gal_swarm_run", description: "Updated", inputSchema: { type: "object", properties: {} } },
      { name: "gal_new_tool", description: "New tool added", inputSchema: { type: "object", properties: {} } },
    ]

    const handler = Array.from(state.notificationHandlers.values())[0]
    expect(handler).toBeDefined()
    await handler?.()

    const after = await MCP.tools()
    const afterKeys = Object.keys(after).filter((k) => k.startsWith("builtin-cli-mcp"))
    expect(afterKeys.some((k) => k.includes("gal_new_tool"))).toBe(true)
    expect(afterKeys.some((k) => k.includes("gal_dispatch_agent"))).toBe(false)
  }),
)
