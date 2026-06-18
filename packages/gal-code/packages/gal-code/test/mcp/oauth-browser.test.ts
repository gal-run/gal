import { test, expect, mock, beforeEach } from "bun:test"
import { EventEmitter } from "events"

// Track open() calls and control failure behavior
let openShouldFail = false
let openCalledWith: string | undefined
const budget = process.platform === "win32" ? 10_000 : 4_000

function pause(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function event<T>() {
  let done!: (value: T) => void
  const promise = new Promise<T>((resolve) => {
    done = resolve
  })
  return { done, promise }
}

async function wait<T>(promise: Promise<T>, message: string) {
  return await Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error(message)), budget)),
  ])
}

async function until(fn: () => boolean, message: string) {
  const start = Date.now()
  while (Date.now() - start < budget) {
    if (fn()) return
    await pause(25)
  }
  throw new Error(message)
}

mock.module("open", () => ({
  default: async (url: string) => {
    openCalledWith = url

    // Return a mock subprocess that emits an error if openShouldFail is true
    const subprocess = new EventEmitter()
    if (openShouldFail) {
      // Emit error asynchronously like a real subprocess would
      setTimeout(() => {
        subprocess.emit("error", new Error("spawn xdg-open ENOENT"))
      }, 10)
    }
    return subprocess
  },
}))

// Mock UnauthorizedError
class MockUnauthorizedError extends Error {
  constructor() {
    super("Unauthorized")
    this.name = "UnauthorizedError"
  }
}

// Track what options were passed to each transport constructor
const transportCalls: Array<{
  type: "streamable" | "sse"
  url: string
  options: { authProvider?: unknown }
}> = []

// Mock the transport constructors
mock.module("@modelcontextprotocol/sdk/client/streamableHttp.js", () => ({
  StreamableHTTPClientTransport: class MockStreamableHTTP {
    url: string
    authProvider: { redirectToAuthorization?: (url: URL) => Promise<void> } | undefined
    constructor(url: URL, options?: { authProvider?: { redirectToAuthorization?: (url: URL) => Promise<void> } }) {
      this.url = url.toString()
      this.authProvider = options?.authProvider
      transportCalls.push({
        type: "streamable",
        url: url.toString(),
        options: options ?? {},
      })
    }
    async start() {
      // Simulate OAuth redirect by calling the authProvider's redirectToAuthorization
      if (this.authProvider?.redirectToAuthorization) {
        await this.authProvider.redirectToAuthorization(new URL("https://auth.example.com/authorize?client_id=test"))
      }
      throw new MockUnauthorizedError()
    }
    async finishAuth(_code: string) {
      // Mock successful auth completion
    }
  },
}))

mock.module("@modelcontextprotocol/sdk/client/sse.js", () => ({
  SSEClientTransport: class MockSSE {
    constructor(url: URL) {
      transportCalls.push({
        type: "sse",
        url: url.toString(),
        options: {},
      })
    }
    async start() {
      throw new Error("Mock SSE transport cannot connect")
    }
  },
}))

// Mock the MCP SDK Client to trigger OAuth flow
mock.module("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class MockClient {
    async connect(transport: { start: () => Promise<void> }) {
      await transport.start()
    }
  },
}))

// Mock UnauthorizedError in the auth module
mock.module("@modelcontextprotocol/sdk/client/auth.js", () => ({
  UnauthorizedError: MockUnauthorizedError,
}))

beforeEach(() => {
  openShouldFail = false
  openCalledWith = undefined
  transportCalls.length = 0
})

// Import modules after mocking
const { MCP } = await import("../../src/mcp/index")
const { Bus } = await import("../../src/bus")
const { McpOAuthCallback } = await import("../../src/mcp/oauth-callback")
const { Instance } = await import("../../src/project/instance")
const { tmpdir } = await import("../fixture/fixture")

test("BrowserOpenFailed event is published when open() throws", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        `${dir}/gal-code.json`,
        JSON.stringify({
          $schema: "https://gal.run/config.json",
          mcp: {
            "test-oauth-server": {
              type: "remote",
              url: "https://example.com/mcp",
            },
          },
        }),
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      openShouldFail = true

      const seen = event<{ mcpName: string; url: string }>()
      const unsubscribe = Bus.subscribe(MCP.BrowserOpenFailed, (evt) => {
        seen.done(evt.properties)
      })

      // Attach a handler immediately so callback shutdown rejections
      // don't show up as unhandled between tests.
      const authPromise = MCP.authenticate("test-oauth-server").catch(() => undefined)

      try {
        const evt = await wait(seen.promise, "timed out waiting for browser open failure")

        // Stop the callback server and cancel pending auth after the OAuth flow is pending.
        await McpOAuthCallback.stop()
        await wait(authPromise, "timed out waiting for oauth authentication to cancel")

        // Verify the BrowserOpenFailed event was published
        expect(evt.mcpName).toBe("test-oauth-server")
        expect(evt.url).toContain("https://")
      } finally {
        unsubscribe()
        await McpOAuthCallback.stop()
      }
    },
  })
})

test("BrowserOpenFailed event is NOT published when open() succeeds", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        `${dir}/gal-code.json`,
        JSON.stringify({
          $schema: "https://gal.run/config.json",
          mcp: {
            "test-oauth-server-2": {
              type: "remote",
              url: "https://example.com/mcp",
            },
          },
        }),
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      openShouldFail = false

      const events: Array<{ mcpName: string; url: string }> = []
      const unsubscribe = Bus.subscribe(MCP.BrowserOpenFailed, (evt) => {
        events.push(evt.properties)
      })

      // Run authenticate with a timeout to avoid waiting forever for the callback
      const authPromise = MCP.authenticate("test-oauth-server-2").catch(() => undefined)

      try {
        await until(() => openCalledWith !== undefined, "timed out waiting for browser open")
        await pause(700)

        // Stop the callback server and cancel pending auth after the OAuth flow is pending.
        await McpOAuthCallback.stop()
        await wait(authPromise, "timed out waiting for oauth authentication to cancel")

        // Verify NO BrowserOpenFailed event was published
        expect(events.length).toBe(0)
        // Verify open() was still called
        expect(openCalledWith).toBeDefined()
      } finally {
        unsubscribe()
        await McpOAuthCallback.stop()
      }
    },
  })
})

test("open() is called with the authorization URL", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        `${dir}/gal-code.json`,
        JSON.stringify({
          $schema: "https://gal.run/config.json",
          mcp: {
            "test-oauth-server-3": {
              type: "remote",
              url: "https://example.com/mcp",
            },
          },
        }),
      )
    },
  })

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      openShouldFail = false
      openCalledWith = undefined

      // Run authenticate with a timeout to avoid waiting forever for the callback
      const authPromise = MCP.authenticate("test-oauth-server-3").catch(() => undefined)

      try {
        await until(() => openCalledWith !== undefined, "timed out waiting for browser open")
        await pause(700)

        // Stop the callback server and cancel pending auth after the OAuth flow is pending.
        await McpOAuthCallback.stop()
        await wait(authPromise, "timed out waiting for oauth authentication to cancel")

        // Verify open was called with a URL
        expect(openCalledWith).toBeDefined()
        expect(typeof openCalledWith).toBe("string")
        expect(openCalledWith!).toContain("https://")
      } finally {
        await McpOAuthCallback.stop()
      }
    },
  })
})
