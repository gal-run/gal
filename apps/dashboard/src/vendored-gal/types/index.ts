// Core types for GAL system - Multi-platform AI agent configurations

// ── Legal URLs — single source of truth (#3350) ──────────────────────────
export const GAL_TERMS_URL = 'https://scheduler-systems.com/legal/en/gal-terms.pdf';
export const GAL_PRIVACY_URL = 'https://scheduler-systems.com/legal/en/gal-privacy.pdf';

// Platform Registry — single source of truth (Issue #2821)
export * from './platform-registry.js';
import type { PlatformId } from './platform-registry.js';
import { PLATFORM_DIRECTORY_MAP } from './platform-registry.js';
import type { GalEnvironment } from './gal-config.js';

// Supported AI coding agent platforms — derived from platform registry
export type AgentPlatform = PlatformId;

// Platform configuration directories — derived from platform registry
export const PLATFORM_DIRECTORIES: Record<AgentPlatform, string> = PLATFORM_DIRECTORY_MAP;

// Platform-specific config patterns
export interface PlatformConfigPattern {
  platform: AgentPlatform;
  directory: string;
  settingsFile: string;
  rulesDir: string;
  rulesFile?: string; // Single root-level rules file (e.g., .antigravity/rules.md)
  hooksDir?: string; // Platform hook directory when hooks are file-based
  hooksConfigFile?: string; // Hook config file (e.g., hooks.json)
  commandsDir?: string; // Commands directory (Claude, Cursor, Gemini)
  agentsDir?: string; // Agents/subagents directory (Claude, Copilot, Cursor, Gemini, Codex)
  claudeMdFile?: string; // Claude-specific (CLAUDE.md at repo root)
  claudeLocalMdFile?: string; // Claude-specific (CLAUDE.local.md at repo root)
  geminiMdFile?: string; // Gemini-specific (GEMINI.md at repo root)
  agentsMdFile?: string; // OpenSpec AGENTS.md (Copilot/Codex at repo root)
  agentMdFile?: string; // Amp-specific (AGENT.md at repo root)
  agentLocalMdFile?: string; // Amp-specific (AGENT.local.md at repo root)
  cursorRulesFile?: string; // Cursor-specific (.cursorrules legacy file at repo root)
  windsurfRulesFile?: string; // Windsurf-specific (.windsurfrules legacy file at repo root)
  mcpFile?: string; // MCP config file path (e.g., .mcp.json, .cursor/mcp.json, .vscode/mcp.json)
  configFile?: string; // Platform-specific config (e.g., config.toml for Codex)
  cliConfigFile?: string; // CLI config file (e.g., .cursor/cli.json)
  // Copilot-specific patterns
  copilotInstructionsFile?: string; // Copilot (.github/copilot-instructions.md)
  instructionsDir?: string; // Copilot path-specific instructions (.github/instructions/)
  skillsDir?: string; // Skills directory (Copilot, Claude, Cursor, Gemini, Antigravity)
  policiesDir?: string; // Policies directory (Gemini)
  workflowsDir?: string; // Workflows directory (Windsurf)
  promptsDir?: string; // Prompts directory (Copilot: .github/prompts/)
  ignoreFile?: string; // Ignore file at repo root (.codeiumignore, .geminiignore)
  memoryDir?: string; // Memory/learnings directory (e.g., .claude/memory/, .windsurf/memories/)
  memoryExtensions?: string[]; // File extensions for memory files
  ruleExtensions: string[];
}

