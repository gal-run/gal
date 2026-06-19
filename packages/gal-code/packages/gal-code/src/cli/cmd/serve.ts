import { Server } from "../../server/server"
import { cmd } from "./cmd"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { Flag } from "../../flag/flag"
import { Workspace } from "../../control-plane/workspace"
import { Project } from "../../project/project"
import { Installation } from "../../installation"
import { applyGov } from "./governance"

export const ServeCommand = cmd({
  command: "serve",
  builder: (yargs) =>
    withNetworkOptions(yargs)
      .option("governance", {
        type: "boolean",
        describe: "override local GAL governance sidecar startup; enabled automatically for local runs",
      })
      .option("governance-mode", {
        type: "string",
        choices: ["block", "warn", "shadow"],
        describe: "governance sidecar mode",
        default: "warn",
      })
      .option("governance-min-confidence", {
        type: "number",
        describe: "minimum confidence required before governance hold triggers",
        default: 0.9,
      }),
  describe: "starts a headless gal-code server",
  handler: async (args) => {
    if (!Flag.GAL_CODE_SERVER_PASSWORD) {
      console.log("Warning: GAL_CODE_SERVER_PASSWORD is not set; server is unsecured.")
    }
    try {
      await applyGov(args)
    } catch (error) {
      console.error(error instanceof Error ? error.message : String(error))
      process.exit(1)
    }
    const opts = await resolveNetworkOptions(args)
    const server = await Server.listen(opts)
    console.log(`gal-code server listening on http://${server.hostname}:${server.port}`)

    await new Promise(() => {})
    await server.stop()
  },
})
