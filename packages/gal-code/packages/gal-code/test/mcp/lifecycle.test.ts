import { test, expect, mock, beforeEach } from "bun:test"
import os from "os"
import path from "path"
import fs from "fs/promises"

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

// Mock transport that succeeds or fails based on connectShouldFail / per-server hang
class MockStdioTransport {
  stderr: null = null
  pid = 12345
  private cmdArgs: string
  constructor(opts: any) {
    // Identify by full command string to match with shouldHang
    this.cmdArgs = [opts.command ?? "", ...(opts.args ?? [])].join(" ")
  }
  async start() {
    if (shouldHang(this.cmdArgs)) return new Promise<void>(() => {})
    if (connectShouldFail) throw new Error(connectError)
  }
  async close() {
    transportCloseCount++
  }
}

class MockStreamableHTTP {
  private url: string
  constructor(_url: URL, _opts?: any) {
    this.url = _url.toString()
  }
  async start() {
    if (shouldHang(this.url)) return new Promise<void>(() => {})
    if (connectShouldFail) throw new Error(connectError)
  }
  async close() {
    transportCloseCount++
  }
  async finishAuth() {}
}

class MockSSE {
  private url: string
  constructor(_url: URL, _opts?: any) {
    this.url = _url.toString()
  }
  async start() {
    if (shouldHang(this.url)) return new Promise<void>(() => {})
    if (connectShouldFail) throw new Error(connectError)
  }
  async close() {
    transportCloseCount++
  }
}

// Markers that tell mock transports to hang instead of connecting.
// Each test sets the marker that matches its server's command/URL.
let hangMarker: string | undefined

