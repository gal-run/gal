import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Npm } from "../src/npm"
import { tmpdir } from "./fixture/fixture"

const win = process.platform === "win32"
const decoder = new TextDecoder()
const root = path.resolve(import.meta.dirname, "..")

function platform() {
  if (process.platform === "win32") return "windows"
  return process.platform
}

function binary() {
  if (platform() === "windows") return "gal-code.exe"
  return "gal-code"
}

async function fixture(dir: string) {
  const org = path.join(dir, "node_modules", "@gal-run")
  const pkg = path.join(org, "code")
  const dep = path.join(org, `code-${platform()}-${process.arch}`)
  await fs.mkdir(path.join(pkg, "bin"), { recursive: true })
  await fs.mkdir(path.join(dep, "bin"), { recursive: true })
  await fs.copyFile(path.join(root, "bin", "gal-code"), path.join(pkg, "bin", "gal-code"))
  await fs.copyFile(path.join(root, "script", "postinstall.mjs"), path.join(pkg, "postinstall.mjs"))
  await Bun.write(path.join(pkg, "package.json"), JSON.stringify({ name: "@gal-run/code" }))
  await Bun.write(
    path.join(dep, "package.json"),
    JSON.stringify({ name: `@gal-run/code-${platform()}-${process.arch}` }),
  )
  await Bun.write(
    path.join(dep, "bin", binary()),
    "#!/usr/bin/env node\nconsole.log('gal-code binary ' + process.argv.slice(2).join(' '))\n",
  )
  await fs.chmod(path.join(dep, "bin", binary()), 0o755)
  return pkg
}

function text(out: Uint8Array) {
  return decoder.decode(out)
}

describe("Npm.sanitize", () => {
  test("keeps normal scoped package specs unchanged", () => {
    expect(Npm.sanitize("@gal-code/acme")).toBe("@gal-code/acme")
    expect(Npm.sanitize("@gal-code/acme@1.0.0")).toBe("@gal-code/acme@1.0.0")
    expect(Npm.sanitize("prettier")).toBe("prettier")
  })

  test("handles git https specs", () => {
    const spec = "acme@git+https://github.com/gal-code/acme.git"
    const expected = win ? "acme@git+https_//github.com/gal-code/acme.git" : spec
    expect(Npm.sanitize(spec)).toBe(expected)
  })
})

describe("npm release package", () => {
  test("launcher resolves scoped GAL binary package", async () => {
    await using tmp = await tmpdir({ init: fixture })
    const result = Bun.spawnSync(["node", path.join(tmp.extra, "bin", "gal-code"), "ok"], {
      cwd: tmp.extra,
    })

    expect(result.exitCode).toBe(0)
    expect(text(result.stdout)).toContain("gal-code binary ok")
  })

  test("postinstall caches scoped GAL binary package", async () => {
    await using tmp = await tmpdir({ init: fixture })
    const setup = Bun.spawnSync(["node", path.join(tmp.extra, "postinstall.mjs")], {
      cwd: tmp.extra,
    })

    expect(setup.exitCode).toBe(0)
    expect(await Bun.file(path.join(tmp.extra, "bin", ".gal-code")).exists()).toBe(true)

    const result = Bun.spawnSync(["node", path.join(tmp.extra, "bin", "gal-code"), "ok"], {
      cwd: tmp.extra,
    })

    expect(result.exitCode).toBe(0)
    expect(text(result.stdout)).toContain("gal-code binary ok")
  })
})
