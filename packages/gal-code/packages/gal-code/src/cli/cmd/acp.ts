import { Log } from "@/util/log"
import { bootstrap } from "../bootstrap"
import { cmd } from "./cmd"
import { AgentSideConnection, ndJsonStream } from "@agentclientprotocol/sdk"
import { ACP } from "@/acp/agent"
import { Server } from "@/server/server"
import { createGalCodeClient } from "@scheduler-systems/gal-code-sdk/v2"
import { withNetworkOptions, resolveNetworkOptions } from "../network"
import { applyGov } from "./governance"

const log = Log.create({ service: "acp-command" })

export const AcpCommand = cmd({
  command: "acp",
  describe: "start ACP (Agent Client Protocol) server",
  builder: (yargs) => {
    return withNetworkOptions(yargs)
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
      })
      .option("cwd", {
        describe: "working directory",
        type: "string",
        default: process.cwd(),
      })
  },
  handler: async (args) => {
    process.env.GAL_CODE_CLIENT = "acp"
    await bootstrap(process.cwd(), async () => {
      try {
        await applyGov(args)
      } catch (error) {
        log.error("governance startup failed", { error: error instanceof Error ? error.message : String(error) })
        process.exit(1)
      }
      const opts = await resolveNetworkOptions(args)
      const server = await Server.listen(opts)

      const sdk = createGalCodeClient({
        baseUrl: `http://${server.hostname}:${server.port}`,
      })

      const input = new WritableStream<Uint8Array>({
        write(chunk) {
          return new Promise<void>((resolve, reject) => {
            process.stdout.write(chunk, (err) => {
              if (err) {
                reject(err)
              } else {
                resolve()
              }
            })
          })
        },
      })
      const output = new ReadableStream<Uint8Array>({
        start(controller) {
          process.stdin.on("data", (chunk: Buffer) => {
            controller.enqueue(new Uint8Array(chunk))
          })
          process.stdin.on("end", () => controller.close())
          process.stdin.on("error", (err) => controller.error(err))
        },
      })

      const stream = ndJsonStream(input, output)
      const agent = await ACP.init({ sdk })

      new AgentSideConnection((conn) => {
        return agent.create(conn, { sdk })
      }, stream)

      log.info("setup connection")
      process.stdin.resume()
      await new Promise((resolve, reject) => {
        process.stdin.on("end", resolve)
        process.stdin.on("error", reject)
      })
    })
  },
})
