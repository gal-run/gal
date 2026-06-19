#!/usr/bin/env bun

import { $ } from "bun"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

const SKIP_EMBED_WEB_UI = process.env.SKIP_EMBED_WEB_UI === "true"
const DRY_RUN_VERSION = process.env.GAL_CODE_VERSION || `0.0.0-dry-run-${Date.now()}`

console.log(`=== GAL Code Native Release Dry-Run ===`)
console.log(`Version: ${DRY_RUN_VERSION}`)
console.log(`Skip Web UI: ${SKIP_EMBED_WEB_UI}`)
console.log(`Platform: ${process.platform} ${process.arch}`)

const targets = [
  { os: "linux", arch: "arm64" as const },
  { os: "linux", arch: "x64" as const },
  { os: "linux", arch: "x64" as const, abi: "musl" as const },
  { os: "linux", arch: "arm64" as const, abi: "musl" as const },
  { os: "darwin", arch: "arm64" as const },
  { os: "darwin", arch: "x64" as const },
  { os: "win32", arch: "arm64" as const },
  { os: "win32", arch: "x64" as const },
]

await $`rm -rf dist`
await $`mkdir -p dist`

const builtArtifacts: string[] = []

for (const target of targets) {
  const name = [
    "gal-code",
    target.os === "win32" ? "windows" : target.os,
    target.arch,
    target.abi,
  ]
    .filter(Boolean)
    .join("-")

  console.log(`\n=== Building ${name} ===`)

  const buildArgs = ["bun", "run", "script/build.ts", "--single"]
  if (SKIP_EMBED_WEB_UI) {
    buildArgs.push("--skip-embed-web-ui")
  }

  const result = Bun.spawn(buildArgs, {
    cwd: dir,
    env: {
      ...process.env,
      GAL_CODE_VERSION: DRY_RUN_VERSION,
    },
    stdout: "inherit",
    stderr: "inherit",
  })

  const exitCode = await result.exited
  if (exitCode !== 0) {
    console.error(`Failed to build ${name}`)
    continue
  }

  const distDir = `dist/${name}`
  if (fs.existsSync(distDir)) {
    const binDir = `${distDir}/bin`
    if (fs.existsSync(binDir)) {
      const archiveName = `${name}${target.os === "linux" ? ".tar.gz" : ".zip"}`
      
      if (target.os === "linux") {
        await $`tar -czf ${archiveName} -C ${binDir} .`
      } else {
        await $`cd ${binDir} && zip -r ../../${archiveName} .`
      }
      
      builtArtifacts.push(archiveName)
      console.log(`Created ${archiveName}`)
    }
  }
}

console.log(`\n=== Dry-Run Summary ===`)
console.log(`Version: ${DRY_RUN_VERSION}`)
console.log(`Built artifacts:`)
for (const artifact of builtArtifacts) {
  const stat = fs.statSync(artifact)
  console.log(`  - ${artifact} (${(stat.size / 1024 / 1024).toFixed(2)} MB)`)
}

await Bun.write(
  "dist/dry-run-report.json",
  JSON.stringify(
    {
      version: DRY_RUN_VERSION,
      timestamp: new Date().toISOString(),
      platform: process.platform,
      arch: process.arch,
      artifacts: builtArtifacts.map((name) => ({
        name,
        size: fs.statSync(name).size,
      })),
    },
    null,
    2,
  ),
)

console.log(`\nDry-run complete. Report saved to dist/dry-run-report.json`)
