/** @jsxImportSource @opentui/solid */
import { afterEach, describe, expect, test } from "bun:test"
import { testRender, useRenderer } from "@opentui/solid"
import type { ParentProps } from "solid-js"
import { ArgsProvider } from "../../../src/cli/cmd/tui/context/args"
import { ExitProvider } from "../../../src/cli/cmd/tui/context/exit"
import { ProjectProvider } from "../../../src/cli/cmd/tui/context/project"
import { SDKProvider } from "../../../src/cli/cmd/tui/context/sdk"
import { SyncProvider } from "../../../src/cli/cmd/tui/context/sync"
import { ThemeProvider, useTheme } from "../../../src/cli/cmd/tui/context/theme"
import { LocalProvider } from "../../../src/cli/cmd/tui/context/local"
import { KeybindProvider } from "../../../src/cli/cmd/tui/context/keybind"
import { RouteProvider } from "../../../src/cli/cmd/tui/context/route"
import { PromptRefProvider } from "../../../src/cli/cmd/tui/context/prompt"
import { TuiConfigProvider } from "../../../src/cli/cmd/tui/context/tui-config"
import { KVProvider } from "../../../src/cli/cmd/tui/context/kv"
import { PromptHistoryProvider } from "../../../src/cli/cmd/tui/component/prompt/history"
import { FrecencyProvider } from "../../../src/cli/cmd/tui/component/prompt/frecency"
import { PromptStashProvider } from "../../../src/cli/cmd/tui/component/prompt/stash"
import { CommandProvider } from "../../../src/cli/cmd/tui/component/dialog-command"
import { DialogProvider } from "../../../src/cli/cmd/tui/ui/dialog"
import { ToastProvider } from "../../../src/cli/cmd/tui/ui/toast"
import { Home } from "../../../src/cli/cmd/tui/routes/home"
import { setupSlots, type HostPluginApi } from "../../../src/cli/cmd/tui/plugin/slots"

const sighup = new Set(process.listeners("SIGHUP"))

afterEach(() => {
  for (const fn of process.listeners("SIGHUP")) {
    if (!sighup.has(fn)) process.off("SIGHUP", fn)
  }
})

const provider = {
  id: "test",
  name: "Test Provider",
  models: {
    "governance-large": {
      id: "governance-large",
      name: "Governance Large",
      capabilities: {
        reasoning: false,
      },
      limit: {
        context: 128000,
      },
    },
  },
}

const banned = ["OpenCode", "opencode", "Ask gal.run anything", "Run a command", "prompt rail", "chat shell"] as const

function json(data: unknown) {
  return new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json",
    },
  })
}

function fetcher(log: string[]) {
  return Object.assign(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const req = new Request(input, init)
      const url = new URL(req.url)
      log.push(`${req.method} ${url.pathname}`)

      if (url.pathname === "/config/providers") {
        return json({ providers: [provider], default: { test: "governance-large" } })
      }
      if (url.pathname === "/provider") {
        return json({ all: [provider], default: { test: "governance-large" }, connected: ["test"] })
      }
      if (url.pathname === "/experimental/console") {
        return json({})
      }
      if (url.pathname === "/agent") {
        return json([
          {
            name: "governance",
            mode: "primary",
            model: {
              providerID: "test",
              modelID: "governance-large",
            },
          },
        ])
      }
      if (url.pathname === "/config") {
        return json({ model: "test/governance-large", permission: { bash: "ask" } })
      }
      if (url.pathname === "/project/current") {
        return json({ id: "proj_governance" })
      }
      if (url.pathname === "/path") {
        return json({
          home: "/tmp",
          state: "/tmp/gal-code-tui-render-state",
          config: "/tmp/gal-code-tui-render-config",
          worktree: "/tmp/gal-code-governance-worktree",
          directory: "/tmp/gal-code-governance",
        })
      }
      if (url.pathname === "/experimental/session") {
        return json([])
      }
      if (url.pathname === "/command") {
        return json([{ name: "review" }, { name: "status" }])
      }
      if (url.pathname === "/lsp") {
        return json([{ id: "ts", root: "/tmp/gal-code-governance", status: "running" }])
      }
      if (url.pathname === "/mcp") {
        return json({
          github: { status: "connected" },
          sentry: { status: "failed", error: "missing token" },
        })
      }
      if (url.pathname === "/experimental/resource") {
        return json({})
      }
      if (url.pathname === "/formatter") {
        return json([])
      }
      if (url.pathname === "/session/status") {
        return json({})
      }
      if (/^\/session\/[^/]+\/governance\/runtime$/.test(url.pathname)) {
        return json({
          decisions: 3,
          blocked: 1,
          holds: 1,
          clears: 2,
          latest: {
            tool: "bash",
            mode: "block",
            blocked: true,
            decision: "hold_for_operator_review",
            confidence: 1,
            timestamp_ms: 1,
          },
        })
      }
      if (url.pathname === "/provider/auth") {
        return json({})
      }
      if (url.pathname === "/vcs") {
        return json({ branch: "worker/governance-tui" })
      }
      if (url.pathname === "/experimental/workspace") {
        return json([])
      }
      if (url.pathname === "/experimental/workspace/status") {
        return json([])
      }

      throw new Error(`unexpected request: ${req.method} ${url.pathname}`)
    },
    { preconnect: fetch.preconnect.bind(fetch) },
  ) satisfies typeof fetch
}

