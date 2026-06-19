import { afterEach, describe, expect, test } from "bun:test"
import path from "path"
import fs from "fs/promises"
import { tmpdir } from "../fixture/fixture"
import { Instance } from "../../src/project/instance"
import { ToolRegistry } from "../../src/tool/registry"

afterEach(async () => {
  await Instance.disposeAll()
})

describe("tool.registry", () => {
  test("exposes scheduler tools unless cron is disabled", async () => {
    const prev = process.env.GAL_CODE_DISABLE_CRON
    await using enabled = await tmpdir()
    delete process.env.GAL_CODE_DISABLE_CRON
    await Instance.provide({
      directory: enabled.path,
      fn: async () => {
        const ids = await ToolRegistry.ids()
        expect(ids).toContain("cron_create")
        expect(ids).toContain("cron_list")
        expect(ids).toContain("cron_delete")
      },
    })

    await using disabled = await tmpdir()
    process.env.GAL_CODE_DISABLE_CRON = "1"
    await Instance.provide({
      directory: disabled.path,
      fn: async () => {
        const ids = await ToolRegistry.ids()
        expect(ids).not.toContain("cron_create")
        expect(ids).not.toContain("cron_list")
        expect(ids).not.toContain("cron_delete")
      },
    })

    if (prev === undefined) delete process.env.GAL_CODE_DISABLE_CRON
    else process.env.GAL_CODE_DISABLE_CRON = prev
  })

  test("loads tools from .gal/code/tool (singular)", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const galCodeDir = path.join(dir, ".gal/code")
        await fs.mkdir(galCodeDir, { recursive: true })

        const toolDir = path.join(galCodeDir, "tool")
        await fs.mkdir(toolDir, { recursive: true })

        await Bun.write(
          path.join(toolDir, "hello.ts"),
          [
            "export default {",
            "  description: 'hello tool',",
            "  args: {},",
            "  execute: async () => {",
            "    return 'hello world'",
            "  },",
            "}",
            "",
          ].join("\n"),
        )
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const ids = await ToolRegistry.ids()
        expect(ids).toContain("hello")
      },
    })
  })

  test("loads tools from .gal/code/tools (plural)", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const galCodeDir = path.join(dir, ".gal/code")
        await fs.mkdir(galCodeDir, { recursive: true })

        const toolsDir = path.join(galCodeDir, "tools")
        await fs.mkdir(toolsDir, { recursive: true })

        await Bun.write(
          path.join(toolsDir, "hello.ts"),
          [
            "export default {",
            "  description: 'hello tool',",
            "  args: {},",
            "  execute: async () => {",
            "    return 'hello world'",
            "  },",
            "}",
            "",
          ].join("\n"),
        )
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const ids = await ToolRegistry.ids()
        expect(ids).toContain("hello")
      },
    })
  })

  test("loads tools with external dependencies without crashing", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const galCodeDir = path.join(dir, ".gal/code")
        await fs.mkdir(galCodeDir, { recursive: true })

        const toolsDir = path.join(galCodeDir, "tools")
        await fs.mkdir(toolsDir, { recursive: true })

        await Bun.write(
          path.join(galCodeDir, "package.json"),
          JSON.stringify({
            name: "custom-tools",
            dependencies: {
              "@scheduler-systems/gal-code-plugin": "^0.0.0",
              cowsay: "^1.6.0",
            },
          }),
        )

        await Bun.write(
          path.join(galCodeDir, "package-lock.json"),
          JSON.stringify({
            name: "custom-tools",
            lockfileVersion: 3,
            packages: {
              "": {
                dependencies: {
                  "@scheduler-systems/gal-code-plugin": "^0.0.0",
                  cowsay: "^1.6.0",
                },
              },
            },
          }),
        )

        const cowsayDir = path.join(galCodeDir, "node_modules", "cowsay")
        await fs.mkdir(cowsayDir, { recursive: true })
        await Bun.write(
          path.join(cowsayDir, "package.json"),
          JSON.stringify({
            name: "cowsay",
            type: "module",
            exports: "./index.js",
          }),
        )
        await Bun.write(
          path.join(cowsayDir, "index.js"),
          ["export function say({ text }) {", "  return `moo ${text}`", "}", ""].join("\n"),
        )

        await Bun.write(
          path.join(toolsDir, "cowsay.ts"),
          [
            "import { say } from 'cowsay'",
            "export default {",
            "  description: 'tool that imports cowsay at top level',",
            "  args: { text: { type: 'string' } },",
            "  execute: async ({ text }: { text: string }) => {",
            "    return say({ text })",
            "  },",
            "}",
            "",
          ].join("\n"),
        )
      },
    })

    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const ids = await ToolRegistry.ids()
        expect(ids).toContain("cowsay")
      },
    })
  })
})
