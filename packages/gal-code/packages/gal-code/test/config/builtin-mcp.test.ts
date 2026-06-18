import { describe, expect, test } from "bun:test"
import { existsSync } from "fs"
import { mkdir } from "fs/promises"
import path from "path"
import { tmpdir } from "../fixture/fixture"
import { buildBuiltinMcp } from "../../src/bootstrap/builtin-mcp"
import { Config } from "../../src/config/config"
import { Global } from "../../src/global"
import { MCP } from "../../src/mcp"
import { Instance } from "../../src/project/instance"

function resolveIntegrationGalCliHome(): string | undefined {
  const candidates = [process.env.GAL_CLI_HOME, path.resolve(process.cwd(), "../../../gal-cli-local-dev-main")]

  return candidates.find((candidate): candidate is string => {
    if (!candidate) return false
    return existsSync(path.join(candidate, "dist", "index.cjs"))
  })
}

describe("built-in MCP bootstrap", () => {
  test("uses the local gal CLI for gal-vision in dev mode when GAL_CLI_HOME is present", async () => {
    await using tmp = await tmpdir()
    const cli = path.join(tmp.path, "gal-cli")
    await Bun.write(path.join(cli, "dist", "index.cjs"), "console.log('ok')\n")

    const cfg = buildBuiltinMcp(
      {
        GAL_CODE_MODE: "dev",
        GAL_CLI_HOME: cli,
        GEMINI_API_KEY: "test-key",
      },
      tmp.path,
    )

    expect(cfg.mcp["gal-vision"]).toBeDefined()
    expect(cfg.mcp["gal-vision"]?.type).toEqual("local")
  })

  test("falls back to the workspace dist entrypoint in dev mode when GAL_CLI_HOME is unset", async () => {
    await using tmp = await tmpdir()
    await Bun.write(path.join(tmp.path, "dist", "index.cjs"), "console.log('ok')\n")

    const cfg = buildBuiltinMcp(
      {
        GAL_CODE_MODE: "dev",
        GAL_CODE_WORKSPACE_ROOT: tmp.path,
        GEMINI_API_KEY: "test-key",
      },
      tmp.path,
    )

    expect(cfg.mcp["gal-vision"]).toBeDefined()
    expect(cfg.mcp["gal-vision"]?.type).toEqual("local")
  })

  test("falls back to gal on PATH outside dev mode", () => {
    const cfg = buildBuiltinMcp({}, "/tmp/project")
    expect(cfg.mcp["gal"]?.command).toEqual(["gal", "mcp", "server"])
    expect(cfg.mcp["gal"]?.timeout).toBe(120000)
    expect(cfg.mcp["gal-vision"]).toBeUndefined()
    expect(cfg.mcp["gal-voice"]).toBeUndefined()
  })

  test("includes gal-vision when GEMINI_API_KEY is set", () => {
    const cfg = buildBuiltinMcp({ GEMINI_API_KEY: "test-key" }, "/tmp/project")
    expect(cfg.mcp["gal-vision"]).toBeDefined()
    expect(cfg.mcp["gal-vision"]?.type).toEqual("local")
    expect(cfg.mcp["gal-vision"]?.builtin).toBe(true)
  })

  test("includes gal-voice when OPENAI_API_KEY is set", () => {
    const cfg = buildBuiltinMcp({ OPENAI_API_KEY: "test-key" }, "/tmp/project")
    expect(cfg.mcp["gal-voice"]).toBeDefined()
    expect(cfg.mcp["gal-voice"]?.type).toEqual("local")
    expect(cfg.mcp["gal-voice"]?.builtin).toBe(true)
  })

  test("excludes gal-voice when OPENAI_API_KEY is not set", () => {
    const cfg = buildBuiltinMcp({}, "/tmp/project")
    expect(cfg.mcp["gal-voice"]).toBeUndefined()
  })

  test("applies an extended startup timeout to the built-in gal MCP server", () => {
    const cfg = buildBuiltinMcp({}, "/tmp/project")
    expect(cfg.mcp["gal"]?.timeout).toBe(120000)
    expect(cfg.mcp["gal-terminal-use"]?.timeout).toBeUndefined()
    expect(cfg.mcp["gal-ide-use"]?.timeout).toBeUndefined()
    expect(cfg.mcp["gal-browser-use"]?.timeout).toBeUndefined()
  })

  const integrationGalCliHome = resolveIntegrationGalCliHome()
  ;(integrationGalCliHome ? test : test.skip)("connects gal-vision through the local gal CLI in dev mode", async () => {
    await using tmp = await tmpdir({ git: true })
    const originalCwd = process.cwd()
    const originalPaths = {
      data: Global.Path.data,
      cache: Global.Path.cache,
      config: Global.Path.config,
      state: Global.Path.state,
      log: Global.Path.log,
      bin: Global.Path.bin,
    }
    const originalEnv = {
      GAL_CODE_MODE: process.env.GAL_CODE_MODE,
      GAL_CLI_HOME: process.env.GAL_CLI_HOME,
      GEMINI_API_KEY: process.env.GEMINI_API_KEY,
      GAL_CODE_BUILTIN_MCP: process.env.GAL_CODE_BUILTIN_MCP,
      GAL_CODE_CONFIG_DIR: process.env.GAL_CODE_CONFIG_DIR,
    }
    const isolatedGlobalRoot = path.join(tmp.path, ".gal-code-test-global")
    const isolatedPaths = {
      data: path.join(isolatedGlobalRoot, "data"),
      cache: path.join(isolatedGlobalRoot, "cache"),
      config: path.join(isolatedGlobalRoot, "config"),
      state: path.join(isolatedGlobalRoot, "state"),
      log: path.join(isolatedGlobalRoot, "data", "log"),
      bin: path.join(isolatedGlobalRoot, "cache", "bin"),
    }

    try {
      await Promise.all(Object.values(isolatedPaths).map((dir) => mkdir(dir, { recursive: true })))

      Object.assign(Global.Path as Record<string, string>, isolatedPaths)
      process.chdir(tmp.path)
      process.env.GAL_CODE_MODE = "dev"
      process.env.GAL_CLI_HOME = integrationGalCliHome!
      process.env.GEMINI_API_KEY = "test-key"
      process.env.GAL_CODE_CONFIG_DIR = isolatedPaths.config
      process.env.GAL_CODE_BUILTIN_MCP = JSON.stringify(buildBuiltinMcp(process.env, tmp.path))

      await Config.invalidate(true)

      await Instance.provide({
        directory: tmp.path,
        async fn() {
          const status = await MCP.status()
          expect(status["gal-vision"]?.status).toBe("connected")

          const tools = await MCP.toolsForServer("gal-vision")
          expect(tools.length).toBeGreaterThan(0)
          expect(tools.some((tool) => tool.name === "image_analysis")).toBe(true)
        },
      })
    } finally {
      await Instance.disposeAll().catch(() => undefined)
      await Config.invalidate(true)
      process.chdir(originalCwd)
      Object.assign(Global.Path as Record<string, string>, originalPaths)

      for (const [key, value] of Object.entries(originalEnv)) {
        if (value === undefined) {
          delete process.env[key]
        } else {
          process.env[key] = value
        }
      }
    }
  })
})
