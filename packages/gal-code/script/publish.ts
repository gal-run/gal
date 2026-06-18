#!/usr/bin/env bun

import { Script } from "@scheduler-systems/gal-code-script"
import { $ } from "bun"
import { fileURLToPath } from "url"

const highlightsTemplate = `
<!--
Add highlights before publishing. Delete this section if no highlights.

- For multiple highlights, use multiple <highlight> tags
- Highlights with the same source attribute get grouped together
-->

<!--
<highlight source="SourceName (TUI/Desktop/Web/Core)">
  <h2>Feature title goes here</h2>
  <p short="Short description used for Desktop Recap">
    Full description of the feature or change
  </p>

  https://github.com/user-attachments/assets/uuid-for-video (you will want to drag & drop the video or picture)

  <img
    width="1912"
    height="1164"
    alt="image"
    src="https://github.com/user-attachments/assets/uuid-for-image"
  />
</highlight>
-->

`

console.log("=== publishing ===\n")
const branch = process.env.GAL_CODE_RELEASE_BRANCH || "main"
const desktop = process.env.GAL_CODE_PUBLISH_DESKTOP !== "0"
const skipBook = process.env.GAL_CODE_SKIP_BOOK === "1"

async function optionalStep(label: string, task: () => Promise<unknown>) {
  try {
    await task()
  } catch (error) {
    console.warn(`Skipping ${label}:`, error)
  }
}

async function book() {
  const name = (await $`git branch --show-current`.text()).trim()
  if (name !== branch) {
    throw new Error(`Stable releases must run on ${branch}; got ${name || "detached HEAD"}`)
  }

  await $`git fetch origin refs/heads/${branch}:refs/remotes/origin/${branch}`

  const head = (await $`git rev-parse HEAD`.text()).trim()
  const base = (await $`git rev-parse refs/remotes/origin/${branch}`.text()).trim()
  if (head !== base) {
    throw new Error(`Stable releases must start from origin/${branch}; local ${head} != remote ${base}`)
  }

  await $`git commit -am "release: v${Script.version}"`
  await $`git tag -f v${Script.version}`
  await $`git push origin HEAD:refs/heads/${branch}`
  await $`git push origin +refs/tags/v${Script.version}`
  await new Promise((resolve) => setTimeout(resolve, 5_000))
}

const pkgjsons = await Array.fromAsync(
  new Bun.Glob("**/package.json").scan({
    absolute: true,
  }),
).then((arr) => arr.filter((x) => !x.includes("node_modules") && !x.includes("dist")))

for (const file of pkgjsons) {
  let pkg = await Bun.file(file).text()
  pkg = pkg.replaceAll(/"version": "[^"]+"/g, `"version": "${Script.version}"`)
  console.log("updated:", file)
  await Bun.file(file).write(pkg)
}

const extensionToml = fileURLToPath(new URL("../packages/extensions/zed/extension.toml", import.meta.url))
let toml = await Bun.file(extensionToml).text()
toml = toml.replace(/^version = "[^"]+"/m, `version = "${Script.version}"`)
toml = toml.replaceAll(/releases\/download\/v[^/]+\//g, `releases/download/v${Script.version}/`)
console.log("updated:", extensionToml)
await Bun.file(extensionToml).write(toml)

await $`bun install`
await import(`../packages/sdk/js/script/build.ts`)

if (Script.release) {
  if (!Script.preview && !skipBook) {
    await book()
  }
  if (!Script.preview && skipBook) {
    console.log(`Skipping protected-branch bookkeeping on ${branch}`)
  }

  if (desktop) {
    await optionalStep(
      "Tauri latest.json finalization",
      () => import(`../packages/desktop/scripts/finalize-latest-json.ts`),
    )
    await optionalStep(
      "Electron latest.yml finalization",
      () => import(`../packages/desktop-electron/scripts/finalize-latest-yml.ts`),
    )
  }
}

console.log("\n=== cli ===\n")
await import(`../packages/gal-code/script/publish.ts`)

console.log("\n=== sdk ===\n")
await optionalStep("SDK npm publish", () => import(`../packages/sdk/js/script/publish.ts`))

console.log("\n=== plugin ===\n")
await optionalStep("plugin npm publish", () => import(`../packages/plugin/script/publish.ts`))

if (Script.release) {
  await $`gh release edit v${Script.version} --draft=false --repo ${process.env.GH_REPO}`
}

const dir = fileURLToPath(new URL("..", import.meta.url))
process.chdir(dir)