export const PLATFORM_PATTERNS: Record<AgentPlatform, PlatformConfigPattern> = {
  claude: {
    platform: 'claude',
    directory: '.claude',
    settingsFile: 'settings.json',
    rulesDir: 'rules',
    hooksDir: 'hooks',
    commandsDir: 'commands',
    agentsDir: 'agents',
    skillsDir: 'skills', // .claude/skills/*/SKILL.md
    memoryDir: 'memory', // .claude/memory/ (auto-memory, MEMORY.md index)
    memoryExtensions: ['.md'],
    claudeMdFile: 'CLAUDE.md',
    claudeLocalMdFile: 'CLAUDE.local.md', // Local override at repo root
    mcpFile: '.mcp.json',
    ruleExtensions: ['.md'],
  },
  cursor: {
    platform: 'cursor',
    directory: '.cursor',
    settingsFile: 'settings.json',
    rulesDir: 'rules',
    hooksDir: 'hooks',
    hooksConfigFile: 'hooks.json', // .cursor/hooks.json
    commandsDir: 'commands', // .cursor/commands/*.md
    agentsDir: 'agents', // .cursor/agents/*.md
    skillsDir: 'skills', // .cursor/skills/*/SKILL.md
    cliConfigFile: 'cli.json', // .cursor/cli.json
    cursorRulesFile: '.cursorrules', // Root-level legacy rules file
    mcpFile: '.cursor/mcp.json', // Issue #2462: Cursor MCP config
    ruleExtensions: ['.mdc', '.md'],
  },
  copilot: {
    platform: 'copilot',
    directory: '.github',
    settingsFile: '', // Copilot doesn't have a settings.json (uses VS Code settings)
    rulesDir: 'instructions', // .github/instructions/*.instructions.md
    agentsDir: 'agents', // .github/agents/*.agent.md
    skillsDir: 'skills', // .github/skills/*/SKILL.md
    promptsDir: 'prompts', // .github/prompts/*.prompt.md
    hooksDir: 'hooks', // .github/hooks/*.sh
    copilotInstructionsFile: 'copilot-instructions.md', // .github/copilot-instructions.md
    instructionsDir: 'instructions', // Path-specific instructions
    agentsMdFile: 'AGENTS.md', // OpenSpec agent instructions (repo root)
    mcpFile: '.vscode/mcp.json', // Issue #2462: Copilot MCP config (uses "servers" key)
    ruleExtensions: ['.instructions.md', '.md'],
  },
  gemini: {
    platform: 'gemini',
    directory: '.gemini',
    settingsFile: 'settings.json',
    rulesDir: 'rules',
    hooksDir: 'hooks',
    commandsDir: 'commands', // .gemini/commands/*.toml
    agentsDir: 'agents', // .gemini/agents/*.md
    policiesDir: 'policies', // .gemini/policies/*.toml
    skillsDir: 'skills', // .gemini/skills/*/SKILL.md
    geminiMdFile: 'GEMINI.md', // Gemini project instructions (repo root)
    ignoreFile: '.geminiignore', // Gemini ignore file at repo root
    ruleExtensions: ['.md'],
  },
  codex: {
    platform: 'codex',
    directory: '.codex',
    settingsFile: '', // Codex uses config.toml, not settings.json
    configFile: 'config.toml', // .codex/config.toml
    rulesDir: 'rules',
    agentsDir: 'agents', // .codex/agents/*.toml
    agentsMdFile: 'AGENTS.md', // OpenSpec agent instructions (repo root)
    memoryDir: 'memory', // .codex/memory/ (canonical memory for Codex sessions)
    memoryExtensions: ['.md'],
    ruleExtensions: ['.md'],
  },
  windsurf: {
    platform: 'windsurf',
    directory: '.windsurf',
    settingsFile: 'settings.json',
    rulesDir: 'rules',
    hooksDir: 'hooks',
    hooksConfigFile: 'hooks.json', // .windsurf/hooks.json
    workflowsDir: 'workflows', // .windsurf/workflows/*.md
    memoryDir: 'memories', // .windsurf/memories/ (auto-captured learnings)
    memoryExtensions: ['.md', '.json'],
    windsurfRulesFile: '.windsurfrules', // Root-level legacy rules file
    ignoreFile: '.codeiumignore', // Codeium/Windsurf ignore file at repo root
    ruleExtensions: ['.md'],
  },
  antigravity: {
    platform: 'antigravity',
    directory: '.antigravity',
    settingsFile: '',
    rulesDir: 'rules',
    rulesFile: 'rules.md', // .antigravity/rules.md (single root-level rules file)
    skillsDir: 'skills', // .antigravity/skills/*/SKILL.md
    ruleExtensions: ['.md'],
  },
  amp: {
    platform: 'amp',
    directory: '.amp',
    settingsFile: '',
    rulesDir: '',
    agentMdFile: 'AGENT.md', // Amp primary instruction file (repo root)
    agentLocalMdFile: 'AGENT.local.md', // Amp local override (repo root)
    ruleExtensions: ['.md'],
  },
  'ai-studio': {
    platform: 'ai-studio',
    directory: '.ai-studio',
    settingsFile: '',
    rulesDir: '',
    ruleExtensions: [],
  },
  'codex-cloud': {
    platform: 'codex-cloud',
    directory: '.codex',
    settingsFile: '',
    rulesDir: '',
    ruleExtensions: [],
  },
  kling: {
    platform: 'kling',
    directory: '.kling',
    settingsFile: '',
    rulesDir: '',
    ruleExtensions: [],
  },
  higgsfield: {
    platform: 'higgsfield',
    directory: '.higgsfield',
    settingsFile: '',
    rulesDir: '',
    ruleExtensions: [],
  },
  jules: {
    platform: 'jules',
    directory: '.jules',
    settingsFile: '',
    rulesDir: '',
    ruleExtensions: [],
  },
  'gal-code': {
    platform: 'gal-code',
    directory: '.',
    settingsFile: '',
    rulesDir: '',
    mcpFile: 'gal-code.json',
    ruleExtensions: ['.md'],
  },
};

// Generic agent config (platform-agnostic)
export interface AgentConfig {
  platform: AgentPlatform;
  settings?: AgentSettings;
  rules: AgentRule[];
  commands: AgentCommand[]; // Claude-specific
  hooks: AgentHook[]; // Claude-specific
}

export interface AgentSettings {
  platform: AgentPlatform;
  fileName: string;
  content: string;
  storageUrl?: string;
  version: number;
  repoName: string;
}

export interface AgentRule {
  platform: AgentPlatform;
  name: string;
  fileName: string;
  content: string;
  storageUrl?: string;
  version: number;
  repoName: string;
}

export interface AgentCommand {
  platform: AgentPlatform;
  name: string;
  fileName: string;
  content: string;
  storageUrl?: string;
  version: number;
  repoName: string;
}

export interface AgentHook {
  platform: AgentPlatform;
  name: string;
  fileName: string;
  type: 'pre_tool_use' | 'post_tool_use' | 'pre_prompt' | 'post_prompt';
  content: string;
  storageUrl?: string;
  version: number;
  repoName: string;
}

export interface AgentSubagent {
  platform: AgentPlatform;
  name: string;
  fileName: string;
  content: string;
  storageUrl?: string;
  version: number;
  repoName: string;
}

export interface AgentInstructions {
  platform: AgentPlatform;
  fileName: string;
  content: string;
  storageUrl?: string;
  version: number;
  repoName: string;
}

export interface AgentCursorRules {
  platform: AgentPlatform;
  fileName: string;
  content: string;
  storageUrl?: string;
  version: number;
  repoName: string;
}

export interface AgentWindsurfRules {
  platform: AgentPlatform;
  fileName: string;
  content: string;
  storageUrl?: string;
  version: number;
  repoName: string;
}

export interface AgentMcpConfig {
  platform: AgentPlatform;
  fileName: string;
  content: string;
  storageUrl?: string;
  version: number;
  repoName: string;
}

// Copilot-specific types (GAL-395)
export interface CopilotInstructions {
  platform: 'copilot';
  fileName: string; // copilot-instructions.md
  content: string;
  storageUrl?: string;
  version: number;
  repoName: string;
}

export interface CopilotPathInstruction {
  platform: 'copilot';
  name: string;
  fileName: string; // e.g., typescript.instructions.md
  content: string;
  applyTo: string; // Glob pattern, e.g., "**/*.ts,**/*.tsx"
  excludeAgent?: string; // Optional: "code-review" or "coding-agent"
  storageUrl?: string;
  version: number;
  repoName: string;
}

export interface CopilotAgent {
  platform: 'copilot';
  name: string;
  fileName: string; // e.g., code-reviewer.agent.md
  description: string; // Required by Copilot
  content: string; // Markdown instructions (max 30,000 chars)
  target?: 'vscode' | 'github-copilot'; // Optional: defaults to both
  tools?: string[] | '*'; // Available tools, e.g., ["read", "edit"] or "*" for all
  infer?: boolean; // Auto-select based on context
  storageUrl?: string;
  version: number;
  repoName: string;
}

