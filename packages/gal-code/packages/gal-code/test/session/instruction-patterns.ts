export {
  InstructionPatternSync,
  categorizePattern,
  INSTRUCTION_PATTERN_MARKERS,
} from "../../src/session/instruction-patterns"

export function extractTags(sourceFile: string): string[] {
  return [
    sourceFile.includes("AGENTS.md") ? "agents-md" : undefined,
    sourceFile.includes("CLAUDE.md") ? "claude-md" : undefined,
    sourceFile.includes(".cursor/rules") ? "cursor-rules" : undefined,
    sourceFile.includes("copilot-instructions") ? "copilot" : undefined,
    sourceFile.includes(".windsurf/rules") ? "windsurf" : undefined,
    sourceFile.includes(".codex") ? "codex" : undefined,
  ].filter((tag): tag is string => !!tag)
}