function App(props: { fetch: typeof fetch }) {
  return (
    <ArgsProvider continue={false}>
      <ExitProvider>
        <KVProvider>
          <ToastProvider>
            <RouteProvider>
              <TuiConfigProvider config={{}}>
                <SDKProvider
                  url="http://test"
                  directory="/tmp/gal-code-governance"
                  fetch={props.fetch}
                  events={{ subscribe: async () => () => {} }}
                >
                  <ProjectProvider>
                    <SyncProvider>
                      <ThemeProvider mode="dark">
                        <Slots>
                          <LocalProvider>
                            <KeybindProvider>
                              <PromptStashProvider>
                                <DialogProvider>
                                  <CommandProvider>
                                    <FrecencyProvider>
                                      <PromptHistoryProvider>
                                        <PromptRefProvider>
                                          <box width="100%" height="100%" flexDirection="column">
                                            <Home />
                                          </box>
                                        </PromptRefProvider>
                                      </PromptHistoryProvider>
                                    </FrecencyProvider>
                                  </CommandProvider>
                                </DialogProvider>
                              </PromptStashProvider>
                            </KeybindProvider>
                          </LocalProvider>
                        </Slots>
                      </ThemeProvider>
                    </SyncProvider>
                  </ProjectProvider>
                </SDKProvider>
              </TuiConfigProvider>
            </RouteProvider>
          </ToastProvider>
        </KVProvider>
      </ExitProvider>
    </ArgsProvider>
  )
}

function Slots(props: ParentProps) {
  setupSlots({ renderer: useRenderer(), theme: useTheme() } as unknown as HostPluginApi)
  return <>{props.children}</>
}

async function frame(size: { width: number; height: number }, ready: string) {
  const log: string[] = []
  const app = await testRender(() => <App fetch={fetcher(log)} />, size)
  const boot = ["/config", "/project/current", "/path", "/agent", "/mcp"]

  try {
    const start = Date.now()
    while (true) {
      await app.renderOnce()
      const text = app.captureCharFrame()
      if (text.includes(ready) && boot.every((path) => log.some((entry) => entry.endsWith(` ${path}`)))) {
        await app.renderOnce()
        return {
          app,
          text: app.captureCharFrame(),
          spans: app.captureSpans(),
          log,
        }
      }
      if (Date.now() - start > 2500) {
        throw new Error(`timed out waiting for ${ready}\nrequests:\n${log.join("\n")}\n\n${text}`)
      }
      await Bun.sleep(10)
    }
  } catch (err) {
    app.renderer.destroy()
    throw err
  }
}

function visible(frame: string) {
  return frame.replace(/\n/g, "").split("").filter((char) => char.trim() !== "").length
}

function rows(frame: string) {
  return frame.split("\n").map((line) => line.trimEnd())
}