export interface CopilotSkill {
  platform: 'copilot';
  name: string; // Lowercase with hyphens, max 64 chars
  dirName: string; // Skill directory name under .github/skills/
  description: string; // What skill does and when to use (max 1024 chars)
  content: string; // SKILL.md content
  storageUrl?: string;
  version: number;
  repoName: string;
}

export interface AgentScanResult {
  platform: AgentPlatform;
  owner: string;
  repo: string;
  scannedAt: Date;
  settings?: AgentSettings;
  rules: AgentRule[];
  commands: AgentCommand[];
  hooks: AgentHook[];
  agents: AgentSubagent[]; // Claude-specific (subagents)
  instructions?: AgentInstructions; // Platform instruction file (CLAUDE.md, GEMINI.md, AGENTS.md, etc.)
  cursorRules?: AgentCursorRules; // Cursor-specific (.cursorrules)
  windsurfRules?: AgentWindsurfRules; // Windsurf-specific (.windsurfrules)
  mcpConfig?: AgentMcpConfig; // MCP configuration (platform-specific: .mcp.json, .cursor/mcp.json, .vscode/mcp.json, etc.)
  // Copilot-specific (GAL-395)
  copilotInstructions?: CopilotInstructions; // .github/copilot-instructions.md
  copilotPathInstructions?: CopilotPathInstruction[]; // .github/instructions/*.instructions.md
  copilotAgents?: CopilotAgent[]; // .github/agents/*.agent.md
  copilotSkills?: CopilotSkill[]; // .github/skills/*/SKILL.md
}

export interface MultiPlatformScanResult {
  owner: string;
  repo: string;
  scannedAt: Date;
  platforms: AgentScanResult[];
  totalConfigs: number;
  headSha?: string;
  pushedAt?: string;
  cacheStatus?: 'fresh' | 'cached';
  /** Map of file path -> ISO 8601 git commit date for each discovered config file */
  configLastCommitDates?: Record<string, string>;
  /**
   * Set when the GitHub App lacks a required permission (e.g. Repository > Contents: Read).
   * The scan completed but no configs could be read due to a 403 from GitHub.
   * Issue #5675
   */
  permissionError?: string;
}

/**
 * Discovered config item type - used for cached scan results
 */
export type DiscoveredConfigType =
  | 'command'
  | 'rule'
  | 'hook'
  | 'mcp'
  | 'settings'
  | 'agent'
  | 'instructions'
  | 'subagent'
  | 'skill'
  | 'policy'
  | 'workflow'
  | 'prompt';

/**
 * Discovered config item cached from scans
 * Note: content may be omitted for very large orgs to stay under Firestore 1MB limit
 */
export interface DiscoveredConfigItem {
  type: DiscoveredConfigType;
  name: string;
  repo: string;
  path: string;
  content: string | null | undefined;
  lastModified: string;
  hash: string;
  platform?: AgentPlatform;
  // Issue #3181: Git metadata enrichment fields
  commitDate?: string;
  commitCount30d?: number;
  commitCount90d?: number;
  lastCommitAuthor?: string;
  lastCommitSha?: string;
}

/**
 * Lightweight cache metadata (without content) for listing
 */
export interface DiscoveredConfigMeta {
  type: DiscoveredConfigType;
  name: string;
  repo: string;
  path: string;
  lastModified: string;
  hash: string;
  platform?: AgentPlatform;
  // Issue #3181: Git metadata enrichment fields
  commitDate?: string;
  commitCount30d?: number;
  commitCount90d?: number;
  lastCommitAuthor?: string;
  lastCommitSha?: string;
}

/**
 * Discovered configs cache response
 */
export interface DiscoveredConfigsCache {
  configs: DiscoveredConfigItem[];
  cachedAt: Date;
  isStale: boolean;
  /** True when content was offloaded to a Firestore subcollection due to doc size limit */
  metadataOnly?: boolean;
}

// Legacy Claude-specific types (for backward compatibility)
export interface ClaudeConfig {
  settings?: ClaudeSettings;
  commands: ClaudeCommand[];
  hooks: ClaudeHook[];
}

export interface ClaudeSettings {
  fileName: string;
  content: string;
  storageUrl?: string;
  version: number;
  repoName: string;
}

export interface ClaudeCommand {
  name: string;
  fileName: string;
  content: string;
  storageUrl?: string;
  version: number;
  repoName: string;
}

export interface ClaudeHook {
  name: string;
  fileName: string;
  type: 'pre_tool_use' | 'post_tool_use' | 'pre_prompt' | 'post_prompt';
  content: string;
  storageUrl?: string;
  version: number;
  repoName: string;
}

export interface ClaudeScanResult {
  owner: string;
  repo: string;
  scannedAt: Date;
  settings?: ClaudeSettings;
  commands: ClaudeCommand[];
  hooks: ClaudeHook[];
}

// Per-platform statistics
export interface PlatformStats {
  storageUrl: string;
  settingsCount: number;
  rulesCount: number;
  commandsCount: number; // Claude-specific
  hooksCount: number; // Claude-specific
  agentsCount: number; // Claude/Copilot (subagents/custom agents)
  instructionsCount: number; // Platform instruction files (CLAUDE.md, GEMINI.md, AGENTS.md, etc.)
  cursorRulesCount: number; // Cursor-specific (.cursorrules)
  windsurfRulesCount: number; // Windsurf-specific (.windsurfrules)
  mcpConfigCount: number; // MCP config (.mcp.json or .vscode/mcp.json)
  // Copilot-specific (GAL-395)
  copilotInstructionsCount: number; // .github/copilot-instructions.md
  copilotPathInstructionsCount: number; // .github/instructions/*.instructions.md
  copilotSkillsCount: number; // .github/skills/*/SKILL.md
  totalConfigs: number;
}

// Hook reminder interval settings (GAL-115)
export type ReminderType =
  | 'auth-required'    // Not authenticated
  | 'auth-expired'     // Token expired
  | 'auth-expiring'    // Token expiring soon
  | 'sync-required'    // Project not synced
  | 'sync-outdated'    // Config behind approved version
  | 'sync-missing';    // Synced files deleted

