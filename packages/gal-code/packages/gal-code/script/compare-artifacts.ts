#!/usr/bin/env bun

import { $ } from "bun"
import fs from "fs"
import path from "path"
import { fileURLToPath } from "url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

const REFERENCE_REPO = process.env.REFERENCE_REPO || "gal-run/gal-code"
const REFERENCE_TAG = process.env.REFERENCE_TAG || "latest"

console.log(`=== Comparing Artifacts with Monorepo Reference ===`)
console.log(`Reference: ${REFERENCE_REPO}:${REFERENCE_TAG}`)

const expectedArtifacts = [
  "gal-code-darwin-arm64.zip",
  "gal-code-darwin-x64.zip",
  "gal-code-linux-arm64.tar.gz",
  "gal-code-linux-x64.tar.gz",
  "gal-code-windows-arm64.zip",
  "gal-code-windows-x64.zip",
]

const distDir = path.join(dir, "dist")

const localArtifacts = fs.existsSync(distDir)
  ? fs.readdirSync(distDir).filter((f) => f.endsWith(".zip") || f.endsWith(".tar.gz"))
  : []

console.log(`\nLocal artifacts (${localArtifacts.length}):`)
for (const artifact of localArtifacts) {
  console.log(`  - ${artifact}`)
}

console.log(`\nExpected artifacts from monorepo:`)
for (const artifact of expectedArtifacts) {
  const found = localArtifacts.includes(artifact)
  console.log(`  - ${artifact} ${found ? "✓" : "✗ MISSING"}`)
}

const missingArtifacts = expectedArtifacts.filter((a) => !localArtifacts.includes(a))
const extraArtifacts = localArtifacts.filter(
  (a) => !expectedArtifacts.includes(a.replace(/-baseline/g, "").replace(/-musl/g, "")),
)

console.log(`\n=== Comparison Report ===`)

if (missingArtifacts.length === 0) {
  console.log("✓ All expected artifacts present")
} else {
  console.log(`✗ Missing ${missingArtifacts.length} artifacts:`)
  for (const artifact of missingArtifacts) {
    console.log(`  - ${artifact}`)
  }
}

if (extraArtifacts.length > 0) {
  console.log(`\nℹ Additional artifacts (not in monorepo reference):`)
  for (const artifact of extraArtifacts) {
    console.log(`  - ${artifact}`)
  }
}

let referenceRelease: { tag_name: string; assets: { name: string }[] } | null = null
try {
  console.log(`\nFetching reference release from ${REFERENCE_REPO}...`)
  const result = await $`gh release view ${REFERENCE_TAG} --repo ${REFERENCE_REPO} --json tagName,assets`.json()
  referenceRelease = result as { tag_name: string; assets: { name: string }[] }
} catch (e) {
  console.log(`Warning: Could not fetch reference release: ${e}`)
}

if (referenceRelease) {
  const referenceAssets = referenceRelease.assets
    .map((a) => a.name)
    .filter((n) => n.startsWith("gal-code-") && (n.endsWith(".zip") || n.endsWith(".tar.gz")))

  console.log(`\nReference release assets (${referenceAssets.length}):`)
  for (const asset of referenceAssets) {
    console.log(`  - ${asset}`)
  }

  const assetDiff = referenceAssets.filter((a) => !localArtifacts.includes(a))
  if (assetDiff.length > 0) {
    console.log(`\nAssets in reference but not locally:`)
    for (const asset of assetDiff) {
      console.log(`  - ${asset}`)
    }
  }
}

const report = {
  timestamp: new Date().toISOString(),
  reference: { repo: REFERENCE_REPO, tag: REFERENCE_TAG },
  expected: expectedArtifacts,
  local: localArtifacts,
  missing: missingArtifacts,
  extra: extraArtifacts,
  referenceRelease: referenceRelease
    ? {
        tag: referenceRelease.tag_name,
        assetCount: referenceRelease.assets.length,
        galCodeAssets: referenceRelease.assets.map((a) => a.name).filter((n) => n.startsWith("gal-code-")),
      }
    : null,
  passed: missingArtifacts.length === 0,
}

await Bun.write("dist/artifact-comparison.json", JSON.stringify(report, null, 2))

console.log(`\nComparison report saved to dist/artifact-comparison.json`)

if (missingArtifacts.length > 0) {
  process.exit(1)
}
