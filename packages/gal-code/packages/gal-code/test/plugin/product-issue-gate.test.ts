import { afterEach, describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import path from "node:path"
import { tmpdir } from "../fixture/fixture"
import { ProductIssueGatePlugin } from "../../src/plugin/product-issue-gate"

const originalPath = process.env.PATH
const originalAlways = process.env.GAL_PRODUCT_ISSUE_GATE_ALWAYS

function pathWith(dir: string) {
  return [dir, originalPath].filter(Boolean).join(path.delimiter)
}

async function shim(file: string, lines: string[]) {
  const gal = process.platform === "win32" ? file + ".cmd" : file
  await fs.writeFile(gal, lines.join("\n"))
  if (process.platform !== "win32") await fs.chmod(gal, 0o755)
}

afterEach(() => {
  process.env.PATH = originalPath
  if (originalAlways === undefined) {
    delete process.env.GAL_PRODUCT_ISSUE_GATE_ALWAYS
  } else {
    process.env.GAL_PRODUCT_ISSUE_GATE_ALWAYS = originalAlways
  }
})

describe("ProductIssueGatePlugin", () => {
  test("blocks mutating tools when gal product issue hook blocks", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const bin = path.join(dir, "bin")
        await fs.mkdir(bin)
        await shim(
          path.join(bin, "gal"),
          process.platform === "win32"
            ? ["@echo off", "more >nul", 'echo {"decision":"block","reason":"blocked_product_improvement"}', ""]
            : [
                "#!/bin/sh",
                "cat >/dev/null",
                'printf \'%s\\n\' \'{"decision":"block","reason":"blocked_product_improvement"}\'',
                "",
              ],
        )
        return { bin }
      },
    })

    process.env.PATH = pathWith(tmp.extra.bin)
    process.env.GAL_PRODUCT_ISSUE_GATE_ALWAYS = "1"

    const hooks = await ProductIssueGatePlugin({ directory: tmp.path } as never)

    await expect(
      hooks["tool.execute.before"]?.(
        { tool: "write", sessionID: "ses", callID: "call" },
        { args: { file_path: "src/feature.ts", content: "x" } },
      ),
    ).rejects.toThrow("blocked_product_improvement")
  })

  test("does not call gal for read-only tools", async () => {
    await using tmp = await tmpdir()
    process.env.GAL_PRODUCT_ISSUE_GATE_ALWAYS = "1"

    const hooks = await ProductIssueGatePlugin({ directory: tmp.path } as never)

    await expect(
      hooks["tool.execute.before"]?.(
        { tool: "read", sessionID: "ses", callID: "call" },
        { args: { file_path: "README.md" } },
      ),
    ).resolves.toBeUndefined()
  })

  test("passes combined command and arguments to gal product issue hook", async () => {
    await using tmp = await tmpdir({
      init: async (dir) => {
        const bin = path.join(dir, "bin")
        await fs.mkdir(bin)
        await shim(
          path.join(bin, "gal"),
          process.platform === "win32"
            ? [
                "@echo off",
                "set /p payload=",
                'echo %payload% | findstr /C:"git commit" >nul',
                'if errorlevel 1 (echo {"decision":"allow"}) else (echo {"decision":"block","reason":"blocked_product_improvement"})',
                "",
              ]
            : [
                "#!/bin/sh",
                "payload=$(cat)",
                'case "$payload" in',
                '  *"git commit"*) printf \'%s\\n\' \'{"decision":"block","reason":"blocked_product_improvement"}\' ;;',
                "  *) printf '%s\\n' '{\"decision\":\"allow\"}' ;;",
                "esac",
                "",
              ],
        )
        return { bin }
      },
    })

    process.env.PATH = pathWith(tmp.extra.bin)
    process.env.GAL_PRODUCT_ISSUE_GATE_ALWAYS = "1"

    const hooks = await ProductIssueGatePlugin({ directory: tmp.path } as never)

    await expect(
      hooks["command.execute.before"]?.(
        { command: "git", arguments: 'commit -m "ship"', sessionID: "ses" },
        { parts: [] },
      ),
    ).rejects.toThrow("blocked_product_improvement")
  })
})
