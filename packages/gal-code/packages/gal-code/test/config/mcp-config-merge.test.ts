import { describe, expect, test } from "bun:test"
import { existsSync } from "fs"
import path from "path"

const ROOT =
  process.env.GAL_CODE_WORKSPACE_ROOT ||
  process.env.GAL_DEV_WORKSPACE_ROOT ||
  process.env.GITHUB_WORKSPACE ||
  `${process.env.HOME}/gal-run`

describe("MCP config — no broken 'gal' command references", () => {
  test(".mcp.json does not use 'gal' as command", () => {
    const mcpPath = path.join(ROOT, "gal-code", ".mcp.json")
    if (!existsSync(mcpPath)) {
      // Nothing to test
      return
    }
    const config = JSON.parse(require("fs").readFileSync(mcpPath, "utf-8"))
    const servers = config.mcpServers || {}

    for (const [name, server] of Object.entries(servers) as any) {
      if (server.command) {
        expect(server.command).not.toBe("gal")

        // Verify the command actually exists in PATH
        if (server.command === "node") {
          expect(existsSync("/opt/homebrew/bin/node") || existsSync("/usr/local/bin/node")).toBe(true)
        }

        // Verify args paths exist
        if (Array.isArray(server.args)) {
          for (const arg of server.args) {
            if (arg.endsWith(".js") && !arg.includes("*")) {
              // Absolute paths should exist
              if (arg.startsWith("/")) {
                // Skip variable placeholders
                if (!arg.includes("$ROOT")) {
                  expect(existsSync(arg)).toBe(true)
                }
              }
            }
          }
        }
      }
    }
  })

  test("gal-vision uses node command in .mcp.json", () => {
    const mcpPath = path.join(ROOT, "gal-code", ".mcp.json")
    if (!existsSync(mcpPath)) return

    const config = JSON.parse(require("fs").readFileSync(mcpPath, "utf-8"))
    const servers = config.mcpServers || {}

    const vision = (servers as any)["gal-vision"]
    if (vision) {
      expect(vision.command || vision.type).toBeTruthy()
      if (vision.command) {
        expect(vision.command).toBe("node")
      }
    }
  })

  test("gal-terminal-use uses node command in .mcp.json", () => {
    const mcpPath = path.join(ROOT, "gal-code", ".mcp.json")
    if (!existsSync(mcpPath)) return

    const config = JSON.parse(require("fs").readFileSync(mcpPath, "utf-8"))
    const servers = config.mcpServers || {}

    const cli = (servers as any)["gal-terminal-use"]
    if (cli) {
      expect(cli.command).toBe("node")
      expect(cli.args.some((a: string) => a.includes("gal-terminal-use-mcp"))).toBe(true)
    }
  })

  test("gal-ide-use uses node command in .mcp.json", () => {
    const mcpPath = path.join(ROOT, "gal-code", ".mcp.json")
    if (!existsSync(mcpPath)) return

    const config = JSON.parse(require("fs").readFileSync(mcpPath, "utf-8"))
    const servers = config.mcpServers || {}

    const vscode = (servers as any)["gal-ide-use"]
    if (vscode) {
      expect(vscode.command).toBe("node")
      expect(vscode.args.some((a: string) => a.includes("gal-ide-use-mcp"))).toBe(true)
    }
  })

  test("gal-browser-use uses node command in .mcp.json", () => {
    const mcpPath = path.join(ROOT, "gal-code", ".mcp.json")
    if (!existsSync(mcpPath)) return

    const config = JSON.parse(require("fs").readFileSync(mcpPath, "utf-8"))
    const servers = config.mcpServers || {}

    const chrome = (servers as any)["gal-browser-use"]
    if (chrome) {
      expect(chrome.command).toBe("node")
      expect(chrome.args.some((a: string) => a.includes("gal-browser-use-mcp"))).toBe(true)
    }
  })

  test("browser entries use node not gal", () => {
    const mcpPath = path.join(ROOT, "gal-code", ".mcp.json")
    if (!existsSync(mcpPath)) return

    const config = JSON.parse(require("fs").readFileSync(mcpPath, "utf-8"))
    const servers = config.mcpServers || {}

    for (const name of ["browser-slack", "gal-browser"]) {
      const server = (servers as any)[name]
      if (server?.command) {
        expect(server.command).not.toBe("gal")
        expect(server.command).toBe("node")
      }
    }
  })

  test("workspace root is a valid directory", () => {
    expect(existsSync(ROOT)).toBe(true)
  })
})

describe("MCP user config", () => {
  test("~/.mcp.json gal-video uses node", () => {
    const mcpPath = require("os").homedir() + "/.mcp.json"
    if (!existsSync(mcpPath)) return

    const config = JSON.parse(require("fs").readFileSync(mcpPath, "utf-8"))
    const servers = config.mcpServers || {}

    const video = (servers as any)["gal-video"]
    if (video) {
      expect(video.command).toBe("node")
    }
  })
})
