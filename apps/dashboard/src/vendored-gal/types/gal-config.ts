/**
 * GAL Config Schema - Canonical format for .gal/config.yaml
 *
 * This is the platform-agnostic source of truth for AI agent configurations.
 * The GAL CLI reads this format and converts it to platform-specific formats
 * (Claude Code, Cursor, Copilot, Gemini CLI, Codex, Windsurf).
 *
 * @see https://github.com/Scheduler-Systems/gal-run-private/issues/666
 */

/**
 * Supported AI coding agent platforms — derived from platform registry (Issue #2821)
 */
import type { PlatformId } from './platform-registry.js';
export type GalPlatform = PlatformId;

/**
 * Root GAL configuration file schema
 * Stored in .gal/config.yaml
 */
export interface GalConfig {
  /** Schema version for forward compatibility */
  version: 1

  /** Organization that approved this config */
  organization: string

  /** Human-readable policy name (e.g., "Production Safe Policy") */
  policyName?: string

  /** When this config was last synced from org */
  syncedAt: string

  /** Hash of the approved config for drift detection */
  hash: string

  /** Approved config version from organization */
  configVersion: string

  /** Main project instructions (becomes CLAUDE.md, .cursorrules, etc.) */
  instructions?: GalInstructions

  /** Slash commands / skills */
  commands?: GalCommand[]

  /** Subagents / custom agents */
  agents?: GalAgent[]

  /** Context rules (auto-loaded based on file paths) */
  rules?: GalRule[]

  /** Lifecycle hooks */
  hooks?: GalHook[]

  /** Tool/permission settings */
  settings?: GalSettings

  /** MCP server configurations */
  mcp?: GalMcpConfig

  /** Environment configuration for runner setup phase (#4380) */
  environment?: GalEnvironment

  /** Persistent learnings / memory (Issue #2851 — cross-provider memory sync) */
  memory?: GalMemory[]
}

/**
 * Main project instructions
 * Converted to: CLAUDE.md, .cursorrules, copilot-instructions.md, GEMINI.md, AGENTS.md
 */
export interface GalInstructions {
  /** The instruction content (markdown) */
  content: string

  /** Source repository (for tracking) */
  sourceRepo?: string

  /** Source file path (for tracking) */
  sourcePath?: string
}

/**
 * Slash command definition
 * Converted to platform-specific command formats
 */
export interface GalCommand {
  /** Command name (without leading slash) */
  name: string

  /** Human-readable description */
  description?: string

  /** Command content/template (markdown) */
  content: string

  /** Tools this command is allowed to use */
  allowedTools?: string[]

  /** Source repository */
  sourceRepo?: string

  /** Source file path */
  sourcePath?: string
}

/**
 * Subagent / custom agent definition
 */
export interface GalAgent {
  /** Agent name */
  name: string

  /** Human-readable description */
  description?: string

  /** Agent prompt/instructions (markdown) */
  content: string

  /** Tools this agent can use */
  tools?: string[]

  /** Source repository */
  sourceRepo?: string

  /** Source file path */
  sourcePath?: string
}

/**
 * Context rule definition
 * Auto-loaded based on file path patterns
 */
export interface GalRule {
  /** Rule name */
  name: string

  /** Human-readable description */
  description?: string

  /** Rule content (markdown) */
  content: string

  /** File path patterns that trigger this rule (glob) */
  paths?: string[]

  /** Always apply this rule regardless of context */
  alwaysApply?: boolean

  /** Source repository */
  sourceRepo?: string

  /** Source file path */
  sourcePath?: string
}

/**
 * Lifecycle hook definition
 */
export interface GalHook {
  /** Hook name */
  name: string

  /** Event that triggers this hook */
  event: GalHookEvent

  /** Hook script content */
  content: string

  /** Script language/runtime */
  runtime?: 'node' | 'python' | 'bash'

  /** Source repository */
  sourceRepo?: string

  /** Source file path */
  sourcePath?: string
}

/**
 * Hook trigger events
 */
export type GalHookEvent =
  | 'SessionStart'
  | 'SessionEnd'
  | 'PreToolUse'
  | 'PostToolUse'
  | 'PreCommit'
  | 'PostCommit'

/**
 * Tool and permission settings
 */
export interface GalSettings {
  /** Model to use (if supported by platform) */
  model?: string

  /** Maximum tokens per request */
  maxTokens?: number

  /** Tool permissions */
  permissions?: GalPermissions

  /** Platform-specific settings (pass-through) */
  platformOverrides?: Partial<Record<GalPlatform, Record<string, unknown>>>
}

