import { Effect, Layer, Context } from "effect"
import { createHash } from "crypto"
import { AppFileSystem } from "@/filesystem"
import { Instance } from "../project/instance"
import { Log } from "../util/log"
import { Config } from "@/config/config"
import { FetchHttpClient, HttpClient, HttpClientRequest } from "effect/unstable/http"
import { withTransientReadRetry } from "@/util/effect-http-client"

const log = Log.create({ service: "instruction-patterns" })

const INSTRUCTION_PATTERNS = [
  /\bMUST\b/gi,
  /\bMUST\s+NOT\b/gi,
  /\bALWAYS\b/gi,
  /\bNEVER\b/gi,
  /\bSHOULD\s+ALWAYS\b/gi,
  /\bSHOULD\s+NEVER\b/gi,
  /\bYOU\s+SHOULD\s+ALWAYS\b/gi,
  /\bYOU\s+SHOULD\s+NEVER\b/gi,
  /\bDO\s+NOT\b/gi,
  /\bDO\s+NOT\s+EVER\b/gi,
  /\bCRITICAL\b/gi,
  /\bIMPORTANT\b/gi,
  /\bREQUIRED\b/gi,
  /\bFORBIDDEN\b/gi,
  /\bMANDATORY\b/gi,
  /\bESSENTIAL\b/gi,
]

const PATTERN_CONTEXT_LINES = 2

export interface ExtractedPattern {
  pattern: string
  line: number
  context: string
  sourceFile: string
  hash: string
}

export interface InstructionPattern {
  id: string
  pattern: string
  content: string
  sourceFile: string
  category: string
  tags: string[]
  createdAt: string
}

export namespace InstructionPatternSync {
  export interface Interface {
    readonly detectPatterns: (content: string, filePath: string) => Effect.Effect<ExtractedPattern[]>
    readonly scanInstructionFile: (filePath: string) => Effect.Effect<ExtractedPattern[], AppFileSystem.Error>
    readonly scanAllInstructionFiles: () => Effect.Effect<ExtractedPattern[], AppFileSystem.Error>
    readonly syncToMemory: (orgId: string, patterns: ExtractedPattern[]) => Effect.Effect<{ synced: number; failed: number }, Error>
  }

  export class Service extends Context.Service<Service, Interface>()("@gal-code/InstructionPatternSync") {}

  export const layer: Layer.Layer<Service, never, AppFileSystem.Service | Config.Service | HttpClient.HttpClient> =
    Layer.effect(
      Service,
      Effect.gen(function* () {
        const fs = yield* AppFileSystem.Service
        const cfg = yield* Config.Service
        const http = HttpClient.filterStatusOk(withTransientReadRetry(yield* HttpClient.HttpClient))

        const detectPatterns = Effect.fn("InstructionPatternSync.detectPatterns")(
          (content: string, filePath: string): Effect.Effect<ExtractedPattern[]> =>
            Effect.gen(function* () {
              const lines = content.split("\n")
              const patterns: ExtractedPattern[] = []
              const seen = new Set<string>()

              for (let i = 0; i < lines.length; i++) {
                const line = lines[i]

                for (const patternRegex of INSTRUCTION_PATTERNS) {
                  const matches = line.match(patternRegex)
                  if (matches) {
                    const patternStr = matches[0]
                    const contextStart = Math.max(0, i - PATTERN_CONTEXT_LINES)
                    const contextEnd = Math.min(lines.length - 1, i + PATTERN_CONTEXT_LINES)
                    const contextLines = lines.slice(contextStart, contextEnd + 1)
                    const context = contextLines.join("\n")

                    const hash = createHash("sha256")
                      .update(filePath)
                      .update(String(i + 1))
                      .update(patternStr)
                      .digest("hex")
                      .substring(0, 16)

                    const key = `${filePath}:${i + 1}:${patternStr}`
                    if (!seen.has(key)) {
                      seen.add(key)
                      patterns.push({
                        pattern: patternStr,
                        line: i + 1,
                        context,
                        sourceFile: filePath,
                        hash,
                      })
                    }
                  }
                }
              }

              return patterns
            }),
        )

        const scanInstructionFile = Effect.fn("InstructionPatternSync.scanInstructionFile")(
          (filePath: string): Effect.Effect<ExtractedPattern[], AppFileSystem.Error> =>
            Effect.gen(function* () {
              const content = yield* fs.readFileString(filePath)
              if (!content || content.length < 10) {
                return []
              }
              return yield* detectPatterns(content, filePath)
            }),
        )

        const scanAllInstructionFiles = Effect.fn("InstructionPatternSync.scanAllInstructionFiles")(
          (): Effect.Effect<ExtractedPattern[], AppFileSystem.Error> =>
            Effect.gen(function* () {
              const allPatterns: ExtractedPattern[] = []
              const projectDir = Instance.directory

              const instructionFiles = [
                "AGENTS.md",
                "CLAUDE.md",
                ".claude/CLAUDE.md",
                ".cursor/rules",
                ".github/copilot-instructions.md",
                ".windsurf/rules",
                ".codex/AGENTS.md",
              ]

              for (const file of instructionFiles) {
                const filePath = file.startsWith("/")
                  ? file
                  : `${projectDir}/${file}`

                const exists = yield* fs.existsSafe(filePath)
                if (exists) {
                  const patterns = yield* scanInstructionFile(filePath).pipe(
                    Effect.catch(() => Effect.succeed([] as ExtractedPattern[])),
                  )
                  allPatterns.push(...patterns)
                }
              }

              return allPatterns
            }),
        )

        const syncToMemory = Effect.fn("InstructionPatternSync.syncToMemory")(
          (orgId: string, patterns: ExtractedPattern[]): Effect.Effect<{ synced: number; failed: number }, Error> =>
            Effect.gen(function* () {
              if (patterns.length === 0) {
                return { synced: 0, failed: 0 }
              }

              const config = yield* cfg.get()
              const apiUrl = process.env.GAL_API_URL || "https://api.gal.dev"

              let synced = 0
              let failed = 0

              const grouped = new Map<string, ExtractedPattern[]>()
              for (const p of patterns) {
                const key = p.sourceFile
                if (!grouped.has(key)) {
                  grouped.set(key, [])
                }
                grouped.get(key)!.push(p)
              }

              for (const [sourceFile, filePatterns] of grouped) {
                const content = formatPatternsForMemory(sourceFile, filePatterns)

                const body = {
                  orgId,
                  content,
                  repoScope: sourceFile.includes(Instance.directory)
                    ? undefined
                    : sourceFile,
                  tags: ["instruction-pattern", "auto-detected", ...extractTags(sourceFile)],
                  source: "agent" as const,
                }

                try {
                  const res = yield* http.execute(
                    HttpClientRequest.post(`${apiUrl}/api/orgs/${encodeURIComponent(orgId)}/memory`).pipe(
                      HttpClientRequest.setBody(body as any),
                    ),
                  ).pipe(Effect.timeout(10000))

                  if (res.status === 200 || res.status === 201) {
                    synced += filePatterns.length
                    log.info(`Synced ${filePatterns.length} patterns from ${sourceFile}`)
                  } else {
                    failed += filePatterns.length
                    log.warn(`Failed to sync patterns from ${sourceFile}: HTTP ${res.status}`)
                  }
                } catch (err) {
                  failed += filePatterns.length
                  log.warn(`Error syncing patterns from ${sourceFile}: ${err}`)
                }
              }

              return { synced, failed }
            }),
        )

        return Service.of({ detectPatterns, scanInstructionFile, scanAllInstructionFiles, syncToMemory })
      }),
    )

