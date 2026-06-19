import type {
  ConfigVersion,
  EnforcementSettings,
  GalEnvironment,
} from '@gal/types'

/**
 * Source status for orphan detection (#4830)
 * - "active": source file exists (default; undefined also means active)
 * - "source_deleted": source file was deleted from the repo
 */
export type SourceStatus = 'active' | 'source_deleted'

/**
 * Approved Configuration item
 * Platform-agnostic config bundle
 */
export interface ApprovedConfigItem {
  name: string
  content: string
  sourceRepo?: string
  sourcePath?: string
  hash: string
  /** Orphan detection status (#4830). undefined === active */
  sourceStatus?: SourceStatus
  /** ISO 8601 timestamp when sourceStatus transitioned to "source_deleted" (#4830) */
  sourceDeletedAt?: string
}

export interface ReleaseGateDeployWorkflowConfig {
  repo: string
  workflow: string
  trigger?: 'workflow_dispatch'
}

export interface ReleaseGateVerificationConfig {
  /**
   * Human-readable checklist gates appended to release issues.
   * Example: ["Production verified", "CLI package verified"]
   */
  gates?: string[]
  autoCloseOnComplete?: boolean
}

export interface ReleaseGateConfig {
  enabled?: boolean
  testPlanSection?: string
  autoCreateReleaseIssue?: boolean
  deployWorkflow?: ReleaseGateDeployWorkflowConfig | null
  verification?: ReleaseGateVerificationConfig | null
}

/**
 * Approved Configuration
 * Supports multiple config types: CLAUDE.md, Commands, Hooks, Settings, Subagents
 * Platform-agnostic with platform-specific fields
 */
export interface ApprovedConfig {
  platform: string
  hash: string // Overall bundle hash
  version: string
  approvedAt: string
  approvedBy: string
  policyName?: string // Custom name for the policy (e.g., "production-safe policy")

  // Platform instruction file (CLAUDE.md, GEMINI.md, AGENTS.md, etc.)
  instructions?: {
    content: string
    sourceRepo?: string
    sourcePath?: string
    hash: string
  } | null
  commands?: ApprovedConfigItem[]
  hooks?: ApprovedConfigItem[]
  settings?: {
    content: string // JSON string
    sourceRepo?: string
    sourcePath?: string
    hash: string
  } | null
  subagents?: ApprovedConfigItem[]
  skills?: ApprovedConfigItem[]

  // Cursor-specific fields (GAL-395)
  rules?: ApprovedConfigItem[]
  cursorRules?: {
    content: string
    sourceRepo?: string
    sourcePath?: string
    hash: string
  } | null

  // Copilot-specific fields (GAL-395)
  copilotInstructions?: {
    content: string
    sourceRepo?: string
    sourcePath?: string
    hash: string
  } | null
  copilotPathInstructions?: ApprovedConfigItem[]
  copilotAgents?: ApprovedConfigItem[]
  copilotSkills?: ApprovedConfigItem[]

  // Windsurf-specific fields
  windsurfRules?: {
    content: string
    sourceRepo?: string
    sourcePath?: string
    hash: string
  } | null

  // MCP server configuration
  mcp?: {
    content: string  // JSON string of .mcp.json content
    sourceRepo?: string
    sourcePath?: string
    hash: string
  } | null

  // Unified enforcement rule source (Level 0)
  enforcement?: {
    content: string
    sourceRepo?: string
    sourcePath?: string
    hash: string
  } | null

  // Release gate configuration (#6091)
  releaseGate?: ReleaseGateConfig | null

  // Runner setup/auth configuration
  environment?: GalEnvironment | null
  enforcementSettings?: Partial<EnforcementSettings> | null

  // Subcollection counts (for configs > 1MB)
  commandCount?: number
  subagentCount?: number
  skillCount?: number
  ruleCount?: number
}


/**
 * Config Policy
 * Named policy that wraps an ApprovedConfig
 * Multiple policies can exist per org, but only one is active at a time
 */
export interface ConfigPolicy {
  id: string
  name: string
  description?: string
  isActive: boolean
  isBuiltin?: boolean
  createdAt: string
  updatedAt: string
  createdBy: string
  config: Omit<ApprovedConfig, 'policyName'>
}

/**
 * Config repository interface
 * Handles approved configurations and their versioning
 * Implementations: FirestoreConfigRepository (API)
 */
export interface IConfigRepository {
  // ─────────────────────────────────────────────────────────────────
  // Approved Config Operations
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get approved config for an organization and platform
   * Reads from subcollections if they exist (for configs > 1MB)
   */
  getApprovedConfig(
    orgName: string,
    platform?: string
  ): Promise<ApprovedConfig | null>

  /**
   * Set approved config for an organization and platform
   * Uses subcollections for commands/subagents/rules to avoid Firestore 1MB limit
   */
  setApprovedConfig(orgName: string, config: ApprovedConfig): Promise<void>

  /**
   * Get all approved configs for an organization
   * Fetches subcollection data (commands, subagents, skills, rules) for each config
   */
  getAllApprovedConfigs(orgName: string): Promise<ApprovedConfig[]>

  /**
   * Delete approved config for an organization and platform
   */
  deleteApprovedConfig(orgName: string, platform: string): Promise<void>

  // ─────────────────────────────────────────────────────────────────
  // Version Management
  // ─────────────────────────────────────────────────────────────────

  /**
   * Create a config version atomically using a Firestore transaction
   * Returns the version number
   */
  createConfigVersion(
    version: Omit<ConfigVersion, 'id'>
  ): Promise<number>

  /**
   * Get config version by number
   */
  getConfigVersionByNumber(
    scopeId: string,
    scope: 'org' | 'project',
    version: number
  ): Promise<ConfigVersion | null>

  /**
   * Get config version history
   */
  getConfigVersionHistory(
    scopeId: string,
    scope: 'org' | 'project'
  ): Promise<ConfigVersion[]>

  /**
   * Get active config version
   */
  getActiveConfigVersion(
    scopeId: string,
    scope: 'org' | 'project'
  ): Promise<ConfigVersion | null>

  /**
   * Update version status (e.g., mark as superseded)
   */
  updateConfigVersionStatus(
    id: string,
    status: 'active' | 'superseded'
  ): Promise<void>

  // ─────────────────────────────────────────────────────────────────
  // Policy Management Operations
  // ─────────────────────────────────────────────────────────────────

  /**
   * List all policies for an organization
   */
  listPolicies(orgName: string): Promise<ConfigPolicy[]>

  /**
   * Get a specific policy by ID
   */
  getPolicy(orgName: string, policyId: string): Promise<ConfigPolicy | null>

  /**
   * Create a new policy
   */
  createPolicy(
    orgName: string,
    policy: Omit<ConfigPolicy, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<ConfigPolicy>

  /**
   * Update an existing policy
   */
  updatePolicy(
    orgName: string,
    policyId: string,
    updates: Partial<Pick<ConfigPolicy, 'name' | 'description' | 'config'>>
  ): Promise<void>

  /**
   * Delete a policy (cannot delete active policy)
   */
  deletePolicy(orgName: string, policyId: string): Promise<void>

  /**
   * Activate a policy (deactivates current active, copies config to approved-configs)
   */
  activatePolicy(orgName: string, policyId: string): Promise<void>
}
