import { $ } from "bun"
import semver from "semver"
import path from "path"

const rootPkgPath = path.resolve(import.meta.dir, "../../../package.json")
const rootPkg = await Bun.file(rootPkgPath).json()
const expectedBunVersion = rootPkg.packageManager?.split("@")[1]

if (!expectedBunVersion) {
  throw new Error("packageManager field not found in root package.json")
}

// relax version requirement
const expectedBunVersionRange = `^${expectedBunVersion}`

if (!semver.satisfies(process.versions.bun, expectedBunVersionRange)) {
  throw new Error(`This script requires bun@${expectedBunVersionRange}, but you are using bun@${process.versions.bun}`)
}

const env = {
  GAL_CODE_CHANNEL: process.env["GAL_CODE_CHANNEL"],
  GAL_CODE_BUMP: process.env["GAL_CODE_BUMP"],
  GAL_CODE_VERSION: process.env["GAL_CODE_VERSION"],
  GAL_CODE_RELEASE: process.env["GAL_CODE_RELEASE"],
}
const NPM_PACKAGE_NAME = "@gal-run/code"
const FIRST_RELEASE_BASE_VERSION = "0.1.0"

const CHANNEL = await (async () => {
  if (env.GAL_CODE_CHANNEL) return env.GAL_CODE_CHANNEL
  if (env.GAL_CODE_BUMP) return "latest"
  if (env.GAL_CODE_VERSION && !env.GAL_CODE_VERSION.startsWith("0.0.0-")) return "latest"
  return await $`git branch --show-current`.text().then((x) => x.trim())
})()
const IS_PREVIEW = CHANNEL !== "latest"

const VERSION = await (async () => {
  if (env.GAL_CODE_VERSION) return env.GAL_CODE_VERSION
  if (IS_PREVIEW) return `0.0.0-${CHANNEL}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "")}`
  const version = await fetch(`https://registry.npmjs.org/${encodeURIComponent(NPM_PACKAGE_NAME)}/latest`)
    .then((res) => {
      if (res.status === 404) return { version: FIRST_RELEASE_BASE_VERSION }
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`)
      return res.json()
    })
    .then((data: any) => data.version)
  const [major, minor, patch] = version.split(".").map((x: string) => Number(x) || 0)
  const t = env.GAL_CODE_BUMP?.toLowerCase()
  if (t === "major") return `${major + 1}.0.0`
  if (t === "minor") return `${major}.${minor + 1}.0`
  return `${major}.${minor}.${patch + 1}`
})()

const bot = ["actions-user", "gal-code", "gal-code-agent[bot]"]
const teamPath = path.resolve(import.meta.dir, "../../../.github/TEAM_MEMBERS")
const team = [
  ...(await Bun.file(teamPath)
    .text()
    .then((x) => x.split(/\r?\n/).map((x) => x.trim()))
    .then((x) => x.filter((x) => x && !x.startsWith("#")))),
  ...bot,
]

export const Script = {
  get channel() {
    return CHANNEL
  },
  get version() {
    return VERSION
  },
  get preview() {
    return IS_PREVIEW
  },
  get release(): boolean {
    return !!env.GAL_CODE_RELEASE
  },
  get team() {
    return team
  },
}
console.log(`gal-code script`, JSON.stringify(Script, null, 2))