  export const defaultLayer = layer.pipe(
    Layer.provide(Config.defaultLayer),
    Layer.provide(AppFileSystem.defaultLayer),
    Layer.provide(FetchHttpClient.layer),
  )
}

function formatPatternsForMemory(sourceFile: string, patterns: ExtractedPattern[]): string {
  const relativePath = sourceFile.replace(Instance.directory, "").replace(/^\//, "")
  const lines = [
    `# Instruction Patterns from ${relativePath}`,
    "",
    `Auto-detected patterns that represent important rules and constraints.`,
    "",
    `**Source:** ${relativePath}`,
    `**Patterns found:** ${patterns.length}`,
    "",
    "## Patterns",
    "",
  ]

  for (const p of patterns) {
    lines.push(`### Line ${p.line}: ${p.pattern}`)
    lines.push("")
    lines.push("```")
    lines.push(p.context)
    lines.push("```")
    lines.push("")
  }

  return lines.join("\n")
}

function extractTags(sourceFile: string): string[] {
  const tags: string[] = []

  if (sourceFile.includes("AGENTS.md")) {
    tags.push("agents-md")
  }
  if (sourceFile.includes("CLAUDE.md")) {
    tags.push("claude-md")
  }
  if (sourceFile.includes(".cursor/rules")) {
    tags.push("cursor-rules")
  }
  if (sourceFile.includes("copilot-instructions")) {
    tags.push("copilot")
  }
  if (sourceFile.includes(".windsurf/rules")) {
    tags.push("windsurf")
  }
  if (sourceFile.includes(".codex")) {
    tags.push("codex")
  }

  return tags
}

export const INSTRUCTION_PATTERN_MARKERS = {
  MUST: "MUST",
  MUST_NOT: "MUST NOT",
  ALWAYS: "ALWAYS",
  NEVER: "NEVER",
  CRITICAL: "CRITICAL",
  IMPORTANT: "IMPORTANT",
  REQUIRED: "REQUIRED",
  FORBIDDEN: "FORBIDDEN",
  MANDATORY: "MANDATORY",
  ESSENTIAL: "ESSENTIAL",
  DO_NOT: "DO NOT",
  SHOULD_ALWAYS: "SHOULD ALWAYS",
  SHOULD_NEVER: "SHOULD NEVER",
} as const

export type InstructionPatternMarker = (typeof INSTRUCTION_PATTERN_MARKERS)[keyof typeof INSTRUCTION_PATTERN_MARKERS]

export function categorizePattern(pattern: string): string {
  const upper = pattern.toUpperCase()

  if (upper.includes("MUST") && upper.includes("NOT")) return "prohibition"
  if (upper.includes("MUST")) return "requirement"
  if (upper.includes("NEVER")) return "prohibition"
  if (upper.includes("ALWAYS")) return "requirement"
  if (upper.includes("FORBIDDEN")) return "prohibition"
  if (upper.includes("DO NOT")) return "prohibition"
  if (upper.includes("SHOULD NEVER")) return "prohibition"
  if (upper.includes("CRITICAL")) return "critical"
  if (upper.includes("IMPORTANT")) return "important"
  if (upper.includes("REQUIRED")) return "requirement"
  if (upper.includes("MANDATORY")) return "requirement"
  if (upper.includes("ESSENTIAL")) return "requirement"

  return "guideline"
}
