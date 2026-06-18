import { describe, it, expect } from "bun:test"
import { Effect } from "effect"
import {
  InstructionPatternSync,
  extractTags,
  categorizePattern,
  INSTRUCTION_PATTERN_MARKERS,
} from "./instruction-patterns"

const mockPatterns = `
# Test AGENTS.md

You MUST always run tests before committing.
You MUST NOT commit secrets to the repository.
ALWAYS check for edge cases in error handling.
NEVER skip the type checker.
You SHOULD ALWAYS document public APIs.
DO NOT use any type unless absolutely necessary.
CRITICAL: Review all security-sensitive code changes.
IMPORTANT: Keep functions under 50 lines.
REQUIRED: All PRs must have at least one review.
FORBIDDEN: No direct database access from frontend.
MANDATORY: Use TypeScript strict mode.
ESSENTIAL: Handle all promise rejections.
`

function detect(content: string, file = "AGENTS.md") {
  return Effect.runPromise(
    Effect.gen(function* () {
      const service = yield* InstructionPatternSync.Service
      return yield* service.detectPatterns(content, file)
    }).pipe(Effect.provide(InstructionPatternSync.defaultLayer)),
  )
}

describe("InstructionPatternSync", () => {
  describe("detectPatterns", () => {
    it("detects MUST patterns", async () => {
      const content = "You MUST always run tests."
      const patterns = await detect(content)
      expect(patterns.length).toBeGreaterThan(0)
      expect(patterns.some(p => p.pattern.toUpperCase() === "MUST")).toBe(true)
    })

    it("detects NEVER patterns", async () => {
      const content = "NEVER skip tests."
      const patterns = await detect(content)
      expect(patterns.length).toBeGreaterThan(0)
      expect(patterns.some(p => p.pattern.toUpperCase() === "NEVER")).toBe(true)
    })

    it("detects ALWAYS patterns", async () => {
      const content = "ALWAYS check your code."
      const patterns = await detect(content)
      expect(patterns.length).toBeGreaterThan(0)
      expect(patterns.some(p => p.pattern.toUpperCase() === "ALWAYS")).toBe(true)
    })

    it("detects multiple patterns in one line", async () => {
      const content = "You MUST ALWAYS run tests - NEVER skip them."
      const patterns = await detect(content)
      expect(patterns.length).toBeGreaterThanOrEqual(2)
    })

    it("includes context lines around the pattern", async () => {
      const content = "Line 1\nLine 2\nMUST do this\nLine 4\nLine 5"
      const patterns = await detect(content)
      expect(patterns.length).toBeGreaterThan(0)
      expect(patterns[0].context).toContain("Line 1")
      expect(patterns[0].context).toContain("Line 5")
    })

    it("generates unique hashes for different patterns", async () => {
      const content = "MUST do X\nMUST do Y"
      const patterns = await detect(content)
      expect(patterns.length).toBe(2)
      expect(patterns[0].hash).not.toBe(patterns[1].hash)
    })
  })

  describe("extractTags", () => {
    it("extracts tags for AGENTS.md", () => {
      const tags = extractTags("/project/AGENTS.md")
      expect(tags).toContain("agents-md")
    })

    it("extracts tags for CLAUDE.md", () => {
      const tags = extractTags("/project/CLAUDE.md")
      expect(tags).toContain("claude-md")
    })

    it("extracts tags for .cursor/rules", () => {
      const tags = extractTags("/project/.cursor/rules")
      expect(tags).toContain("cursor-rules")
    })

    it("extracts tags for copilot instructions", () => {
      const tags = extractTags("/project/.github/copilot-instructions.md")
      expect(tags).toContain("copilot")
    })

    it("extracts tags for windsurf rules", () => {
      const tags = extractTags("/project/.windsurf/rules")
      expect(tags).toContain("windsurf")
    })

    it("extracts tags for codex", () => {
      const tags = extractTags("/project/.codex/AGENTS.md")
      expect(tags).toContain("codex")
    })
  })

  describe("categorizePattern", () => {
    it("categorizes MUST as requirement", () => {
      expect(categorizePattern("MUST")).toBe("requirement")
    })

    it("categorizes NEVER as prohibition", () => {
      expect(categorizePattern("NEVER")).toBe("prohibition")
    })

    it("categorizes MUST NOT as prohibition", () => {
      expect(categorizePattern("MUST NOT")).toBe("prohibition")
    })

    it("categorizes CRITICAL as critical", () => {
      expect(categorizePattern("CRITICAL")).toBe("critical")
    })

    it("categorizes FORBIDDEN as prohibition", () => {
      expect(categorizePattern("FORBIDDEN")).toBe("prohibition")
    })

    it("categorizes DO NOT as prohibition", () => {
      expect(categorizePattern("DO NOT")).toBe("prohibition")
    })

    it("categorizes ALWAYS as requirement", () => {
      expect(categorizePattern("ALWAYS")).toBe("requirement")
    })
  })
})

describe("INSTRUCTION_PATTERN_MARKERS", () => {
  it("exports all expected markers", () => {
    expect(INSTRUCTION_PATTERN_MARKERS.MUST).toBe("MUST")
    expect(INSTRUCTION_PATTERN_MARKERS.NEVER).toBe("NEVER")
    expect(INSTRUCTION_PATTERN_MARKERS.ALWAYS).toBe("ALWAYS")
    expect(INSTRUCTION_PATTERN_MARKERS.CRITICAL).toBe("CRITICAL")
    expect(INSTRUCTION_PATTERN_MARKERS.FORBIDDEN).toBe("FORBIDDEN")
    expect(INSTRUCTION_PATTERN_MARKERS.MANDATORY).toBe("MANDATORY")
  })
})