function occupied(row: string) {
  return row.split("").filter((char) => char.trim() !== "").length
}

function rowStats(frame: string, cells: number) {
  const all = rows(frame)
  const used = all.map(occupied).filter((count) => count > 0)
  return {
    rows: used.length,
    max: Math.max(...used),
    density: visible(frame) / cells,
  }
}

function slice(frame: string, left: number, right: number, top: number, bottom: number) {
  return rows(frame)
    .slice(top, bottom)
    .map((line) => line.padEnd(right).slice(left, right))
    .join("\n")
}

function rejectLegacy(frame: string) {
  banned.forEach((term) => {
    expect(frame).not.toContain(term)
  })
}

function rejectMissingBoot(log: string[]) {
  expect(log).toContain("GET /config")
  expect(log).toContain("GET /project/current")
  expect(log).toContain("GET /path")
  expect(log).toContain("GET /agent")
  expect(log).toContain("GET /mcp")
}

describe("governance redesign render", () => {
  test("keeps compact 80x24 cockpit content visible", async () => {
    const shot = await frame({ width: 80, height: 24 }, "GAL governance")

    try {
      const stats = rowStats(shot.text, 80 * 24)

      expect(shot.spans.cols).toBe(80)
      expect(shot.spans.rows).toBe(24)
      rejectMissingBoot(shot.log)
      expect(shot.text).toContain("GAL governance")
      expect(shot.text).toContain("light agent board")
      expect(shot.text).toContain("evidence ledger")
      expect(shot.text).toContain("directive docket")
      expect(shot.text).toContain("GOVERNANCE DIRECTIVE")
      expect(shot.text).toContain("Directive target")
      expect(shot.text).not.toContain("The Governance Layer")
      expect(visible(shot.text) / (80 * 24)).toBeGreaterThan(0.08)
      expect(stats.rows, `compact occupied rows: ${JSON.stringify(stats)}`).toBeLessThanOrEqual(22)
      expect(stats.max, `compact max occupied row: ${JSON.stringify(stats)}`).toBeLessThanOrEqual(78)
      expect(stats.density, `compact density: ${JSON.stringify(stats)}`).toBeLessThan(0.55)
      expect(rows(shot.text).filter((line) => line.includes("directive docket"))).toHaveLength(1)
      rejectLegacy(shot.text)
    } finally {
      shot.app.renderer.destroy()
    }
  })

  test("renders the wide governance board instead of the compact deck", async () => {
    const shot = await frame({ width: 160, height: 40 }, "The Governance Layer")

    try {
      expect(shot.spans.cols).toBe(160)
      expect(shot.spans.rows).toBe(40)
      rejectMissingBoot(shot.log)
      expect(shot.text).toContain("The Governance Layer")
      expect(shot.text).toContain("policy aperture")
      expect(shot.text).toContain("agent autonomy")
      expect(shot.text).toContain("swarm scale")
      expect(shot.text).toContain("evidence ledger")
      expect(shot.text).toContain("directive docket")
      expect(shot.text).toContain("GOVERNANCE DIRECTIVE")
      expect(shot.text).not.toContain("light agent board")
      expect(visible(shot.text) / (160 * 40)).toBeGreaterThan(0.04)
      expect(visible(slice(shot.text, 80, 160, 0, 40)) / (80 * 40)).toBeGreaterThan(0.025)
      expect(visible(slice(shot.text, 0, 80, 0, 20))).toBeGreaterThan(50)
      expect(visible(slice(shot.text, 80, 160, 0, 20))).toBeGreaterThan(50)
      expect(visible(slice(shot.text, 0, 80, 20, 40))).toBeGreaterThan(50)
      expect(visible(slice(shot.text, 80, 160, 20, 40))).toBeGreaterThan(50)
      expect(rows(shot.text).filter((line) => line.includes("policy aperture"))).not.toHaveLength(0)
      expect(rows(shot.text).filter((line) => line.includes("GOVERNANCE DIRECTIVE"))).toHaveLength(1)
      rejectLegacy(shot.text)
    } finally {
      shot.app.renderer.destroy()
    }
  })
})
