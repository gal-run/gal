#!/usr/bin/env node

import fs from "fs"
import path from "path"
import os from "os"
import childProcess from "child_process"
import { fileURLToPath } from "url"

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const meta = path.join(__dirname, "package.json")
const pkg = fs.existsSync(meta) ? JSON.parse(fs.readFileSync(meta, "utf8")).name || "@gal-run/code" : "@gal-run/code"

function detectPlatformAndArch() {
  const platforms = {
    darwin: "darwin",
    linux: "linux",
    win32: "windows",
  }
  const archs = {
    x64: "x64",
    arm64: "arm64",
    arm: "arm",
  }

  const platform = platforms[os.platform()] || os.platform()
  const arch = archs[os.arch()] || os.arch()

  return { platform, arch }
}

function supportsAvx2(platform, arch) {
  if (arch !== "x64") return false
  if (platform === "linux") {
    if (!fs.existsSync("/proc/cpuinfo")) return false
    return /(^|\s)avx2(\s|$)/i.test(fs.readFileSync("/proc/cpuinfo", "utf8"))
  }
  if (platform === "darwin") {
    const result = childProcess.spawnSync("sysctl", ["-n", "hw.optional.avx2_0"], {
      encoding: "utf8",
      timeout: 1500,
    })
    if (result.status !== 0) return false
    return (result.stdout || "").trim() === "1"
  }
  return false
}

function isMusl() {
  if (fs.existsSync("/etc/alpine-release")) return true
  const result = childProcess.spawnSync("ldd", ["--version"], { encoding: "utf8" })
  const text = ((result.stdout || "") + (result.stderr || "")).toLowerCase()
  return text.includes("musl")
}

function binaryNames() {
  const { platform, arch } = detectPlatformAndArch()
  const base = pkg + "-" + platform + "-" + arch
  const avx2 = supportsAvx2(platform, arch)
  const baseline = arch === "x64" && !avx2

  if (platform === "linux") {
    const musl = isMusl()

    if (musl) {
      if (arch === "x64") {
        if (baseline) return [`${base}-baseline-musl`, `${base}-musl`, `${base}-baseline`, base]
        return [`${base}-musl`, `${base}-baseline-musl`, base, `${base}-baseline`]
      }
      return [`${base}-musl`, base]
    }

    if (arch === "x64") {
      if (baseline) return [`${base}-baseline`, base, `${base}-baseline-musl`, `${base}-musl`]
      return [base, `${base}-baseline`, `${base}-musl`, `${base}-baseline-musl`]
    }
    return [base, `${base}-musl`]
  }

  if (arch === "x64") {
    if (baseline) return [`${base}-baseline`, base]
    return [base, `${base}-baseline`]
  }
  return [base]
}

function findBinary() {
  const { platform } = detectPlatformAndArch()
  const binary = platform === "windows" ? "gal-code.exe" : "gal-code"
  let current = __dirname
  for (;;) {
    const modules = path.join(current, "node_modules")
    if (fs.existsSync(modules)) {
      for (const name of binaryNames()) {
        const candidate = path.join(modules, name, "bin", binary)
        if (fs.existsSync(candidate)) return candidate
      }
    }
    const parent = path.dirname(current)
    if (parent === current) return
    current = parent
  }
}

async function main() {
  try {
    if (os.platform() === "win32") {
      // On Windows, the .exe is already included in the package and bin field points to it
      // No postinstall setup needed
      console.log("Windows detected: binary setup not needed (using packaged .exe)")
      return
    }

    const binaryPath = findBinary()
    if (!binaryPath) throw new Error(`Could not find binary package. Tried ${binaryNames().join(", ")}`)
    const target = path.join(__dirname, "bin", ".gal-code")
    if (fs.existsSync(target)) fs.unlinkSync(target)
    try {
      fs.linkSync(binaryPath, target)
    } catch {
      fs.copyFileSync(binaryPath, target)
    }
    fs.chmodSync(target, 0o755)
  } catch (error) {
    console.error("Failed to setup GAL Code binary:", error.message)
    process.exit(1)
  }
}

try {
  main()
} catch (error) {
  console.error("Postinstall script error:", error.message)
  process.exit(0)
}
