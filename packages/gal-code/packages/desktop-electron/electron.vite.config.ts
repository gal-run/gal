import { defineConfig } from "electron-vite"
import appPlugin from "@scheduler-systems/gal-code-app/vite"
import * as fs from "node:fs/promises"

const channel = (() => {
  const raw = process.env.GAL_CODE_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  return "dev"
})()

const GAL_CODE_SERVER_DIST = "../gal-code/dist/node"

const nodePtyPkg = `@lydell/node-pty-${process.platform}-${process.arch}`

export default defineConfig({
  main: {
    define: {
      "import.meta.env.GAL_CODE_CHANNEL": JSON.stringify(channel),
    },
    build: {
      rollupOptions: {
        input: { index: "src/main/index.ts" },
      },
      externalizeDeps: { include: [nodePtyPkg] },
    },
    plugins: [
      {
        name: "gal-code:node-pty-narrower",
        enforce: "pre",
        resolveId(s) {
          if (s === "@lydell/node-pty") return nodePtyPkg
        },
      },
      {
        name: "gal-code:virtual-server-module",
        enforce: "pre",
        resolveId(id) {
          if (id === "virtual:gal-code-server") return this.resolve(`${GAL_CODE_SERVER_DIST}/node.js`)
        },
      },
      {
        name: "gal-code:copy-server-assets",
        async writeBundle() {
          for (const l of await fs.readdir(GAL_CODE_SERVER_DIST)) {
            if (!l.endsWith(".wasm")) continue
            await fs.writeFile(`./out/main/chunks/${l}`, await fs.readFile(`${GAL_CODE_SERVER_DIST}/${l}`))
          }
        },
      },
    ],
  },
  preload: {
    build: {
      rollupOptions: {
        input: { index: "src/preload/index.ts" },
      },
    },
  },
  renderer: {
    plugins: [appPlugin],
    publicDir: "../../../app/public",
    root: "src/renderer",
    build: {
      rollupOptions: {
        input: {
          main: "src/renderer/index.html",
          loading: "src/renderer/loading.html",
        },
      },
    },
  },
})
