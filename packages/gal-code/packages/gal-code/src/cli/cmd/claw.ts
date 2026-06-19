import { cmd } from "./cmd"
import { spawnSync } from "child_process"
import { existsSync } from "fs"
import path from "path"

export const ClawCommand = cmd({
  command: "claw",
  describe: "launch gal-claw Rust sidecar",
  builder: (yargs) =>
    yargs
      .option("model", { type: "string", describe: "override model" })
      .option("prompt", { alias: "p", type: "string", describe: "non-interactive prompt" })
      .option("compact", { type: "boolean", describe: "compact output" })
      .option("dev", { type: "boolean", describe: "build and launch development version" })
      .option("doctor", { type: "boolean", describe: "run health check" })
      .option("status", { type: "boolean", describe: "show workspace status" }),
  handler: async (opts) => {
    let binary = "gal-claw"

    if (opts.dev) {
      const packageDir = path.resolve(import.meta.dirname!, "../../..")
      const root = path.resolve(packageDir, "../..")
      const worktree = path.join(root, "worktrees/gal-claw/rust")
      const clawo = path.join(worktree, "target/release/claw")
      if (!existsSync(clawo)) {
        process.stderr.write("Building gal-claw (release)...\n")
        spawnSync("cargo", ["build", "--release", "--package", "rusty-claude-cli"], {
          cwd: worktree,
          stdio: "inherit",
        })
      }
      binary = clawo
    }

    const env: Record<string, string> = {
      ...process.env,
      OPENAI_BASE_URL: process.env.OPENAI_BASE_URL || "https://openrouter.ai/api/v1",
    }
    if (!env.OPENAI_API_KEY) env.OPENAI_API_KEY = env.OPENROUTER_API_KEY || ""

    const args: string[] = []

    if (opts.doctor) {
      args.push("doctor")
    } else if (opts.status) {
      args.push("status")
    } else if (opts.prompt) {
      args.push("prompt", opts.prompt)
      if (opts.model) {
        args.push("--model", opts.model)
        args.push("--output-format", "text")
      }
      if (opts.compact) args.push("--compact")
    } else {
      if (opts.model) args.push("--model", opts.model)
    }

    spawnSync(binary, args, { stdio: "inherit", env })
  },
})