/**
 * Tool permission settings
 */
export interface GalPermissions {
  /** Allow bash/terminal execution */
  allowBash?: boolean

  /** File read patterns (glob) */
  allowRead?: string[]

  /** File write patterns (glob) */
  allowWrite?: string[]

  /** Denied write patterns (glob) - takes precedence */
  denyWrite?: string[]

  /** Allowed network hosts */
  allowNetwork?: string[]

  /** Denied network hosts - takes precedence */
  denyNetwork?: string[]
}

/**
 * MCP (Model Context Protocol) server configuration
 */
export interface GalMcpConfig {
  /** MCP servers to enable */
  servers?: GalMcpServer[]
  /** GAL-native inbuilt server names to disable (e.g. ['gal-browser', 'gal-cli']) */
  disabledInbuiltServers?: string[]
}

/**
 * Individual MCP server configuration
 */
export interface GalMcpServer {
  /** Server name */
  name: string

  /** Server command to run */
  command: string

  /** Command arguments */
  args?: string[]

  /** Environment variables */
  env?: Record<string, string>
}

// =============================================================================
// Environment Configuration (runner setup phase)
// =============================================================================

/**
 * Environment configuration for runner setup phase.
 * Secrets are injected during setup, stripped before agent execution.
 * @see infra#1277 for the runner-side implementation
 */
export interface GalEnvironment {
  /** Secret references resolved from Secrets API during dispatch */
  secrets?: GalEnvironmentSecret[]

  /**
   * User-scoped interactive auth references resolved during dispatch.
   *
   * Unlike general environment secrets, these references must resolve to a
   * secret owned by the requesting user. They are intended for interactive
   * auth state such as G-Cloud ADC / OAuth files and future CLI auth bundles.
   */
  auth?: GalEnvironmentAuthRef[]

  /** Commands to run during setup phase (has access to secrets) */
  setup?: string[]

  /** Install command (runs after setup, e.g., 'npm install') */
  install?: string

  /** Whether to strip raw secrets after setup completes (default: true) */
  stripAfterSetup?: boolean
}

export interface GalEnvironmentSecret {
  /** Secret name (used as env var name and filename) */
  name: string

  /** Reference to Secrets API entry (e.g., 'secrets/gcp-sa-key') */
  source: string

  /** How to inject: 'file' writes to /tmp/.gal-secrets/{name}, 'env' sets env var */
  type?: 'file' | 'env'
}

/**
 * Interactive auth reference for runner setup.
 *
 * These refs are intentionally modeled separately from general secrets so
 * dispatch can enforce same-user ownership. `kind` identifies the auth flow
 * and `envNames` allows future providers to map a single secret payload onto
 * one or more environment variables.
 */
export interface GalEnvironmentAuthRef {
  /** First-class auth type identifier, e.g. "gcloud-adc" */
  kind: string

  /** Reference to Secrets API entry (e.g. 'secrets/gcloud-adc') */
  source: string

  /** Environment variable names that should point at the injected auth payload */
  envNames?: string[]

  /** Injection mode for the auth payload (defaults to 'file') */
  type?: 'file' | 'env'
}

// =============================================================================
// Memory / Learnings (stored in .gal/memory/)
// =============================================================================

/**
 * Memory entry — a persistent learning that GAL syncs across providers.
 *
 * Memory types mirror Claude Code's auto-memory categories:
 *  - user:      Who the developer is, preferences, expertise
 *  - feedback:  Corrections ("don't mock the DB", "use snake_case here")
 *  - project:   Ongoing work context, deadlines, decisions
 *  - reference: Pointers to external systems (Linear, Grafana, Slack)
 *
 * During sync, memories are translated to each provider's native format:
 *  - Claude:       .claude/memory/*.md (with YAML frontmatter)
 *  - Cursor:       .cursor/rules/*.mdc (as alwaysApply rules)
 *  - Copilot:      Appended to .github/copilot-instructions.md
 *  - Gemini:       Appended to GEMINI.md
 *  - Codex:        .codex/memory/MEMORY.md (plus AGENTS.md guidance)
 *  - Windsurf:     .windsurf/rules/*.md (as manual rules)
 *  - Amp:          Appended to AGENT.md
 *  - Antigravity:  .antigravity/rules.md (appended)
 */
export interface GalMemory {
  /** Memory entry name (used as filename stem, e.g., "feedback_testing") */
  name: string

  /** One-line description — used to decide relevance in future sessions */
  description: string

  /** Memory category */
  type: GalMemoryType