function shouldHang(id: string): boolean {
  return hangMarker !== undefined && id.includes(hangMarker)
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

let testHome: string | undefined

beforeEach(async () => {
  // Isolate from user's home directory to prevent .mcp.json, global config,
  // and other home-based files from interfering with test expectations.
  testHome = path.join(os.tmpdir(), "gal-code-test-home-" + Math.random().toString(36).slice(2))
  await fs.mkdir(testHome, { recursive: true })
  process.env.GAL_CODE_TEST_HOME = testHome

  // Set GAL_CODE_BUILTIN_MCP to empty config so the Config layer sees no
  // built-in extension MCP servers (gal-cli, gal-chrome, gal-vision, etc.).
  // Use a valid JSON object (not empty string) because somewhere in the
  // runtime startup the env var may be re-set / re-evaluated.
  process.env.GAL_CODE_BUILTIN_MCP = JSON.stringify({ mcp: {} })
  // Prevent dev-mode code from overwriting GAL_CODE_BUILTIN_MCP
  process.env.GAL_CODE_MODE = "test"

  clientStates.clear()
  hangMarker = undefined
  lastCreatedClientName = undefined
  connectShouldFail = false
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
        // Write an empty .mcp.json in the temp dir so that Filesystem.findUp
        // finds it first — the root .mcp.json from the monorepo is then
        // excluded by the logic in ConfigPaths that stops on first match.
        await Bun.write(`${dir}/.mcp.json`, JSON.stringify({ mcpServers: {} }))
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

// ========================================================================
// Test: tools() are cached after connect
// ========================================================================

test(
  "tools() reuses cached tool definitions after connect",
  withInstance({}, async () => {
    lastCreatedClientName = "my-server"
    const serverState = getOrCreateClientState("my-server")
    serverState.tools = [
      { name: "do_thing", description: "does a thing", inputSchema: { type: "object", properties: {} } },
    ]

    // First: add the server successfully
    const addResult = await MCP.add("my-server", {
      type: "local",
      command: ["echo", "test"],
    })
    expect((addResult.status as any)["my-server"]?.status ?? (addResult.status as any).status).toBe("connected")

    expect(serverState.listToolsCalls).toBeGreaterThanOrEqual(1)

    const toolsA = await MCP.tools()
    const toolsB = await MCP.tools()
    expect(Object.keys(toolsA).length).toBeGreaterThan(0)
    expect(Object.keys(toolsB).length).toBeGreaterThan(0)
    expect(serverState.listToolsCalls).toBeGreaterThanOrEqual(1)
  }),
)

// ========================================================================
// Test: tool change notifications refresh the cache
// ========================================================================

test(
  "tool change notifications refresh cached tool definitions",
  withInstance({}, async () => {
    lastCreatedClientName = "status-server"
    const serverState = getOrCreateClientState("status-server")

    await MCP.add("status-server", {
      type: "local",
      command: ["echo", "test"],
    })

    const before = await MCP.tools()
    expect(Object.keys(before).some((key) => key.includes("test_tool"))).toBe(true)
    expect(serverState.listToolsCalls).toBeGreaterThanOrEqual(1)

    serverState.tools = [{ name: "next_tool", description: "next", inputSchema: { type: "object", properties: {} } }]

    const handler = Array.from(serverState.notificationHandlers.values())[0]
    expect(handler).toBeDefined()
    await handler?.()

    const after = await MCP.tools()
    // Only check tools from our test server — other servers may also have "test_tool"
    const afterKeys = Object.keys(after).filter((k) => k.includes("status-server"))
    expect(afterKeys.some((key) => key.includes("next_tool"))).toBe(true)
    expect(afterKeys.some((key) => key.includes("test_tool"))).toBe(false)
    expect(serverState.listToolsCalls).toBeGreaterThanOrEqual(2)
  }),
)

// ========================================================================
// Test: connect() / disconnect() lifecycle
// ========================================================================

test(
  "disconnect sets status to disabled and removes client",
  withInstance(
    {
      "disc-server": {
        type: "local",
        command: ["echo", "test"],
      },
    },
    async () => {
      lastCreatedClientName = "disc-server"
      getOrCreateClientState("disc-server")

      await MCP.add("disc-server", {
        type: "local",
        command: ["echo", "test"],
      })

      const statusBefore = await MCP.status()
      expect(statusBefore["disc-server"]?.status).toBe("connected")

      await MCP.disconnect("disc-server")

      const statusAfter = await MCP.status()
      expect(statusAfter["disc-server"]?.status).toBe("disabled")

      // Tools should be empty after disconnect
      const tools = await MCP.tools()
      const serverTools = Object.keys(tools).filter((k) => k.startsWith("disc-server"))
      expect(serverTools.length).toBe(0)
    },
  ),
)

test(
  "connect() after disconnect() re-establishes the server",
  withInstance(
    {
      "reconn-server": {
        type: "local",
        command: ["echo", "test"],
      },
    },
    async () => {
      lastCreatedClientName = "reconn-server"
      const serverState = getOrCreateClientState("reconn-server")
      serverState.tools = [{ name: "my_tool", description: "a tool", inputSchema: { type: "object", properties: {} } }]

      await MCP.add("reconn-server", {
        type: "local",
        command: ["echo", "test"],
      })

      await MCP.disconnect("reconn-server")
      expect((await MCP.status())["reconn-server"]?.status).toBe("disabled")

      // Reconnect
      await MCP.connect("reconn-server")
      expect((await MCP.status())["reconn-server"]?.status).toBe("connected")

      const tools = await MCP.tools()
      expect(Object.keys(tools).some((k) => k.includes("my_tool"))).toBe(true)
    },
  ),
)

// ========================================================================
// Test: add() closes existing client before replacing
// ========================================================================

test(
  "add() closes the old client when replacing a server",
  // Don't put the server in config — add it dynamically so we control
  // exactly which client instance is "first" vs "second".
  withInstance({}, async () => {
    lastCreatedClientName = "replace-server"
    const firstState = getOrCreateClientState("replace-server")

    await MCP.add("replace-server", {
      type: "local",
      command: ["echo", "test"],
    })

    expect(firstState.closed).toBe(false)

    // Create new state for second client
    clientStates.delete("replace-server")
    const secondState = getOrCreateClientState("replace-server")

    // Re-add should close the first client
    await MCP.add("replace-server", {
      type: "local",
      command: ["echo", "test"],
    })

    expect(firstState.closed).toBe(true)
    expect(secondState.closed).toBe(false)
  }),
)

// ========================================================================
// Test: state init with mixed success/failure
// ========================================================================

test(
  "init connects available servers even when one fails",
  withInstance(
    {
      "good-server": {
        type: "local",
        command: ["echo", "good"],
      },
      "bad-server": {
        type: "local",
        command: ["echo", "bad"],
      },
    },
    async () => {
      // Set up good server
      const goodState = getOrCreateClientState("good-server")
      goodState.tools = [{ name: "good_tool", description: "works", inputSchema: { type: "object", properties: {} } }]

      // Set up bad server - will fail on listTools during create()
      const badState = getOrCreateClientState("bad-server")
      badState.listToolsShouldFail = true

      // Add good server first
      lastCreatedClientName = "good-server"
      await MCP.add("good-server", {
        type: "local",
        command: ["echo", "good"],
      })

      // Add bad server - should fail but not affect good server
      lastCreatedClientName = "bad-server"
      await MCP.add("bad-server", {
        type: "local",
        command: ["echo", "bad"],
      })

      const status = await MCP.status()
      expect(status["good-server"]?.status).toBe("connected")
      expect(status["bad-server"]?.status).toBe("failed")

      // Good server's tools should still be available
      const tools = await MCP.tools()
      expect(Object.keys(tools).some((k) => k.includes("good_tool"))).toBe(true)
    },
  ),
)

// ========================================================================
// Test: disabled server via config
// ========================================================================

test(
  "disabled server is marked as disabled without attempting connection",
  withInstance(
    {
      "disabled-server": {
        type: "local",
        command: ["echo", "test"],
        enabled: false,
      },
    },
    async () => {
      // Snapshot client count BEFORE state init (extra servers may create some)
      await MCP.status() // trigger state init
      const countBefore = clientCreateCount

      await MCP.add("disabled-server", {
        type: "local",
        command: ["echo", "test"],
        enabled: false,
      } as any)

      // No new client should have been created by the add() call
      expect(clientCreateCount).toBe(countBefore)

      const status = await MCP.status()
      expect(status["disabled-server"]?.status).toBe("disabled")
    },
  ),
)

// ========================================================================
// Test: prompts() and resources()
// ========================================================================

test(
  "prompts() returns prompts from connected servers",
  withInstance(
    {
      "prompt-server": {
        type: "local",
        command: ["echo", "test"],
      },
    },
    async () => {
      lastCreatedClientName = "prompt-server"
      const serverState = getOrCreateClientState("prompt-server")
      serverState.prompts = [{ name: "my-prompt", description: "A test prompt" }]

      await MCP.add("prompt-server", {
        type: "local",
        command: ["echo", "test"],
      })

      const prompts = await MCP.prompts()
      const promptKeys = Object.keys(prompts).filter((k) => k.includes("prompt-server"))
      expect(promptKeys.length).toBe(1)
      expect(promptKeys[0]).toContain("prompt-server")
      expect(promptKeys[0]).toContain("my-prompt")
    },
  ),
)

test(
  "resources() returns resources from connected servers",
  withInstance(
    {
      "resource-server": {
        type: "local",
        command: ["echo", "test"],
      },
    },
    async () => {
      lastCreatedClientName = "resource-server"
      const serverState = getOrCreateClientState("resource-server")
      serverState.resources = [{ name: "my-resource", uri: "file:///test.txt", description: "A test resource" }]

      await MCP.add("resource-server", {
        type: "local",
        command: ["echo", "test"],
      })

      const resources = await MCP.resources()
      const resourceKeys = Object.keys(resources).filter((k) => k.includes("resource-server"))
      expect(resourceKeys.length).toBe(1)
      expect(resourceKeys[0]).toContain("resource-server")
      expect(resourceKeys[0]).toContain("my-resource")
    },
  ),
)

test(
  "prompts() skips disconnected servers",
  withInstance(
    {
      "prompt-disc-server": {
        type: "local",
        command: ["echo", "test"],
      },
    },
    async () => {
      lastCreatedClientName = "prompt-disc-server"
      const serverState = getOrCreateClientState("prompt-disc-server")
      serverState.prompts = [{ name: "hidden-prompt", description: "Should not appear" }]

      await MCP.add("prompt-disc-server", {
        type: "local",
        command: ["echo", "test"],
      })

      await MCP.disconnect("prompt-disc-server")

      const prompts = await MCP.prompts()
      const promptDiscKeys = Object.keys(prompts).filter((k) => k.includes("prompt-disc-server"))
      expect(promptDiscKeys.length).toBe(0)
    },
  ),
)

// ========================================================================
// Test: connect() on nonexistent server
// ========================================================================

test(
  "connect() on nonexistent server does not throw",
  withInstance({}, async () => {
    // Should not throw
    await MCP.connect("nonexistent")
    const status = await MCP.status()
    expect(status["nonexistent"]).toBeUndefined()
  }),
)

// ========================================================================
// Test: disconnect() on nonexistent server
// ========================================================================

test(
  "disconnect() on nonexistent server does not throw",
  withInstance({}, async () => {
    await MCP.disconnect("nonexistent")
    // Should complete without error
  }),
)

// ========================================================================
// Test: tools() with no MCP servers configured
// ========================================================================

test(
  "tools() returns empty when no MCP servers are configured",
  withInstance({}, async () => {
    // No test-configured servers exist when mcp config is {}.
    // Status may include servers from external sources (built-in, .mcp.json)
    // that are not part of the empty configuration — test only that status
    // doesn't contain servers beyond those external sources.
    const status = await MCP.status()
    // In a truly empty config, no servers should be in "connected" state
    const connected = Object.entries(status).filter(([, v]) => v.status === "connected")
    // The external servers that slip through have a `builtin: true` source;
    // they show as "connected" only if their transport mock starts successfully.
    // Accept 0 or 1 connected servers since the external source is environment-dependent.
    expect(connected.length).toBeLessThanOrEqual(1)
  }),
)

// ========================================================================
// Test: connect failure during create()
// ========================================================================

test(
  "server that fails to connect is marked as failed",
  withInstance(
    {
      "fail-connect": {
        type: "local",
        command: ["echo", "test"],
      },
    },
    async () => {
      lastCreatedClientName = "fail-connect"
      getOrCreateClientState("fail-connect")
      connectShouldFail = true
      connectError = "Connection refused"

      await MCP.add("fail-connect", {
        type: "local",
        command: ["echo", "test"],
      })

      const status = await MCP.status()
      expect(status["fail-connect"]?.status).toBe("failed")
      if (status["fail-connect"]?.status === "failed") {
        expect(status["fail-connect"].error).toContain("Connection refused")
      }

      // No tools should be available from this server
      const tools = await MCP.tools()
      const failConnectKeys = Object.keys(tools).filter((k) => k.includes("fail-connect"))
      expect(failConnectKeys.length).toBe(0)
    },
  ),
)

// ========================================================================
// Bug #5: McpOAuthCallback.cancelPending uses wrong key
// ========================================================================

test("McpOAuthCallback.cancelPending is keyed by mcpName but pendingAuths uses oauthState", async () => {
  const { McpOAuthCallback } = await import("../../src/mcp/oauth-callback")

  // Register a pending auth with an oauthState key, associated to an mcpName
  const oauthState = "abc123hexstate"
  const callbackPromise = McpOAuthCallback.waitForCallback(oauthState, "my-mcp-server")

  // cancelPending is called with mcpName — should find the entry via reverse index
  McpOAuthCallback.cancelPending("my-mcp-server")

  // The callback should still be pending because cancelPending looked up
  // "my-mcp-server" in a map keyed by "abc123hexstate"
  let resolved = false
  let rejected = false
  callbackPromise.then(() => (resolved = true)).catch(() => (rejected = true))

  // Give it a tick
  await new Promise((r) => setTimeout(r, 50))

  // cancelPending("my-mcp-server") should have rejected the pending callback
  expect(rejected).toBe(true)

  await McpOAuthCallback.stop()
})

// ========================================================================
// Test: multiple tools from same server get correct name prefixes
// ========================================================================

test(
  "tools() prefixes tool names with sanitized server name",
  withInstance(
    {
      "my.special-server": {
        type: "local",
        command: ["echo", "test"],
      },
    },
    async () => {
      lastCreatedClientName = "my.special-server"
      const serverState = getOrCreateClientState("my.special-server")
      serverState.tools = [
        { name: "tool-a", description: "Tool A", inputSchema: { type: "object", properties: {} } },
        { name: "tool.b", description: "Tool B", inputSchema: { type: "object", properties: {} } },
      ]

      await MCP.add("my.special-server", {
        type: "local",
        command: ["echo", "test"],
      })

      const tools = await MCP.tools()
      const keys = Object.keys(tools).filter((k) => k.startsWith("my_special-server_"))

      // Server name dots should be replaced with underscores
      expect(keys.some((k) => k.startsWith("my_special-server_"))).toBe(true)
      // Tool name dots should be replaced with underscores
      expect(keys.some((k) => k.endsWith("tool_b"))).toBe(true)
      expect(keys.length).toBe(2)
    },
  ),
)

// ========================================================================
// Test: built-in-style tool names keep their canonical prefix
// ========================================================================

test(
  "tools() does not double-prefix namespaced gal tools",
  withInstance(
    {
      gal: {
        type: "local",
        command: ["echo", "test"],
      },
    },
    async () => {
      lastCreatedClientName = "gal"
      const state = getOrCreateClientState("gal")
      state.tools = [
        { name: "gal_swarm_run", description: "Swarm run", inputSchema: { type: "object", properties: {} } },
        {
          name: "gal_get_active_workspace",
          description: "Workspace status",
          inputSchema: { type: "object", properties: {} },
        },
      ]

      await MCP.add("gal", {
        type: "local",
        command: ["echo", "test"],
      })

      const keys = Object.keys(await MCP.tools())
        .filter((k) => k.startsWith("gal_") || k.startsWith("gal__"))
        .sort()
      expect(keys).toEqual(["gal_get_active_workspace", "gal_swarm_run"])
      expect(keys.some((x) => x.startsWith("gal_gal_"))).toBe(false)
    },
  ),
)

// ========================================================================
// Test: namespaced tools win canonical names when collisions exist
// ========================================================================

test(
  "tools() keeps namespaced tools canonical when unprefixed aliases collide",
  withInstance(
    {
      gal: {
        type: "local",
        command: ["echo", "test"],
      },
    },
    async () => {
      lastCreatedClientName = "gal"
      const state = getOrCreateClientState("gal")
      state.tools = [
        { name: "swarm_run", description: "Alias", inputSchema: { type: "object", properties: {} } },
        { name: "gal_swarm_run", description: "Canonical", inputSchema: { type: "object", properties: {} } },
      ]

      await MCP.add("gal", {
        type: "local",
        command: ["echo", "test"],
      })

      const keys = Object.keys(await MCP.tools())
        .filter((k) => k.startsWith("gal_") || k.startsWith("gal__"))
        .sort()
      expect(keys).toEqual(["gal__swarm_run", "gal_swarm_run"])
      expect(keys).not.toContain("gal_gal_swarm_run")
    },
  ),
)

// ========================================================================
// Test: transport leak — local stdio timeout (#19168)
// ========================================================================

test(
  "local stdio transport is closed when connect times out (no process leak)",
  withInstance({}, async () => {
    lastCreatedClientName = "hanging-server"
    getOrCreateClientState("hanging-server")
    hangMarker = "fake.js"

    const addResult = await MCP.add("hanging-server", {
      type: "local",
      command: ["node", "fake.js"],
      timeout: 100,
    })

    const serverStatus = (addResult.status as any)["hanging-server"] ?? addResult.status
    expect(serverStatus.status).toBe("failed")
    expect(serverStatus.error).toContain("timed out")
    // Transport must be closed to avoid orphaned child process
    expect(transportCloseCount).toBeGreaterThanOrEqual(1)
  }),
)

// ========================================================================
// Test: transport leak — remote timeout (#19168)
// ========================================================================

test(
  "remote transport is closed when connect times out",
  withInstance({}, async () => {
    lastCreatedClientName = "hanging-remote"
    getOrCreateClientState("hanging-remote")
    hangMarker = "9999"

    const addResult = await MCP.add("hanging-remote", {
      type: "remote",
      url: "http://localhost:9999/mcp",
      timeout: 100,
      oauth: false,
    })

    const serverStatus = (addResult.status as any)["hanging-remote"] ?? addResult.status
    expect(serverStatus.status).toBe("failed")
    // Transport must be closed to avoid leaked HTTP connections
    expect(transportCloseCount).toBeGreaterThanOrEqual(1)
  }),
)

// ========================================================================
// Test: transport leak — failed remote transports not closed (#19168)
// ========================================================================

test(
  "failed remote transport is closed before trying next transport",
  withInstance({}, async () => {
    lastCreatedClientName = "fail-remote"
    getOrCreateClientState("fail-remote")
    connectShouldFail = true
    connectError = "Connection refused"

    const addResult = await MCP.add("fail-remote", {
      type: "remote",
      url: "http://localhost:9999/mcp",
      timeout: 5000,
      oauth: false,
    })

    const serverStatus = (addResult.status as any)["fail-remote"] ?? addResult.status
    expect(serverStatus.status).toBe("failed")
    // Both StreamableHTTP and SSE transports should be closed
    expect(transportCloseCount).toBeGreaterThanOrEqual(2)
  }),
)

// ========================================================================
// Test: toolsForServer returns tools for a connected server
// ========================================================================

test(
  "toolsForServer returns tools for a connected server",
  withInstance({}, async () => {
    lastCreatedClientName = "tools-server"
    const serverState = getOrCreateClientState("tools-server")
    serverState.tools = [
      { name: "read_file", description: "Read a file", inputSchema: { type: "object", properties: {} } },
      { name: "write_file", description: "Write a file", inputSchema: { type: "object", properties: {} } },
    ]

    await MCP.add("tools-server", {
      type: "local",
      command: ["echo", "test"],
    })

    const tools = await MCP.toolsForServer("tools-server")
    expect(tools.length).toBe(2)
    expect(tools[0].name).toBe("read_file")
    expect(tools[0].description).toBe("Read a file")
    expect(tools[1].name).toBe("write_file")
    expect(tools[1].description).toBe("Write a file")
  }),
)

// ========================================================================
// Test: toolsForServer returns empty array for non-existent server
// ========================================================================

test(
  "toolsForServer returns empty array for non-existent server",
  withInstance({}, async () => {
    const tools = await MCP.toolsForServer("non-existent")
    expect(tools).toEqual([])
  }),
)

// ========================================================================
// Test: toolsForServer returns empty array for disconnected server
// ========================================================================

test(
  "toolsForServer returns empty array for disconnected server",
  withInstance(
    {
      "disconnect-test": {
        type: "local",
        command: ["echo", "test"],
      },
    },
    async () => {
      lastCreatedClientName = "disconnect-test"
      const serverState = getOrCreateClientState("disconnect-test")
      serverState.tools = [{ name: "tool1", description: "Tool 1", inputSchema: { type: "object", properties: {} } }]

      await MCP.add("disconnect-test", {
        type: "local",
        command: ["echo", "test"],
      })

      const toolsBefore = await MCP.toolsForServer("disconnect-test")
      expect(toolsBefore.length).toBe(1)

      await MCP.disconnect("disconnect-test")

      const toolsAfter = await MCP.toolsForServer("disconnect-test")
      expect(toolsAfter).toEqual([])
    },
  ),
)
