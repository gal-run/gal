import type { Argv } from "yargs"
import { cmd } from "./cmd"
import { bootstrap } from "../bootstrap"
import { UI } from "../ui"
import { InstructionPatternSync } from "../../session/instruction-patterns"
import { Effect, Layer } from "effect"
import { AppFileSystem } from "@/filesystem"
import { Config } from "@/config/config"
import { FetchHttpClient } from "effect/unstable/http"
import { Instance } from "../../project/instance"
import { Flag } from "../../flag/flag"

export const PatternCommand = cmd({
  command: "pattern",
  describe: "detect and sync instruction patterns",
  builder: (yargs: Argv) =>
    yargs
      .command(PatternScanCommand)
      .command(PatternSyncCommand)
      .demandCommand(),
  async handler() {},
})

export const PatternScanCommand = cmd({
  command: "scan",
  describe: "scan instruction files for patterns (MUST, ALWAYS, NEVER, etc.)",
  builder: (yargs: Argv) => {
    return yargs
      .option("file", {
        describe: "specific file to scan (default: scan all instruction files)",
        type: "string",
      })
      .option("json", {
        describe: "output as JSON",
        type: "boolean",
        default: false,
      })
  },
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      const program = Effect.gen(function* () {
        const service = yield* InstructionPatternSync.Service

        let patterns
        if (args.file) {
          patterns = yield* service.scanInstructionFile(args.file).pipe(
            Effect.catch(() => Effect.succeed([])),
          )
        } else {
          patterns = yield* service.scanAllInstructionFiles()
        }

        if (args.json) {
          console.log(JSON.stringify(patterns, null, 2))
          return
        }

        if (patterns.length === 0) {
          UI.println(UI.Style.TEXT_DIM + "No instruction patterns found." + UI.Style.TEXT_NORMAL)
          return
        }

        UI.println("")
        UI.println(UI.Style.TEXT_SUCCESS_BOLD + `Found ${patterns.length} instruction pattern(s):` + UI.Style.TEXT_NORMAL)
        UI.println("")

        const grouped = new Map<string, typeof patterns>()
        for (const p of patterns) {
          const key = p.sourceFile
          if (!grouped.has(key)) {
            grouped.set(key, [])
          }
          grouped.get(key)!.push(p)
        }

        for (const [file, filePatterns] of grouped) {
          const relPath = file.replace(Instance.directory, "").replace(/^\//, "")
          UI.println(UI.Style.TEXT_INFO + relPath + UI.Style.TEXT_NORMAL)
          for (const p of filePatterns) {
            UI.println(`  Line ${p.line}: ${UI.Style.TEXT_WARNING}${p.pattern}${UI.Style.TEXT_NORMAL}`)
          }
          UI.println("")
        }
      })

      await Effect.runPromise(
        program.pipe(
          Effect.provide(InstructionPatternSync.defaultLayer),
        ),
      )
    })
  },
})

export const PatternSyncCommand = cmd({
  command: "sync <orgId>",
  describe: "sync detected instruction patterns to GAL shared memory",
  builder: (yargs: Argv) => {
    return yargs
      .positional("orgId", {
        describe: "organization ID to sync patterns to",
        type: "string",
        demandOption: true,
      })
      .option("file", {
        describe: "specific file to sync (default: sync all instruction files)",
        type: "string",
      })
      .option("dry-run", {
        describe: "show what would be synced without making API calls",
        type: "boolean",
        default: false,
      })
  },
  handler: async (args) => {
    await bootstrap(process.cwd(), async () => {
      const program = Effect.gen(function* () {
        const service = yield* InstructionPatternSync.Service

        let patterns
        if (args.file) {
          patterns = yield* service.scanInstructionFile(args.file).pipe(
            Effect.catch(() => Effect.succeed([])),
          )
        } else {
          patterns = yield* service.scanAllInstructionFiles()
        }

        if (patterns.length === 0) {
          UI.println(UI.Style.TEXT_DIM + "No instruction patterns found to sync." + UI.Style.TEXT_NORMAL)
          return
        }

        UI.println(UI.Style.TEXT_INFO + `Found ${patterns.length} pattern(s) to sync.` + UI.Style.TEXT_NORMAL)

        if (args.dryRun) {
          UI.println("")
          UI.println(UI.Style.TEXT_WARNING + "DRY RUN - would sync these patterns:" + UI.Style.TEXT_NORMAL)
          for (const p of patterns) {
            UI.println(`  ${p.sourceFile}:${p.line} - ${p.pattern}`)
          }
          return
        }

        UI.println("")
        const result = yield* service.syncToMemory(args.orgId, patterns)

        if (result.synced > 0) {
          UI.println(UI.Style.TEXT_SUCCESS_BOLD + `Synced ${result.synced} pattern(s) to GAL shared memory.` + UI.Style.TEXT_NORMAL)
        }
        if (result.failed > 0) {
          UI.println(UI.Style.TEXT_DANGER + `Failed to sync ${result.failed} pattern(s).` + UI.Style.TEXT_NORMAL)
        }
      })

      await Effect.runPromise(
        program.pipe(
          Effect.provide(InstructionPatternSync.defaultLayer),
        ),
      )
    })
  },
})

export async function autoSyncInstructionPatterns(orgId: string): Promise<{ synced: number; failed: number }> {
  if (!orgId || !Flag.GAL_CODE_EXPERIMENTAL_WORKSPACES) {
    return { synced: 0, failed: 0 }
  }

  try {
    return await Effect.runPromise(
      Effect.gen(function* () {
        const service = yield* InstructionPatternSync.Service
        const patterns = yield* service.scanAllInstructionFiles()
        if (patterns.length === 0) {
          return { synced: 0, failed: 0 }
        }
        return yield* service.syncToMemory(orgId, patterns)
      }).pipe(
        Effect.provide(InstructionPatternSync.defaultLayer),
        Effect.catch(() => Effect.succeed({ synced: 0, failed: 0 })),
      ),
    )
  } catch {
    return { synced: 0, failed: 0 }
  }
}