  /** Memory content (markdown) */
  content: string

  /** Which provider originally captured this memory */
  source?: GalPlatform

  /** When this memory was captured */
  capturedAt?: string

  /** When this memory was last updated */
  updatedAt?: string
}

/**
 * Memory types — based on Claude Code's auto-memory categories
 */
export type GalMemoryType = 'user' | 'feedback' | 'project' | 'reference'

// =============================================================================
// Sync State (stored in .gal/sync-state.json)
// =============================================================================

/**
 * Sync state tracking for drift detection
 * Stored in .gal/sync-state.json
 */
export interface GalSyncState {
  /** When config was last synced */
  lastSyncTimestamp: string

  /** Hash of last synced config */
  lastSyncHash: string

  /** Hash of approved config from org */
  approvedConfigHash: string

  /** When sync status was last checked */
  lastCheckTimestamp: string

  /** Organization name */
  organization: string

  /** Config version */
  version: string

  /** Policy name for display */
  policyName?: string

  /** List of files synced (relative paths) */
  syncedFiles?: string[]

  /** Platforms that were synced */
  syncedPlatforms?: GalPlatform[]

  /** Hook reminder settings from org */
  hookSettings?: {
    globalIntervalMinutes?: number
    intervals?: Record<string, number>
  }
}

// =============================================================================
// Platform Output (stored in .gal/platforms/{platform}/)
// =============================================================================

/**
 * Generated platform-specific config bundle
 * Stored in .gal/platforms/{platform}/
 */
export interface GalPlatformBundle {
  /** Target platform */
  platform: GalPlatform

  /** When this bundle was generated */
  generatedAt: string

  /** Source config hash (for cache invalidation) */
  sourceHash: string

  /** Files in this bundle */
  files: GalPlatformFile[]
}

/**
 * Individual file in a platform bundle
 */
export interface GalPlatformFile {
  /** Relative path within platform directory */
  path: string

  /** File content */
  content: string

  /** Content hash for drift detection */
  hash: string
}

// =============================================================================
// Status & Drift Detection (for `gal status` command)
// =============================================================================

/**
 * Result of drift detection between .gal/platforms/ and native locations
 * Used by `gal status` command
 */
export interface StatusResult {
  /** Whether .gal/config.yaml exists (synced at least once) */
  synced: boolean

  /** When config was last synced */
  syncedAt?: string

  /** Organization name */
  organization?: string

  /** Config version */
  configVersion?: string

  /** Policy name for display */
  policyName?: string

  /** Whether any files have drifted from canonical */
  driftDetected: boolean

  /** List of files that have drifted */
  driftFiles: DriftFile[]

  /** Whether a newer config version is available */
  updateAvailable: boolean

  /** Latest version available from org */
  latestVersion?: string
}

/**
 * Individual file with detected drift
 */
export interface DriftFile {
  /** File path (relative to project root) */
  path: string

  /** Type of drift detected */
  type: 'modified' | 'missing' | 'extra'

  /** Platform this file belongs to */
  platform: GalPlatform

  /** Expected content hash (from .gal/platforms/) */
  expectedHash?: string

  /** Actual content hash (from native location) */
  actualHash?: string
}

// =============================================================================
// Regenerate Result (for `gal sync --regenerate`)
// =============================================================================

/**
 * Result of regenerating platform configs from canonical
 * Used by `gal sync --regenerate` command
 */
export interface RegenerateResult {
  /** Platforms that were regenerated */
  regeneratedPlatforms: GalPlatform[]

  /** Number of files written */
  filesWritten: number

  /** When regeneration occurred */
  regeneratedAt: string

  /** Config version used for regeneration */
  fromConfigVersion: string
}

/**
 * Options for regenerateFromCanonical method
 */
export interface RegenerateOptions {
  /** Specific platforms to regenerate (defaults to all) */
  platforms?: GalPlatform[]
}

// =============================================================================
// Gitignore Suggestion (for `gal sync --pull` post-action)
// =============================================================================

/**
 * Suggestion for adding .gal/ to .gitignore
 * Returned when .gal/ is created and not already in .gitignore
 */
export interface GitignoreSuggestion {
  /** Whether to suggest adding .gal/ to .gitignore */
  suggested: boolean

  /** Path to .gitignore file */
  gitignorePath: string

  /** Entry to add (typically ".gal/") */
  entryToAdd: string

  /** Human-readable reason for suggestion */
  reason: string

  /** Whether .gal/ is already in .gitignore */
  alreadyPresent: boolean
}