export interface HookSettings {
  // Global interval (applies to all types if per-type not specified)
  globalIntervalMinutes?: number;
  // Per-issue-type intervals
  intervals?: Partial<Record<ReminderType, number>>;
  // Last updated metadata
  updatedAt?: Date;
  updatedBy?: string;
}

export interface OrganizationData {
  name: string;
  installationId: number;
  accountType?: 'User' | 'Organization'; // GitHub account type (personal vs org)
  totalRepos: number;
  totalConfigs: number; // Total across all platforms
  // Legacy fields for backward compatibility (Claude-only counts)
  totalCommands: number;
  totalHooks: number;
  settings: {
    storageUrl: string;
    versions: number;
  };
  commands: {
    storageUrl: string;
    count: number;
  };
  hooks: {
    storageUrl: string;
    count: number;
  };
  // Multi-platform support
  platforms?: Record<AgentPlatform, PlatformStats>;
  // Hook settings (GAL-115)
  hookSettings?: HookSettings;
  // Billing/Subscription fields
  planTier?: 'free' | 'convenience' | 'enforcement' | 'enterprise';
  subscriptionStatus?: 'active' | 'past_due' | 'unpaid' | 'canceled' | 'trialing' | 'incomplete' | 'incomplete_expired' | 'paused' | null;
  lastPaymentFailedAt?: Date | null;
  /** Actual GitHub org member count, kept in sync via organization.member_added/removed webhooks */
  memberCount?: number;
  /** Maximum allowed seats for this plan tier; set when plan changes */
  seatLimit?: number;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  /**
   * @deprecated manualGrant is replaced by Stripe subscriptions (#3115).
   * Retained for backward compatibility with existing Firestore documents.
   */
  manualGrant?: {
    grantedBy: string;
    grantedAt: string;
    reason: string;
  };
  // Config repo sync fields
  configRepoEnabled?: boolean;
  configRepoUrl?: string;
  configRepoCreatedAt?: string;
  lastConfigSyncAt?: string;
  lastScanAt?: Date;
  // Audience tier override — DocumentReference to audience_tier_allowed_list (#4182)
  audienceTierRef?: any | null;
  // Source of audienceTier: 'admin' (set via admin routes) or 'stripe' (legacy webhook sync) (#4089)
  audienceTierSource?: 'stripe' | 'admin' | null;
  // #4201: Entitled features derived from plan tier (written by Stripe webhook sync)
  entitledFeatures?: string[] | null;
  // GitHub App installer tracking (captured from installation.created webhook)
  installedByGithubId?: number;
  installedByLogin?: string;
  // Auto-approval settings (#3294: AI auto-approval for config proposals)
  autoApprovalEnabled?: boolean;
  autoApprovalPrompt?: string | null;
  autoApprovalConfidenceThreshold?: number; // 0-1, default 0.85
  autoApprovalDryRun?: boolean;
  // Schema versioning — incremented when the document structure changes
  _schemaVersion?: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FileMetadata {
  fileName: string;
  category: 'commands' | 'hooks' | 'settings';
  versions: VersionInfo[];
  totalVersions: number;
  recommendedVersion?: {
    version: number;
    repoName: string;
    reason: string;
  };
}

export interface VersionInfo {
  version: number;
  repoName: string;
  storageUrl: string;
  uploadedAt: Date;
  fileSize: number;
  contentHash?: string; // SHA-256 hash of file content for change detection
  analysisScore?: number;
  testScore?: number;
}

// AI Analysis Types
export interface AnalysisRequest {
  orgName: string;
  category: 'commands' | 'hooks' | 'settings';
  fileName: string;
  versions: {
    version: number;
    repoName: string;
    content: string;
  }[];
}

export interface AnalysisResult {
  fileName: string;
  category: string;
  overallScore: number;
  versionAnalysis: VersionAnalysis[];
  recommendation: {
    version: number;
    repoName: string;
    reason: string;
    confidence: number;
  };
  patterns: {
    bestPractices: string[];
    commonIssues: string[];
    securityConcerns: string[];
  };
}

export interface VersionAnalysis {
  version: number;
  repoName: string;
  qualityScore: number;
  strengths: string[];
  weaknesses: string[];
  securityIssues: string[];
}

// E2B Testing Types
export interface TestRequest {
  orgName: string;
  category: 'commands' | 'hooks';
  fileName: string;
  version: number;
  repoName: string;
  content: string;
}

export interface TestReport {
  fileName: string;
  category: string;
  version: number;
  repoName: string;
  testResults: {
    functionality: FunctionalityTestResult;
    security: SecurityTestResult;
    performance: PerformanceTestResult;
  };
  overallScore: number;
  recommendation: 'approved' | 'needs-review' | 'rejected';
  testedAt: Date;
}

export interface FunctionalityTestResult {
  passed: boolean;
  executionSuccess: boolean;
  outputValid: boolean;
  errorsEncountered: string[];
  functionalityScore: number;
  details: string;
}

export interface SecurityTestResult {
  passed: boolean;
  networkAccess: {
    detected: boolean;
    domains: string[];
  };
  filesystemAccess: {
    detected: boolean;
    paths: string[];
    sensitiveAccess: boolean;
  };
  commandExecution: {
    detected: boolean;
    commands: string[];
    dangerousCommands: boolean;
  };
  credentialExposure: {
    detected: boolean;
    types: string[];
  };
  securityScore: number;
  issues: string[];
}

export interface PerformanceTestResult {
  executionTimes: number[];
  p50: number;
  p95: number;
  p99: number;
  avgExecutionTime: number;
  reliability: number;
  performanceScore: number;
}

// Webhook payload types
export interface WebhookPayload {
  action: string;
  installation?: {
    id: number;
  };
  repository?: {
    name: string;
    full_name: string;
    owner: {
      login: string;
    };
    private: boolean;
  };
  repositories?: Array<{
    name: string;
    full_name: string;
  }>;
}

// Storage types
export interface StorageUploadResult {
  storageUrl: string;
  path: string;
  size: number;
  uploadedAt: Date;
}

// Dashboard types
export interface DashboardData {
  organizations: OrganizationSummary[];
  recommendations: RecommendationSummary[];
  recentTests: TestSummary[];
}

export interface OrganizationSummary {
  name: string;
  totalRepos: number;
  totalCommands: number;
  totalHooks: number;
  lastScanAt?: Date;
}

export interface RecommendationSummary {
  fileName: string;
  category: string;
  recommendedVersion: number;
  recommendedRepo: string;
  score: number;
  reason: string;
}

export interface TestSummary {
  fileName: string;
  category: string;
  version: number;
  repoName: string;
  overallScore: number;
  recommendation: 'approved' | 'needs-review' | 'rejected';
  testedAt: Date;
}

// Scanning Analysis Types
export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SecurityIssue {
  severity: IssueSeverity;
  type: 'secret_exposure' | 'dangerous_command' | 'filesystem_access' | 'network_access' | 'credential_exposure';
  description: string;
  location?: string;
  recommendation: string;
  evidence?: string;
}

export interface QualityIssue {
  severity: IssueSeverity;
  type: 'malformed_json' | 'empty_content' | 'missing_field' | 'naming_convention' | 'duplicate_rule' | 'poor_documentation' | 'inconsistent_formatting';
  description: string;
  location?: string;
  recommendation: string;
  evidence?: string;
}

export interface SecurityScanReport {
  fileName: string;
  platform: AgentPlatform;
  configType: 'settings' | 'rule' | 'command' | 'hook';
  scannedAt: Date;
  issues: SecurityIssue[];
  overallRisk: IssueSeverity;
  passed: boolean;
}

export interface QualityScanReport {
  fileName: string;
  platform: AgentPlatform;
  configType: 'settings' | 'rule' | 'command' | 'hook';
  scannedAt: Date;
  issues: QualityIssue[];
  overallQuality: IssueSeverity;
  passed: boolean;
}

export interface ComprehensiveScanReport {
  fileName: string;
  platform: AgentPlatform;
  configType: 'settings' | 'rule' | 'command' | 'hook';
  repoName: string;
  scannedAt: Date;
  security: SecurityScanReport;
  quality: QualityScanReport;
  bestPractices: {
    hasDocumentation: boolean;
    hasConsistentFormatting: boolean;
    followsRecommendedPatterns: boolean;
    suggestions: string[];
  };
  overallScore: number;
  recommendation: 'approved' | 'needs-review' | 'rejected';
}

// Flag types for client dashboard presentation
export type StatusLevel = 'pass' | 'warning' | 'fail';

export interface OrganizationFlags {
  orgName: string;
  securityScore: number; // 0-100
  qualityScore: number; // 0-100
  platformCoverage: {
    platform: AgentPlatform;
    configured: boolean;
    repoCount: number;
  }[];
  lastScanStatus: 'completed' | 'in_progress' | 'failed' | 'never_scanned';
  lastScanTimestamp?: Date;
  totalIssues: {
    critical: number;
    high: number;
    medium: number;
    low: number;
  };
  repositories: RepositoryFlags[];
}

export interface RepositoryFlags {
  repoName: string;
  hasConfigs: {
    platform: AgentPlatform;
    hasConfig: boolean;
  }[];
  securityStatus: StatusLevel;
  qualityStatus: StatusLevel;
  configFreshness: Date; // last updated timestamp
  issueBreakdown: {
    security: number;
    quality: number;
    validation: number;
  };
  platforms: ConfigFlags[];
}

export interface ConfigFlags {
  platform: AgentPlatform;
  validationStatus: StatusLevel;
  securityIssues: SecurityIssue[];
  qualityIssues: QualityIssue[];
  complianceIssues: ComplianceIssue[];
  recommendations: string[];
}

// GAL-50: Compliance scanning types
export interface ComplianceIssue {
  severity: IssueSeverity;
  type: ComplianceIssueType;
  description: string;
  location?: string;
  recommendation: string;
  evidence?: string;
  affectedPlatforms?: AgentPlatform[];
  affectedRepos?: string[];
}

export type ComplianceIssueType =
  | 'missing_safety_hook'      // No pre_tool_use hook to prevent dangerous commands
  | 'missing_hook_type'        // Missing specific hook type (pre/post tool use, etc.)
  | 'command_version_drift'    // Same command with different versions across repos
  | 'cross_platform_gap'       // Command exists in one platform but not others
  | 'inconsistent_rules'       // Rules differ significantly across repos
  | 'missing_platform_config'; // Platform configured in some repos but not others

// GAL-50: Compliance scan report
export interface ComplianceScanReport {
  orgName: string;
  scannedAt: Date;
  issues: ComplianceIssue[];
  missingHooks: MissingHookReport[];
  versionDrift: VersionDriftReport[];
  crossPlatformGaps: CrossPlatformGapReport[];
  overallComplianceScore: number; // 0-100
  passed: boolean;
}

export interface MissingHookReport {
  repoName: string;
  platform: AgentPlatform;
  missingHookTypes: ('pre_tool_use' | 'post_tool_use' | 'pre_prompt' | 'post_prompt')[];
  hasSafetyHook: boolean; // Has hook that prevents dangerous commands
  recommendation: string;
}

export interface VersionDriftReport {
  commandName: string;
  platform: AgentPlatform;
  versions: {
    repoName: string;
    contentHash: string;
    contentLength: number;
    version: number;
  }[];
  driftSeverity: IssueSeverity;
  recommendation: string;
}

export interface CrossPlatformGapReport {
  configName: string;
  configType: 'command' | 'rule' | 'hook' | 'settings';
  presentIn: {
    platform: AgentPlatform;
    repoName: string;
  }[];
  missingIn: AgentPlatform[];
  recommendation: string;
}

// GAL-52: Fix generation types
export interface FixSuggestion {
  type: 'add_hook' | 'sync_command' | 'sync_rule' | 'update_settings';
  targetRepo: string;
  targetPlatform: AgentPlatform;
  fileName: string;
  content: string;
  sourceRepo?: string;
  sourcePlatform?: AgentPlatform;
  description: string;
}

export interface FixReport {
  orgName: string;
  generatedAt: Date;
  fixes: FixSuggestion[];
  totalFixes: number;
  byType: {
    add_hook: number;
    sync_command: number;
    sync_rule: number;
    update_settings: number;
  };
}

// GAL-123: Enforcement Settings Types
export type EnforcementLevel = 'off' | 'warn' | 'block';

export interface EnforcementSettings {
  enabled: boolean;
  level: EnforcementLevel;
  blockOnMismatch: boolean; // Block commits if config doesn't match approved
  requireSync: boolean; // Require developers to run sync before committing
  allowOverrides: boolean; // Allow project-specific overrides
  notifyOnViolation: boolean; // Send notifications when violations occur
  gracePeriodDays?: number; // Days before enforcement starts after approval
}

export const DEFAULT_ENFORCEMENT_SETTINGS: EnforcementSettings = {
  enabled: false,
  level: 'warn',
  blockOnMismatch: false,
  requireSync: false,
  allowOverrides: true,
  notifyOnViolation: false,
};

// GAL-53: LLM Analysis Types
export * from './llm-analysis.js';

// GAL-130: Developer Status Types
export interface DeveloperStatus {
  userId: string;
  githubLogin: string;
  githubId: number;
  name: string | null;
  email: string | null;
  avatarUrl: string;
  organization: string;
  // CLI Installation
  cliInstalled: boolean;
  cliVersion?: string;
  cliInstalledAt?: Date;
  cliLastSeenAt?: Date;
  // Authentication
  authenticated: boolean;
  authExpiresAt?: Date;
  lastAuthAt?: Date;
  // Config Sync
  lastSyncAt?: Date;
  syncedConfigVersion?: string;
  approvedConfigVersion?: string;
  syncStatus: 'synced' | 'outdated' | 'never_synced';
  // Activity
  lastActivityAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface DeveloperStatusSummary {
  organization: string;
  totalDevelopers: number;
  cliInstalled: number;
  authenticated: number;
  authExpired: number;
  syncedToLatest: number;
  outOfSync: number;
  neverSynced: number;
  developers: DeveloperStatus[];
}

// Feature Flags Types (shared between API and Dashboard)
export * from './feature-flags.js';

// Billing Types — Per-Seat Billing (#4202)
export * from './billing.js';

// GAL-272: Team Access Management Types
export type GalRole = 'owner' | 'admin' | 'security' | 'developer';

export interface TeamMember {
  userId: string;
  githubLogin: string;
  githubId: number;
  name: string | null;
  email: string | null;
  avatarUrl: string;
  // GitHub org role (read-only, from GitHub API)
  githubOrgRole: 'admin' | 'member';
  // GAL-specific role (managed by GAL)
  galRole: GalRole;
  // Role assignment metadata
  roleAssignedBy?: string;
  roleAssignedAt?: Date;
  // Activity tracking
  lastActiveAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

export interface TeamMemberSummary {
  organization: string;
  totalMembers: number;
  owners: number;
  admins: number;
  developers: number;
  members: TeamMember[];
}

export interface RoleChangeRequest {
  userId: string;
  newRole: GalRole;
}

export interface RoleChangeResponse {
  success: boolean;
  member: TeamMember;
  previousRole: GalRole;
  newRole: GalRole;
  changedBy: string;
  changedAt: Date;
}

// GAL-1741: Team Page Live GitHub Sync Types
export interface CachedMember {
  githubId: number;
  githubLogin: string;
  name: string | null;
  email: string | null;
  avatarUrl: string;
  githubOrgRole: 'admin' | 'member';
  teamMemberships?: string[];
  approvalStatus?: 'approved' | 'pending';
}

export interface TeamMemberCache {
  members: CachedMember[];
  lastSyncedAt: Date;
  syncedBy: string;
  memberCount: number;
  orgName: string;
}

export interface RoleOverride {
  githubId: number;
  galRole: GalRole;
  assignedBy: string;
  assignedAt: Date;
}

export interface TeamMembersResponse {
  members: Array<{
    userId: string;
    githubLogin: string;
    githubId: number;
    name: string | null;
    email: string | null;
    avatarUrl: string;
    githubOrgRole: 'admin' | 'member';
    galRole: GalRole;
    roleAssignedBy: string | null;
    roleAssignedAt: Date | null;
    approvalStatus?: 'approved' | 'pending';
  }>;
  pendingMembers?: Array<{
    userId: string;
    githubLogin: string;
    githubId: number;
    name: string | null;
    email: string | null;
    avatarUrl: string;
    githubOrgRole: 'admin' | 'member';
    galRole: GalRole;
    roleAssignedBy: string | null;
    roleAssignedAt: Date | null;
    approvalStatus?: 'approved' | 'pending';
  }>;
  totalPending?: number;
  totalMembers: number;
  lastSyncedAt: string;
  syncedBy: string;
  cacheStatus: 'fresh' | 'stale' | 'refreshing';
  owners: number;
  admins: number;
  developers: number;
}

// Telemetry Types (CLI events, OTEL-compatible)
export * from './telemetry.js';

// Model Training (Trainable Traces)
export * from './trainable-trace.js';
export * from './agent-executor-training.js';

// OAuth Proxy Types (GAL-527)
export * from './oauth.js';

// GAL-569: Unified Authentication Types
export * from './auth.js';
export * from './user.js';
export * from './workspace.js';

// Background Agent Session Types (GAL-571)
export * from './session.js';

// Workflow Types (GAL-595: Session List)
export * from './workflow.js';

// Work Item Management Types (SAL-1: Job Queue)
export * from './work-item.js';

// Agent Activity / Shared Context Pool (#4686)
export * from './agent-activity.js';

// GAL Config Schema (Issue #666) - Canonical .gal/ directory format
export * from './gal-config.js';

// Onboarding Types (GitHub Issue #1044)
export * from './onboarding.js';

// User Context Types (GitHub Issue #1044 - Phase 1)
export * from './user-context.js';

// Config Governance Types (GitHub Issue #1044 - Phase 1)
export * from './config-governance.js';

// Credential Types for Background Agents (GitHub Issue #1136)
export * from './credentials.js';

// Credential Consent Audit Types (Issue #189 — FTC §5 point-of-capture consent)
export * from './credential-consent.js';

// Structured Error Codes for P0 Production Observability (Issue #1775)
export * from './error-codes.js';

// ============================================================================
// VS Code Extension shared types
// ============================================================================

/** Client-side workspace view with user's role and capabilities */
export interface WorkspaceView {
  id: string;
  type: 'organization' | 'personal';
  name: string;
  slug: string;
  avatarUrl?: string;
  role: 'admin' | 'member';
  isOwner: boolean;
  canApprove: boolean;
  canManageSettings: boolean;
}

export interface DiscoveredRepo {
  name: string;
  fullName: string;
  configCount: number;
  configTypes: string[];
  lastScanned: string;
}

export interface DiscoveryResponse {
  repos: DiscoveredRepo[];
  totalRepos: number;
  lastScanAt: string | null;
}

export interface SyncStatusResponse {
  synced: boolean;
  lastSyncAt: string | null;
  configVersion?: string;
  driftDetected: boolean;
  driftFiles: Array<{
    path: string;
    type: 'modified' | 'missing' | 'extra';
    platform: string;
  }>;
}

// CLI API Types (shared between CLI and VS Code extension)

export interface ApiConfig {
  apiUrl?: string;
  apiKey?: string;
  authToken?: string;
}

export interface CurrentUser {
  login: string;
  name: string | null;
  email: string | null;
  avatarUrl: string;
  organizations: string[];
  isAdmin?: boolean;
}

export interface ScanResponse {
  success: boolean;
  message: string;
  totalConfigs: number;
  byPlatform?: Record<AgentPlatform, number>;
  results: Array<{
    repo: string;
    totalConfigs: number;
    platforms: Array<{
      platform: AgentPlatform;
      settings: boolean;
      rules: number;
      commands: number;
      hooks: number;
    }>;
  }>;
}

export interface DownloadedFile {
  fileName: string;
  content: string;
  platform: AgentPlatform;
  type: 'settings' | 'rule' | 'command' | 'hook';
  repoName: string;
}

export interface ConfigDownloadResponse {
  organization: string;
  platform: string;
  totalConfigs: number;
  configs: Array<{
    fileName: string;
    category: string;
    platform: string;
    content: string;
    version: number;
    repoName: string;
  }>;
}

export interface ApprovedConfigResponse {
  approved: boolean;
  hash?: string;
  version?: string;
  platform?: string;
  configContent?: string;
  approvedAt?: string;
  approvedBy?: string;
  policyName?: string;
  enforcement?: {
    content: string;
    hash: string;
    sourceRepo?: string;
    sourcePath?: string;
  } | null;
}

/**
 * GAL-395: Response from GET /approved-config?platform=all
 * Returns all platform configs at once for efficient multi-platform sync
 */
export interface AllPlatformConfigsResponse {
  configs: {
    [K in AgentPlatform]?: PlatformConfigData;
  };
  available_platforms: AgentPlatform[];
}

/**
 * GAL-395: Config data for a single platform
 */
export interface PlatformConfigData {
  platform: AgentPlatform;
  hash: string;
  version: string;
  policyName?: string;
  instructions?: { content: string; hash: string } | null;
  commands?: Array<{ name: string; content: string; hash: string }>;
  hooks?: Array<{ name: string; content: string; hash: string }>;
  settings?: { content: string; hash: string } | null;
  subagents?: Array<{ name: string; content: string; hash: string }>;
  skills?: Array<{ name: string; content: string; hash: string; description?: string }>;
  rules?: Array<{ name: string; content: string; hash: string }>;
  cursorRules?: { content: string; hash: string } | null;
  // GAL-395: Copilot-specific config fields
  copilotInstructions?: { content: string; hash: string } | null;
  copilotPathInstructions?: Array<{
    name: string;
    fileName: string;
    content: string;
    applyTo: string;
    excludeAgent?: string;
    hash: string;
  }>;
  copilotAgents?: Array<{
    name: string;
    fileName: string;
    description: string;
    content: string;
    tools?: string[] | '*';
    target?: 'vscode' | 'github-copilot';
    infer?: boolean;
    hash: string;
  }>;
  copilotSkills?: Array<{
    name: string;
    dirName: string;
    description: string;
    content: string;
    hash: string;
  }>;
  mcp?: { content: string; hash: string } | null;  // MCP configuration (.mcp.json)
  enforcement?: { content: string; hash: string } | null;  // Unified enforcement rule source (Level 0)
  environment?: GalEnvironment | null;  // Runner setup/auth configuration
  configContent?: string;  // Legacy field for backward compatibility
  approvedAt: string;
  approvedBy: string;
  enforcementSettings?: {
    enabled: boolean;
    level: 'off' | 'warn' | 'block';
    blockOnMismatch?: boolean;
    requireSync?: boolean;
  };
}

// Sync Copilot (Issue #1771)
export type SyncCopilotSource = 'model' | 'deterministic';
export type SyncCopilotRolloutMode = 'disabled' | 'shadow' | 'enforce';
export type SyncCopilotFallbackReason =
  | 'feature_disabled'
  | 'model_disabled'
  | 'model_error'
  | 'timeout'
  | 'validation_failure'
  | 'rate_limit';

export interface SyncCopilotHint {
  expectedConflicts: string[];
  riskyOverrides: string[];
  recommendedSequence: string[];
  rationale: string;
  confidence?: number;
}

export interface SyncPreflightHintRequest {
  platform?: AgentPlatform;
  clientSurface?:
    | 'api'
    | 'cli'
    | 'dashboard'
    | 'vscode_extension'
    | 'chrome_extension'
    | 'mcp_session'
    | 'background_agent';
}

export interface SyncPreflightHintResponse {
  orgName: string;
  platformFilter?: AgentPlatform;
  generatedAt: string;
  requestHash: string;
  source: SyncCopilotSource;
  rolloutMode: SyncCopilotRolloutMode;
  hint: SyncCopilotHint;
  fallbackReason?: SyncCopilotFallbackReason;
  metadata?: {
    model?: string;
    provider?: string;
    latencyMs?: number;
    platformCount?: number;
    validationErrors?: string[];
  };
}

// Background Agent Dispatch Rules (admin-configurable)
export interface DispatchCategory {
  /** Unique ID: "bug-fixes", "test-writing", "documentation", etc. */
  id: string;
  /** Human-readable name */
  name: string;
  /** Description shown in AGENTS.md */
  description: string;
  /** Whether this category is eligible for background dispatch */
  enabled: boolean;
  /** Prompt template hint for agents */
  promptHint?: string;
}

export interface BackgroundDispatchConfig {
  /** Master switch for background dispatch */
  enabled: boolean;
  /** Categories of work eligible for dispatch */
  categories: DispatchCategory[];
  /** Custom instructions appended to AGENTS.md */
  customInstructions?: string;
  /** Max concurrent background agents (optional) */
  maxConcurrentAgents?: number;
  /** Preferred agent provider */
  preferredProvider?: 'claude' | 'codex' | 'gemini' | 'oss';
  /** #5065: Team-wide hooks/config upgrade version */
  hooksVersion?: number;
  /** #5065: ISO timestamp when hooksVersion was last bumped */
  hooksVersionUpdatedAt?: string;
  /** #5065: Approved-config schema version for local migration policy */
  approvedConfigSchemaVersion?: number;
  /** #5065: Whether schema migration is safe to auto-apply */
  approvedConfigSchemaChangeType?: 'non-breaking' | 'breaking';
  /** #5065: Human-readable schema diff lines for breaking prompts */
  approvedConfigSchemaDiff?: string[];
  /** Updated metadata */
  updatedAt: string;
  updatedBy: string;
}

export const DEFAULT_DISPATCH_CATEGORIES: DispatchCategory[] = [
  { id: 'bug-fixes', name: 'Bug Fixes', description: 'Fix bugs with clear reproduction steps and specific file locations', enabled: true },
  { id: 'test-writing', name: 'Test Writing', description: 'Write or update tests for existing code', enabled: true },
  { id: 'documentation', name: 'Documentation', description: 'Update docs, README files, code comments', enabled: true },
  { id: 'ci-fixes', name: 'CI/Lint Fixes', description: 'Fix CI failures, lint errors, type errors', enabled: true },
  { id: 'refactoring', name: 'Code Refactoring', description: 'Refactor code patterns across multiple files', enabled: false },
  { id: 'new-features', name: 'New Features', description: 'Implement new features from specs', enabled: false },
  { id: 'security-fixes', name: 'Security Patches', description: 'Fix security vulnerabilities', enabled: false },
  { id: 'migrations', name: 'Migrations', description: 'Database or dependency migrations', enabled: false },
];

// Discovery Intelligence Types (GAL-1769)
export * from './discovery-intelligence.js';

// Orchestrator Brain Types (#1883)
export * from './orchestrator-brain.js';

// Provider Usage Telemetry Types (Issue #2005)
export * from './provider-usage.js';

// Worker Pool Types
export * from './worker-pool.js';

// Provider Precedence Transparency Types (Issue #1990)
export * from './provider-precedence.js';

// SDLC Enforcement Types (Issue #2127)
export * from './sdlc-enforcement.js';

// Supervisor Directive Types (Issue #2137)
export * from './supervisor-directive.js';

// Browser Automation Contract Types (Issue #2124)
export * from './browser-automation.js';

// Team Assignment Engine Types (Issue #2139)
export * from './team-assignment.js';

// Feedback Collection Types (Issue #1111)
export * from './feedback.js';

// Autonomy Evaluation + Intervention Types (#4571)
export * from './autonomy.js';

// Domain Allowlist Audit Types (Issue #2523)
export * from './domain-audit.js';

// System-Level Enforcement Types (Issue #183)
export * from './system-enforcement.js';

// Tool Governance Types (Issue #822)
export * from './tool-policy.js';

// Governance Audit Types (Issue #822 Phase 2)
export * from './governance-audit.js';

// Autopilot CI/CD Monitoring Types (Issue #201)
export * from './autopilot.js';

// Agent Security Policy Types (Issue #2514)
export * from './agent-security-policy.js';

// Security Standards Compliance Types (Issue #184)
export * from './security-standards.js';

// Meta Agentic Layer Core Types (Issue #1314)
export * from './mal.js';

// MAL MAINTAIN Types (Issue #1316)
export * from './mal-maintain.js';

// MAL BUILD Types (Issue #1315)
export * from './mal-build.js';

// MAL Evaluate Types (Issue #1317)
export * from './mal-evaluate.js';

// MAL Evolve Types (Issue #1318)
export * from './mal-evolve.js';

// MAL Signal Hooks Types (Issue #1320)
export * from './mal-signals.js';

// MAL CLI Types (Issue #1323)
export * from './mal-cli.js';

// MAL Background Runner Types (Issue #1321)
export * from './mal-runner.js';

// MAL Self-Evolution Types (Issue #1322)
export * from './mal-self-evolution.js';

// MAL Knowledge Store Types (Issue #1319)
export * from './mal-knowledge.js';

// MAL Cross-Project Learning Types (Issue #1324)
export * from './mal-cross-project.js';

// Design Project Types - run-design creative production pipeline (Issue #3612)
export * from './design-project.js';

// SSO / SAML 2.0 Types (Issue #184)
export * from './sso.js';

// Memory Sync Types — cross-agent memory sharing (Issue #4243)
export * from './memory.js';

// Secrets Management Types (Issue #4242)
export * from './secrets.js';

// Environments Types — named environment configs for background agents (Issue #4462)
export * from './environments.js';

// Learning Types — background agent session learnings capture (Issue #4363)
export * from './learning.js';

// Workflow Enforcement Mode Types — background-only enforcement (Issue #4702)
export * from './enforcement-mode.js';

// GAL-4704: SDLC Phase Evaluation
export * from './sdlc-evaluation.js';

// OSS Provider Evaluation Types (Issue #4885)
export * from './oss-model-eval.js';

// A/B Routing Infrastructure Types (Issue #4886)
export * from './ab-routing.js';

// Meeting Transcript Pipeline Types (Issue #4477)
export * from './meeting-transcript-pipeline.js';

// User Settings Types (#5796)
export * from './user-settings.js';

// Token Budget Types (#6297)
export * from './token-budget.js';

// Rate Card Types (#6296)
export * from './rate-card.js';

// Policy Agent Service Types (#6878)
export * from './policy.js';
