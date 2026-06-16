//! @gal/types port — canonical type definitions for the GAL system.
//!
//! Ported from the TypeScript packages:
//!   - @gal/types  → gal-shared/packages/types/src/
//!   - @gal/core   → gal-shared/packages/core/src/audience-tier.ts

#![allow(dead_code)]

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

// =============================================================================
// Legal URLs — single source of truth (#3350)
// =============================================================================

pub const GAL_TERMS_URL: &str = "https://scheduler-systems.com/legal/en/gal-terms.pdf";
pub const GAL_PRIVACY_URL: &str = "https://scheduler-systems.com/legal/en/gal-privacy.pdf";

// =============================================================================
// Platform Registry — single source of truth (Issue #2821)
// =============================================================================

/// Canonical platform identifier used across the entire codebase.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PlatformId {
    Claude,
    Cursor,
    Copilot,
    Gemini,
    Codex,
    #[serde(rename = "codex-cloud")]
    CodexCloud,
    Windsurf,
    Antigravity,
    Amp,
    #[serde(rename = "ai-studio")]
    AiStudio,
    Kling,
    Higgsfield,
    Jules,
    #[serde(rename = "gal-code")]
    GalCode,
}

impl std::fmt::Display for PlatformId {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            PlatformId::Claude => write!(f, "claude"),
            PlatformId::Cursor => write!(f, "cursor"),
            PlatformId::Copilot => write!(f, "copilot"),
            PlatformId::Gemini => write!(f, "gemini"),
            PlatformId::Codex => write!(f, "codex"),
            PlatformId::CodexCloud => write!(f, "codex-cloud"),
            PlatformId::Windsurf => write!(f, "windsurf"),
            PlatformId::Antigravity => write!(f, "antigravity"),
            PlatformId::Amp => write!(f, "amp"),
            PlatformId::AiStudio => write!(f, "ai-studio"),
            PlatformId::Kling => write!(f, "kling"),
            PlatformId::Higgsfield => write!(f, "higgsfield"),
            PlatformId::Jules => write!(f, "jules"),
            PlatformId::GalCode => write!(f, "gal-code"),
        }
    }
}

/// AgentPlatform is an alias for PlatformId (used in types.ts / index.ts).
pub type AgentPlatform = PlatformId;

/// Platform definition with metadata and capabilities.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformDefinition {
    pub id: PlatformId,
    pub directory: String,
    pub display: PlatformDisplay,
    pub capabilities: PlatformCapabilities,
    #[serde(default)]
    pub instruction_file: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformDisplay {
    pub full_name: String,
    pub short_name: String,
    pub icon: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformCapabilities {
    pub hooks: bool,
    pub credential_sync: bool,
    pub session_runner: bool,
    pub compliance_scan: bool,
    pub stable: bool,
}

// =============================================================================
// AgentPlatform (alias) — supported AI coding agent platforms
// =============================================================================

/// Platform config patterns for each platform.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformConfigPattern {
    pub platform: AgentPlatform,
    pub directory: String,
    pub settings_file: String,
    pub rules_dir: String,
    #[serde(default)]
    pub rules_file: Option<String>,
    #[serde(default)]
    pub hooks_dir: Option<String>,
    #[serde(default)]
    pub hooks_config_file: Option<String>,
    #[serde(default)]
    pub commands_dir: Option<String>,
    #[serde(default)]
    pub agents_dir: Option<String>,
    #[serde(default)]
    pub claude_md_file: Option<String>,
    #[serde(default)]
    pub claude_local_md_file: Option<String>,
    #[serde(default)]
    pub gemini_md_file: Option<String>,
    #[serde(default)]
    pub agents_md_file: Option<String>,
    #[serde(default)]
    pub agent_md_file: Option<String>,
    #[serde(default)]
    pub agent_local_md_file: Option<String>,
    #[serde(default)]
    pub cursor_rules_file: Option<String>,
    #[serde(default)]
    pub windsurf_rules_file: Option<String>,
    #[serde(default)]
    pub mcp_file: Option<String>,
    #[serde(default)]
    pub config_file: Option<String>,
    #[serde(default)]
    pub cli_config_file: Option<String>,
    #[serde(default)]
    pub copilot_instructions_file: Option<String>,
    #[serde(default)]
    pub instructions_dir: Option<String>,
    #[serde(default)]
    pub skills_dir: Option<String>,
    #[serde(default)]
    pub policies_dir: Option<String>,
    #[serde(default)]
    pub workflows_dir: Option<String>,
    #[serde(default)]
    pub prompts_dir: Option<String>,
    #[serde(default)]
    pub ignore_file: Option<String>,
    #[serde(default)]
    pub memory_dir: Option<String>,
    #[serde(default)]
    pub memory_extensions: Option<Vec<String>>,
    #[serde(default)]
    pub rule_extensions: Vec<String>,
}

// =============================================================================
// Audience Tier Types
// =============================================================================

/// Audience tier for feature gating with hierarchical ordering.
/// Higher tiers inherit access to all lower-tier features:
///   internal > partners > public
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
pub enum AudienceTier {
    #[serde(rename = "public")]
    Public,
    #[serde(rename = "partners")]
    Partners,
    #[serde(rename = "internal")]
    Internal,
}

impl AudienceTier {
    pub fn rank(&self) -> i32 {
        match self {
            AudienceTier::Public => 0,
            AudienceTier::Partners => 1,
            AudienceTier::Internal => 2,
        }
    }
}

impl PartialOrd for AudienceTier {
    fn partial_cmp(&self, other: &Self) -> Option<std::cmp::Ordering> {
        Some(self.rank().cmp(&other.rank()))
    }
}

impl Ord for AudienceTier {
    fn cmp(&self, other: &Self) -> std::cmp::Ordering {
        self.rank().cmp(&other.rank())
    }
}

/// PageAudience is semantically identical to AudienceTier.
pub type PageAudience = AudienceTier;

// =============================================================================
// Feature Flag Types
// =============================================================================

/// All valid page IDs in the dashboard.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum PageId {
    Dashboard,
    Discovery,
    Proposals,
    Team,
    #[serde(rename = "background-agents")]
    BackgroundAgents,
    Swarm,
    Cli,
    Vscode,
    Docs,
    Billing,
    Settings,
    #[serde(rename = "workflow-testing")]
    WorkflowTesting,
    #[serde(rename = "project-scope-configs")]
    ProjectScopeConfigs,
    #[serde(rename = "enforcement-overrides")]
    EnforcementOverrides,
    #[serde(rename = "domain-compliance")]
    DomainCompliance,
    #[serde(rename = "tool-compliance")]
    ToolCompliance,
    #[serde(rename = "audit-logs")]
    AuditLogs,
    #[serde(rename = "enforcement-policies")]
    EnforcementPolicies,
    #[serde(rename = "enforcement-compliance")]
    EnforcementCompliance,
    #[serde(rename = "enforcement-audit")]
    EnforcementAudit,
    #[serde(rename = "enforcement-domains")]
    EnforcementDomains,
    #[serde(rename = "enforcement-hooks")]
    EnforcementHooks,
    #[serde(rename = "enforcement-sdlc")]
    EnforcementSdlc,
    #[serde(rename = "enforcement-security")]
    EnforcementSecurity,
    #[serde(rename = "enforcement-tools")]
    EnforcementTools,
    #[serde(rename = "enforcement-system")]
    EnforcementSystem,
    #[serde(rename = "browser-profiles")]
    BrowserProfiles,
    #[serde(rename = "governance-playground")]
    GovernancePlayground,
    #[serde(rename = "token-spend")]
    TokenSpend,
    Policies,
}

/// Feature maturity label.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FlagMaturity {
    #[serde(rename = "stable")]
    Stable,
    #[serde(rename = "preview")]
    Preview,
}

/// Deployment environments for feature/page visibility.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum FlagEnvironment {
    #[serde(rename = "dev")]
    Dev,
    #[serde(rename = "prod")]
    Prod,
}

/// Subscription plan tiers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum PlanTier {
    Free,
    Convenience,
    Enforcement,
    Enterprise,
}

/// Page flag configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageFlag {
    pub route: String,
    pub name: String,
    pub description: String,
    pub layer: String,
    pub enabled: bool,
    #[serde(default)]
    pub audience: Option<PageAudience>,
    #[serde(default)]
    pub maturity: Option<FlagMaturity>,
    #[serde(default)]
    pub internal_orgs: Option<Vec<String>>,
    #[serde(default)]
    pub environments: Option<Vec<FlagEnvironment>>,
    #[serde(default)]
    pub org_environments: Option<HashMap<String, Vec<FlagEnvironment>>>,
}

/// Feature flag configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureFlag {
    pub name: String,
    pub description: String,
    pub category: String,
    pub enabled: bool,
    #[serde(default)]
    pub required_plan: Option<PlanTier>,
    #[serde(default)]
    pub maturity: Option<FlagMaturity>,
    #[serde(default)]
    pub audience: Option<AudienceTier>,
    #[serde(default)]
    pub internal_orgs: Option<Vec<String>>,
    #[serde(default)]
    pub environments: Option<Vec<FlagEnvironment>>,
    #[serde(default)]
    pub org_environments: Option<HashMap<String, Vec<FlagEnvironment>>>,
}

/// Page flag with computed effective status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PageFlagWithStatus {
    #[serde(flatten)]
    pub flag: PageFlag,
    pub effectively_enabled: bool,
}

/// Feature flag with computed effective status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureFlagWithStatus {
    #[serde(flatten)]
    pub flag: FeatureFlag,
    pub effectively_enabled: bool,
}

/// Environment information returned by API.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnvironmentInfo {
    pub environment: FlagEnvironment,
    pub is_production: bool,
    pub node_env: String,
}

/// Response from GET /feature-flags.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FeatureFlagsResponse {
    pub environment: EnvironmentInfo,
    pub pages: HashMap<String, PageFlagWithStatus>,
    pub features: HashMap<String, FeatureFlagWithStatus>,
}

// =============================================================================
// GAL Config Schema — .gal/config.yaml
// =============================================================================

/// Root GAL configuration file schema (.gal/config.yaml).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GalConfig {
    pub version: u32,
    pub organization: String,
    #[serde(default)]
    pub policy_name: Option<String>,
    pub synced_at: String,
    pub hash: String,
    pub config_version: String,
    #[serde(default)]
    pub instructions: Option<GalInstructions>,
    #[serde(default)]
    pub commands: Option<Vec<GalCommand>>,
    #[serde(default)]
    pub agents: Option<Vec<GalAgent>>,
    #[serde(default)]
    pub rules: Option<Vec<GalRule>>,
    #[serde(default)]
    pub hooks: Option<Vec<GalHook>>,
    #[serde(default)]
    pub settings: Option<GalSettings>,
    #[serde(default)]
    pub mcp: Option<GalMcpConfig>,
    #[serde(default)]
    pub environment: Option<GalEnvironment>,
    #[serde(default)]
    pub memory: Option<Vec<GalMemory>>,
}

/// Main project instructions (.gal/config.yaml).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GalInstructions {
    pub content: String,
    #[serde(default)]
    pub source_repo: Option<String>,
    #[serde(default)]
    pub source_path: Option<String>,
}

/// Slash command definition (.gal/config.yaml).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GalCommand {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    pub content: String,
    #[serde(default)]
    pub allowed_tools: Option<Vec<String>>,
    #[serde(default)]
    pub source_repo: Option<String>,
    #[serde(default)]
    pub source_path: Option<String>,
}

/// Subagent / custom agent definition (.gal/config.yaml).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GalAgent {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    pub content: String,
    #[serde(default)]
    pub tools: Option<Vec<String>>,
    #[serde(default)]
    pub source_repo: Option<String>,
    #[serde(default)]
    pub source_path: Option<String>,
}

/// Context rule definition (.gal/config.yaml).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GalRule {
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    pub content: String,
    #[serde(default)]
    pub paths: Option<Vec<String>>,
    #[serde(default)]
    pub always_apply: Option<bool>,
    #[serde(default)]
    pub source_repo: Option<String>,
    #[serde(default)]
    pub source_path: Option<String>,
}

/// Lifecycle hook definition (.gal/config.yaml).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GalHook {
    pub name: String,
    pub event: GalHookEvent,
    pub content: String,
    #[serde(default)]
    pub runtime: Option<String>,
    #[serde(default)]
    pub source_repo: Option<String>,
    #[serde(default)]
    pub source_path: Option<String>,
}

/// Hook trigger events.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum GalHookEvent {
    SessionStart,
    SessionEnd,
    PreToolUse,
    PostToolUse,
    PreCommit,
    PostCommit,
}

/// Tool and permission settings (.gal/config.yaml).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GalSettings {
    #[serde(default)]
    pub model: Option<String>,
    #[serde(default)]
    pub max_tokens: Option<u32>,
    #[serde(default)]
    pub permissions: Option<GalPermissions>,
    #[serde(default)]
    pub platform_overrides: Option<HashMap<String, serde_json::Value>>,
}

/// Tool permission settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GalPermissions {
    #[serde(default)]
    pub allow_bash: Option<bool>,
    #[serde(default)]
    pub allow_read: Option<Vec<String>>,
    #[serde(default)]
    pub allow_write: Option<Vec<String>>,
    #[serde(default)]
    pub deny_write: Option<Vec<String>>,
    #[serde(default)]
    pub allow_network: Option<Vec<String>>,
    #[serde(default)]
    pub deny_network: Option<Vec<String>>,
}

/// MCP (Model Context Protocol) server configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GalMcpConfig {
    #[serde(default)]
    pub servers: Option<Vec<GalMcpServer>>,
    #[serde(default)]
    pub disabled_inbuilt_servers: Option<Vec<String>>,
}

/// Individual MCP server configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GalMcpServer {
    pub name: String,
    pub command: String,
    #[serde(default)]
    pub args: Option<Vec<String>>,
    #[serde(default)]
    pub env: Option<HashMap<String, String>>,
}

/// Environment configuration for runner setup phase.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GalEnvironment {
    #[serde(default)]
    pub secrets: Option<Vec<GalEnvironmentSecret>>,
    #[serde(default)]
    pub auth: Option<Vec<GalEnvironmentAuthRef>>,
    #[serde(default)]
    pub setup: Option<Vec<String>>,
    #[serde(default)]
    pub install: Option<String>,
    #[serde(default)]
    pub strip_after_setup: Option<bool>,
}

/// Environment secret reference.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GalEnvironmentSecret {
    pub name: String,
    pub source: String,
    #[serde(default)]
    pub r#type: Option<String>,
}

/// Interactive auth reference for runner setup.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GalEnvironmentAuthRef {
    pub kind: String,
    pub source: String,
    #[serde(default)]
    pub env_names: Option<Vec<String>>,
    #[serde(default)]
    pub r#type: Option<String>,
}

/// Memory entry — a persistent learning.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GalMemory {
    pub name: String,
    pub description: String,
    pub r#type: GalMemoryType,
    pub content: String,
    #[serde(default)]
    pub source: Option<AgentPlatform>,
    #[serde(default)]
    pub captured_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

/// Memory types.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum GalMemoryType {
    #[serde(rename = "user")]
    User,
    #[serde(rename = "feedback")]
    Feedback,
    #[serde(rename = "project")]
    Project,
    #[serde(rename = "reference")]
    Reference,
}

/// Sync state tracking for drift detection.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GalSyncState {
    pub last_sync_timestamp: String,
    pub last_sync_hash: String,
    pub approved_config_hash: String,
    pub last_check_timestamp: String,
    pub organization: String,
    pub version: String,
    #[serde(default)]
    pub policy_name: Option<String>,
    #[serde(default)]
    pub synced_files: Option<Vec<String>>,
    #[serde(default)]
    pub synced_platforms: Option<Vec<AgentPlatform>>,
    #[serde(default)]
    pub hook_settings: Option<GalSyncHookSettings>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GalSyncHookSettings {
    #[serde(default)]
    pub global_interval_minutes: Option<u32>,
    #[serde(default)]
    pub intervals: Option<HashMap<String, u32>>,
}

/// Generated platform-specific config bundle.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GalPlatformBundle {
    pub platform: AgentPlatform,
    pub generated_at: String,
    pub source_hash: String,
    pub files: Vec<GalPlatformFile>,
}

/// Individual file in a platform bundle.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GalPlatformFile {
    pub path: String,
    pub content: String,
    pub hash: String,
}

/// Result of drift detection.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StatusResult {
    pub synced: bool,
    #[serde(default)]
    pub synced_at: Option<String>,
    #[serde(default)]
    pub organization: Option<String>,
    #[serde(default)]
    pub config_version: Option<String>,
    #[serde(default)]
    pub policy_name: Option<String>,
    pub drift_detected: bool,
    #[serde(default)]
    pub drift_files: Vec<DriftFile>,
    pub update_available: bool,
    #[serde(default)]
    pub latest_version: Option<String>,
}

/// Individual file with detected drift.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DriftFile {
    pub path: String,
    pub r#type: DriftFileType,
    pub platform: AgentPlatform,
    #[serde(default)]
    pub expected_hash: Option<String>,
    #[serde(default)]
    pub actual_hash: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum DriftFileType {
    #[serde(rename = "modified")]
    Modified,
    #[serde(rename = "missing")]
    Missing,
    #[serde(rename = "extra")]
    Extra,
}

/// Result of regenerating platform configs.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RegenerateResult {
    pub regenerated_platforms: Vec<AgentPlatform>,
    pub files_written: u32,
    pub regenerated_at: String,
    pub from_config_version: String,
}

/// Gitignore suggestion.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GitignoreSuggestion {
    pub suggested: bool,
    pub gitignore_path: String,
    pub entry_to_add: String,
    pub reason: String,
    pub already_present: bool,
}

// =============================================================================
// Sync State Types (GAL-395: Multi-platform support)
// =============================================================================

/// Per-platform sync state tracking.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlatformSyncState {
    pub last_sync_hash: String,
    pub last_sync_timestamp: String,
    pub approved_config_version: String,
    #[serde(default)]
    pub policy_name: Option<String>,
    pub synced_files: Vec<String>,
}

/// Sync state v2 with multi-platform support.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncState {
    pub organization: String,
    pub schema_version: u32,
    pub platforms: HashMap<String, PlatformSyncState>,
    #[serde(default)]
    pub hook_settings: Option<SyncHookSettings>,
    // Legacy fields (deprecated)
    #[serde(default)]
    pub last_sync_hash: Option<String>,
    #[serde(default)]
    pub last_sync_timestamp: Option<String>,
    #[serde(default)]
    pub synced_files: Option<Vec<String>>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub last_check_timestamp: Option<String>,
    #[serde(default)]
    pub approved_config_hash: Option<String>,
    #[serde(default)]
    pub policy_name: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncHookSettings {
    #[serde(default)]
    pub global_interval_minutes: Option<u32>,
    #[serde(default)]
    pub intervals: Option<HashMap<String, u32>>,
}

/// Result of syncing a single platform.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncResult {
    pub platform: AgentPlatform,
    pub success: bool,
    pub files_written: Vec<String>,
    pub files_skipped: Vec<String>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub version: Option<String>,
    #[serde(default)]
    pub policy_name: Option<String>,
}

/// Combined result of multi-platform sync.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiPlatformSyncResult {
    pub organization: String,
    pub results: Vec<SyncResult>,
    pub summary: SyncSummary,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncSummary {
    pub total_files: u32,
    pub by_platform: HashMap<String, u32>,
}

/// Local config for a specific agent platform.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalConfig {
    pub platform: AgentPlatform,
    pub directory: String,
    pub files: Vec<LocalConfigFile>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalConfigFile {
    pub path: String,
    pub r#type: LocalConfigFileType,
    pub content: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum LocalConfigFileType {
    #[serde(rename = "settings")]
    Settings,
    #[serde(rename = "rule")]
    Rule,
    #[serde(rename = "command")]
    Command,
    #[serde(rename = "hook")]
    Hook,
}

/// A single synced item.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SyncedItem {
    pub path: String,
    pub r#type: SyncedItemType,
    pub name: String,
    #[serde(default)]
    pub description: Option<String>,
    #[serde(default)]
    pub allowed_tools: Option<Vec<String>>,
    #[serde(default)]
    pub platform: Option<AgentPlatform>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SyncedItemType {
    Settings,
    Rules,
    Commands,
    Hooks,
    Agents,
    Mcp,
    Unknown,
}

// =============================================================================
// Session Types — Background Agent Sessions
// =============================================================================

/// Agent identifier for sessions.
#[derive(Debug, Clone, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SessionAgent {
    Claude,
    Codex,
    Gemini,
    #[serde(rename = "cursor-agent")]
    CursorAgent,
    Copilot,
    #[serde(rename = "gal-code")]
    GalCode,
    #[serde(rename = "gal")]
    Gal,
}

/// Session status lifecycle.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SessionStatus {
    PENDING,
    INITIALIZING,
    ACTIVE,
    DISCONNECTED,
    TERMINATED,
    FAILED,
}

/// Machine-readable session failure reason codes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum SessionFailureReason {
    #[serde(rename = "NO_HEARTBEAT")]
    NoHeartbeat,
    #[serde(rename = "PENDING_TIMEOUT")]
    PendingTimeout,
    #[serde(rename = "STRATUS_ORPHAN")]
    StratusOrphan,
    #[serde(rename = "WORKFLOW_FAILED")]
    WorkflowFailed,
    #[serde(rename = "WORKFLOW_CANCELLED")]
    WorkflowCancelled,
    #[serde(rename = "WORKFLOW_TIMED_OUT")]
    WorkflowTimedOut,
    #[serde(rename = "SETUP_FAILED")]
    SetupFailed,
    #[serde(rename = "COMMAND_NOT_FOUND")]
    CommandNotFound,
    #[serde(rename = "NO_OUTPUT")]
    NoOutput,
    #[serde(rename = "WORKFLOW_PERMISSION_DENIED")]
    WorkflowPermissionDenied,
    #[serde(rename = "RUNNER_ERROR")]
    RunnerError,
    #[serde(rename = "RTDB_SYNC_FAILED")]
    RtdbSyncFailed,
    #[serde(rename = "DISPATCH_TRIGGER_FAILED")]
    DispatchTriggerFailed,
    #[serde(rename = "WORKFLOW_TRIGGER_FAILED")]
    WorkflowTriggerFailed,
    #[serde(rename = "UNKNOWN")]
    Unknown,
}

/// MCP server specification for sessions.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpServerSpec {
    pub command: String,
    #[serde(default)]
    pub args: Option<Vec<String>>,
    #[serde(default)]
    pub env: Option<HashMap<String, String>>,
}

/// MCP configuration attached to a session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct McpConfig {
    pub servers: HashMap<String, McpServerSpec>,
}

/// A running agent session on remote infrastructure.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub organization_id: String,
    pub user_id: String,
    pub status: SessionStatus,
    #[serde(default)]
    pub counts_toward_capacity: Option<bool>,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub project_context: Option<String>,
    #[serde(default)]
    pub branch: Option<String>,
    #[serde(default)]
    pub agent: Option<SessionAgent>,
    #[serde(default)]
    pub runner_label: Option<String>,
    #[serde(default)]
    pub runner_id: Option<String>,
    #[serde(default)]
    pub workflow_run_id: Option<i64>,
    pub created_at: Option<String>,
    #[serde(default)]
    pub started_at: Option<String>,
    #[serde(default)]
    pub connected_at: Option<String>,
    #[serde(default)]
    pub last_activity_at: Option<String>,
    #[serde(default)]
    pub terminated_at: Option<String>,
    #[serde(default)]
    pub error_message: Option<String>,
    #[serde(default)]
    pub failure_reason_code: Option<SessionFailureReason>,
    #[serde(default)]
    pub metadata: Option<HashMap<String, serde_json::Value>>,
    #[serde(default)]
    pub tags: Option<Vec<String>>,
    #[serde(default)]
    pub version: Option<u32>,
    #[serde(default)]
    pub last_heartbeat_at: Option<String>,
    #[serde(default)]
    pub first_heartbeat_at: Option<String>,
    #[serde(default)]
    pub startup_latency_ms: Option<u64>,
    #[serde(default)]
    pub agent_session_id: Option<String>,
    #[serde(default)]
    pub name_history: Option<Vec<SessionNameHistoryEntry>>,
    #[serde(default)]
    pub mcp_config: Option<McpConfig>,
}

/// Session name change audit trail entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionNameHistoryEntry {
    pub name: String,
    pub changed_at: String,
    #[serde(default)]
    pub reason: Option<String>,
}

/// ARC runner labels for background agent sessions.
pub const ACTIVE_BACKGROUND_AGENT_RUNNER_LABELS: &[&str] = &[
    "agents-nano-kata-x64",
    "agents-low-kata-x64",
    "agents-standard-kata-x64",
    "agents-medium-kata-x64",
    "agents-high-kata-x64",
    "agents-standard-runc-x64",
    "agents-medium-runc-x64",
    "agents-high-runc-x64",
    "agents-kali-runc",
];

/// Default runner label.
pub const DEFAULT_RUNNER_LABEL: &str = "agents-standard-kata-x64";

/// Dispatch backends.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SessionDispatchBackend {
    #[serde(rename = "stratus")]
    Stratus,
}

/// Dispatch mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SessionDispatchMode {
    #[serde(rename = "direct")]
    Direct,
    #[serde(rename = "queue")]
    Queue,
}

/// Session type for capacity gating.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum SessionType {
    #[serde(rename = "local")]
    Local,
    #[serde(rename = "background")]
    Background,
    #[serde(rename = "orchestrator")]
    Orchestrator,
}

/// Request to create a new session.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreateSessionRequest {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub org: Option<String>,
    #[serde(rename = "projectContext", skip_serializing_if = "Option::is_none")]
    pub project_context: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    #[serde(rename = "initialPrompt", skip_serializing_if = "Option::is_none")]
    pub initial_prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent: Option<SessionAgent>,
    #[serde(rename = "runnerLabel", skip_serializing_if = "Option::is_none")]
    pub runner_label: Option<String>,
    #[serde(rename = "dispatchBackend", skip_serializing_if = "Option::is_none")]
    pub dispatch_backend: Option<SessionDispatchBackend>,
    #[serde(rename = "dispatchMode", skip_serializing_if = "Option::is_none")]
    pub dispatch_mode: Option<SessionDispatchMode>,
    #[serde(rename = "sessionType", skip_serializing_if = "Option::is_none")]
    pub session_type: Option<SessionType>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(rename = "mcpConfig", skip_serializing_if = "Option::is_none")]
    pub mcp_config: Option<McpConfig>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(rename = "swarmRunId", skip_serializing_if = "Option::is_none")]
    pub swarm_run_id: Option<String>,
}

/// Session list response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionListResponse {
    pub sessions: Vec<Session>,
    #[serde(default)]
    pub next_cursor: Option<String>,
    #[serde(default)]
    pub total_count: Option<u32>,
}

// =============================================================================
// Work Item Types
// =============================================================================

/// Work item priority (lower number = higher priority).
pub type WorkItemPriority = u32;

/// Score tier classification for Work Prioritizer 2.0.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum WorkItemScoreTier {
    #[serde(rename = "CRITICAL")]
    Critical,
    #[serde(rename = "HIGH")]
    High,
    #[serde(rename = "MEDIUM")]
    Medium,
    #[serde(rename = "NORMAL")]
    Normal,
    #[serde(rename = "LOW")]
    Low,
}

/// WSJF score breakdown for a work item.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkItemScore {
    pub business_value: f64,
    pub time_criticality: f64,
    pub risk_reduction: f64,
    pub job_size: f64,
    pub cost_of_delay: f64,
    pub wsjf: f64,
    pub stage_bonus: f64,
    pub stage_multiplier: f64,
    pub blocking_count: u32,
    pub blocking_multiplier: f64,
    pub final_score: f64,
    pub tier: WorkItemScoreTier,
    pub calculated_at: String,
}

/// Work item status.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkItemStatus {
    Pending,
    Claimed,
    InProgress,
    Completed,
    Failed,
    Blocked,
}

/// Work item failure category.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkItemFailureCategory {
    StartupFailure,
    CredentialError,
    Timeout,
    RuntimeError,
    CommandExpansion,
    PreflightRejection,
    Manual,
}

/// Type of work to be performed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkItemType {
    PrReview,
    Implement,
    BugFix,
    SdlcTask,
    Session,
    GithubIssue,
}

/// Preferred agent type for work item execution.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum WorkItemAgent {
    Claude,
    Codex,
    Gemini,
    #[serde(rename = "gal-code")]
    GalCode,
    Any,
}

/// Source type for work item creation.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum WorkItemSourceType {
    GithubIssue,
    GithubPr,
    Manual,
    Dashboard,
}

/// Source information for traceability.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkItemSource {
    pub r#type: WorkItemSourceType,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub issue_number: Option<u32>,
    #[serde(default)]
    pub pr_number: Option<u32>,
    #[serde(default)]
    pub repository: Option<String>,
}

/// Work item - unit of work in the job queue.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkItem {
    pub id: String,
    pub organization_id: String,
    pub priority: WorkItemPriority,
    pub status: WorkItemStatus,
    pub r#type: WorkItemType,
    pub source: WorkItemSource,
    pub command: String,
    #[serde(default)]
    pub context: Option<String>,
    #[serde(default)]
    pub preferred_agent: Option<WorkItemAgent>,
    #[serde(default)]
    pub runner_label: Option<String>,
    #[serde(default)]
    pub claimed_by: Option<String>,
    #[serde(default)]
    pub claimed_at: Option<String>,
    #[serde(default)]
    pub last_heartbeat_at: Option<String>,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub workflow_run_id: Option<u32>,
    #[serde(default)]
    pub dispatched_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub started_at: Option<String>,
    #[serde(default)]
    pub completed_at: Option<String>,
    #[serde(default)]
    pub result: Option<WorkItemResult>,
    #[serde(default)]
    pub retry_count: u32,
    #[serde(default)]
    pub max_retries: u32,
    #[serde(default)]
    pub sdlc_phase: Option<u32>,
    #[serde(default)]
    pub parent_issue_id: Option<String>,
    #[serde(default)]
    pub completed_phases: Option<Vec<u32>>,
    #[serde(default)]
    pub current_phase: Option<u32>,
}

/// Work item result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkItemResult {
    pub success: bool,
    #[serde(default)]
    pub message: Option<String>,
    #[serde(default)]
    pub failure_category: Option<WorkItemFailureCategory>,
    #[serde(default)]
    pub workflow_run_url: Option<String>,
    #[serde(default)]
    pub failed_step: Option<String>,
    #[serde(default)]
    pub details: Option<HashMap<String, serde_json::Value>>,
}

// QueueItem is an alias for WorkItem in a queue context.
pub type QueueItem = WorkItem;

// =============================================================================
// User Context Types — capabilities and role detection
// =============================================================================

/// Organization-specific capabilities derived from GitHub role.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OrgCapabilities {
    pub can_manage_approved_config: bool,
    pub can_run_discovery: bool,
    pub can_manage_team: bool,
    pub can_sync_config: bool,
    pub can_change_roles: bool,
    pub can_manage_billing: bool,
}

/// Repository-specific capabilities.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RepoCapabilities {
    pub can_manage_config: bool,
}

/// Organization with detected capabilities.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserOrg {
    pub id: String,
    pub name: String,
    pub github_role: String,
    pub capabilities: OrgCapabilities,
    #[serde(default)]
    pub approved_config_exists: Option<bool>,
    #[serde(default)]
    pub last_discovery_scan: Option<String>,
}

/// Repository with detected capabilities.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserRepo {
    pub owner: String,
    pub name: String,
    pub permission: String,
    pub capabilities: RepoCapabilities,
}

/// User context response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserResponse {
    pub login: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default)]
    pub avatar_url: Option<String>,
    #[serde(default)]
    pub organizations: Option<Vec<String>>,
}

/// Full user context from the API.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserContextResponse {
    pub user: UserContextUser,
    pub orgs: Vec<UserOrg>,
    pub repos: Vec<UserRepo>,
    pub onboarding_status: OnboardingStatusSummary,
    pub recommended_actions: Vec<RecommendedAction>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserContextUser {
    pub id: String,
    pub github_login: String,
    pub email: String,
    pub avatar_url: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnboardingStatusSummary {
    pub completed: bool,
    pub cli_installed: bool,
    pub extension_installed: bool,
    pub github_connected: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecommendedAction {
    pub r#type: String,
    pub title: String,
    pub description: String,
    pub url: String,
    #[serde(default)]
    pub priority: Option<String>,
}

// =============================================================================
// Credential Types
// =============================================================================

/// Supported credential providers.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum CredentialProvider {
    Claude,
    Codex,
    Gemini,
    Cursor,
    #[serde(rename = "gal-code")]
    GalCode,
}

/// Credential status values.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CredentialStatusValue {
    NotConfigured,
    Active,
    Expired,
}

/// Agent credential document.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentCredential {
    pub provider: CredentialProvider,
    pub encrypted_access_token: String,
    pub token_prefix: String,
    pub created_at: String,
    pub updated_at: String,
    #[serde(default)]
    pub expiry_date: Option<u64>,
}

/// Result of validating a credential.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CredentialValidationResult {
    pub valid: bool,
    pub provider: CredentialProvider,
    pub method: CredentialAuthMethod,
    #[serde(default)]
    pub expires_at: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub suggestion: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CredentialAuthMethod {
    Oauth,
    ApiKey,
    Unknown,
}

/// Dispatch readiness result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DispatchReadinessResult {
    pub ready: bool,
    pub provider: CredentialProvider,
    pub method: CredentialAuthMethod,
    pub issues: Vec<String>,
    pub suggestions: Vec<String>,
}

// =============================================================================
// Dispatch Category Types
// =============================================================================

/// Background agent dispatch category.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DispatchCategory {
    pub id: String,
    pub name: String,
    pub description: String,
    pub enabled: bool,
    #[serde(default)]
    pub prompt_hint: Option<String>,
}

/// Background dispatch configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BackgroundDispatchConfig {
    pub enabled: bool,
    pub categories: Vec<DispatchCategory>,
    #[serde(default)]
    pub custom_instructions: Option<String>,
    #[serde(default)]
    pub max_concurrent_agents: Option<u32>,
    #[serde(default)]
    pub preferred_provider: Option<String>,
    #[serde(default)]
    pub hooks_version: Option<u32>,
    #[serde(default)]
    pub hooks_version_updated_at: Option<String>,
    #[serde(default)]
    pub approved_config_schema_version: Option<u32>,
    #[serde(default)]
    pub approved_config_schema_change_type: Option<String>,
    #[serde(default)]
    pub approved_config_schema_diff: Option<Vec<String>>,
    pub updated_at: String,
    pub updated_by: String,
}

// =============================================================================
// Enforcement Mode Types
// =============================================================================

/// Enforcement mode determines what local sessions are allowed to do.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum WorkflowEnforcementMode {
    Off,
    Warn,
    #[serde(rename = "background-only")]
    BackgroundOnly,
}

/// Session role for enforcement.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionRole {
    Orchestrator,
    Worker,
}

/// Org-level enforcement settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkflowEnforcementSettings {
    pub mode: WorkflowEnforcementMode,
    pub enabled: bool,
    #[serde(default)]
    pub blocked_tools: Option<Vec<String>>,
    #[serde(default)]
    pub block_message: Option<String>,
    #[serde(default)]
    pub exempt_users: Option<Vec<String>>,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub updated_by: Option<String>,
}

/// Result of an enforcement check.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnforcementCheckResult {
    pub allowed: bool,
    pub mode: WorkflowEnforcementMode,
    pub session_role: SessionRole,
    #[serde(default)]
    pub reason: Option<String>,
    pub is_warning: bool,
}

/// General enforcement settings (GAL-123).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnforcementSettings {
    pub enabled: bool,
    pub level: EnforcementLevel,
    pub block_on_mismatch: bool,
    pub require_sync: bool,
    pub allow_overrides: bool,
    pub notify_on_violation: bool,
    #[serde(default)]
    pub grace_period_days: Option<u32>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum EnforcementLevel {
    Off,
    Warn,
    Block,
}

// =============================================================================
// Tool Policy Types (#822)
// =============================================================================

/// Organization-level tool policy.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolPolicy {
    pub id: String,
    pub org_name: String,
    pub name: String,
    pub description: String,
    pub rules: Vec<ToolPolicyRule>,
    pub created_by: String,
    pub created_at: String,
    pub updated_at: String,
    pub enabled: bool,
}

/// Tool policy rule.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolPolicyRule {
    pub tool: String,
    pub action: ToolPolicyAction,
    #[serde(default)]
    pub conditions: Option<ToolPolicyConditions>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolPolicyAction {
    Allow,
    Deny,
    Audit,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolPolicyConditions {
    #[serde(default)]
    pub path_pattern: Option<String>,
    #[serde(default)]
    pub command_pattern: Option<String>,
}

/// Tool call audit log entry.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCallAuditLog {
    pub id: String,
    pub session_id: String,
    pub org_name: String,
    pub user_id: String,
    pub tool: String,
    pub action: ToolCallAuditAction,
    pub input: HashMap<String, serde_json::Value>,
    pub timestamp: String,
    #[serde(default)]
    pub policy_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolCallAuditAction {
    Allowed,
    Denied,
    Audited,
}

/// Tool policy evaluation request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolPolicyEvaluationRequest {
    pub tool: String,
    pub input: HashMap<String, serde_json::Value>,
}

/// Tool policy evaluation result.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolPolicyEvaluationResult {
    pub allowed: bool,
    pub action: ToolEvaluationAction,
    #[serde(default)]
    pub matched_policy_id: Option<String>,
    #[serde(default)]
    pub reason: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ToolEvaluationAction {
    Allowed,
    Denied,
    Audited,
}

// =============================================================================
// System Enforcement Types (#183)
// =============================================================================

/// System-level enforcement policy.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemPolicy {
    pub id: String,
    pub org_name: String,
    pub name: String,
    pub scope: SystemPolicyScope,
    pub enforcement_level: SystemEnforcementLevel,
    pub rules: Vec<SystemPolicyRule>,
    pub enabled: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SystemPolicyScope {
    Organization,
    Repository,
    User,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SystemEnforcementLevel {
    Block,
    Warn,
    Audit,
}

/// System policy rule.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SystemPolicyRule {
    pub r#type: SystemPolicyRuleType,
    pub pattern: String,
    pub action: SystemPolicyRuleAction,
    #[serde(default)]
    pub message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum SystemPolicyRuleType {
    ToolRestriction,
    FilePattern,
    CommandPattern,
    NetworkRestriction,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SystemPolicyRuleAction {
    Block,
    Allow,
}

/// Enforcement decision.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnforcementDecision {
    pub allowed: bool,
    pub enforcement_level: SystemEnforcementLevel,
    pub matched_policies: Vec<MatchedPolicy>,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchedPolicy {
    pub policy_id: String,
    pub policy_name: String,
    pub rule_index: u32,
    #[serde(default)]
    pub message: Option<String>,
}

/// Enforcement event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnforcementEvent {
    pub id: String,
    pub org_name: String,
    pub session_id: String,
    pub user_id: String,
    pub tool: String,
    pub input: HashMap<String, serde_json::Value>,
    pub decision: EnforcementDecision,
    pub timestamp: String,
}

// =============================================================================
// Agent Security Policy Types (#2514)
// =============================================================================

/// Agent security policy.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentSecurityPolicy {
    pub id: String,
    pub org_name: String,
    pub name: String,
    pub description: String,
    pub allowed_tools: Vec<String>,
    pub blocked_tools: Vec<String>,
    pub allowed_file_patterns: Vec<String>,
    pub blocked_file_patterns: Vec<String>,
    pub network_restrictions: NetworkRestriction,
    pub enabled: bool,
    pub priority: u32,
    pub created_by: String,
    pub created_at: String,
    pub updated_at: String,
}

/// Network restriction.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkRestriction {
    pub allowed_domains: Vec<String>,
    pub blocked_domains: Vec<String>,
}

/// Merged security policy.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MergedAgentSecurityPolicy {
    pub allowed_tools: Vec<String>,
    pub blocked_tools: Vec<String>,
    pub allowed_file_patterns: Vec<String>,
    pub blocked_file_patterns: Vec<String>,
    pub network_restrictions: NetworkRestriction,
    pub source_policy_ids: Vec<String>,
    pub merged_at: String,
}

// =============================================================================
// SDLC Enforcement Types
// =============================================================================

/// SDLC lifecycle state values.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SdlcLifecycleStateValue {
    Intake,
    Implement,
    Test,
    PrCreated,
    Review,
    MergeReady,
    Merged,
    ReleaseVerify,
}

/// Blocker reason types.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum BlockerReasonType {
    MissingIssueLink,
    MissingPrLink,
    InvalidBranchName,
    CiFailure,
    MergeConflict,
    ReviewRequested,
    ChangesRequested,
    PrBudgetExceeded,
    StaleSession,
    Custom,
}

/// Blocker reason data.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BlockerReasonData {
    pub r#type: BlockerReasonType,
    pub message: String,
    #[serde(default)]
    pub metadata: Option<HashMap<String, serde_json::Value>>,
    pub detected_at: String,
}

/// SDLC stage transition event.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SdlcStageTransition {
    pub work_item_id: String,
    #[serde(default)]
    pub session_id: Option<String>,
    #[serde(default)]
    pub from_state: Option<SdlcLifecycleStateValue>,
    pub to_state: SdlcLifecycleStateValue,
    pub timestamp: String,
    #[serde(default)]
    pub duration_ms: Option<u64>,
    #[serde(default)]
    pub metadata: Option<HashMap<String, serde_json::Value>>,
}

/// SDLC stage metrics.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SdlcStageMetrics {
    pub work_item_id: String,
    pub current_state: SdlcLifecycleStateValue,
    pub time_in_state_ms: u64,
    pub transition_count: u32,
    pub is_blocked: bool,
    #[serde(default)]
    pub total_blocked_time_ms: Option<u64>,
    pub last_transition_at: String,
    pub snapshot_at: String,
}

/// SDLC progress snapshot.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SdlcProgressSnapshot {
    pub work_item_id: String,
    pub organization_id: String,
    #[serde(default)]
    pub current_state: Option<SdlcLifecycleStateValue>,
    pub completed_states: Vec<SdlcLifecycleStateValue>,
    #[serde(default)]
    pub blocker_type: Option<String>,
    pub is_blocked: bool,
    #[serde(default)]
    pub issue_number: Option<String>,
    #[serde(default)]
    pub pr_number: Option<String>,
    #[serde(default)]
    pub branch_name: Option<String>,
    pub timestamp: String,
}

/// PR budget status.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrBudgetStatus {
    pub organization_id: String,
    pub current_open_prs: u32,
    pub max_allowed: u32,
    pub utilization_percent: f64,
    pub should_throttle: bool,
    pub recommended_concurrent: u32,
    #[serde(default)]
    pub by_agent: Option<Vec<PrBudgetByAgent>>,
    pub last_updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PrBudgetByAgent {
    pub agent_id: String,
    pub open_pr_count: u32,
    pub max_allowed: u32,
}

// =============================================================================
// A/B Routing Types (#4886)
// =============================================================================

/// Provider lane buckets for A/B routing.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "kebab-case")]
pub enum ProviderLane {
    Vendor,
    #[serde(rename = "gal-code")]
    GalCode,
}

/// A/B routing mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ABRoutingMode {
    VendorOnly,
    GalCodeOnly,
    Percentage,
    RoundRobin,
    Conditional,
}

/// GAL Code provider endpoint.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GalCodeProviderEndpoint {
    pub name: String,
    pub model_id: String,
    #[serde(default)]
    pub endpoint_url: Option<String>,
    pub enabled: bool,
    #[serde(default)]
    pub weight: Option<u32>,
}

/// A/B routing condition.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ABRoutingCondition {
    #[serde(default)]
    pub labels: Option<Vec<String>>,
    #[serde(default)]
    pub repo: Option<String>,
    #[serde(default)]
    pub complexity: Option<String>,
    #[serde(default)]
    pub category: Option<String>,
}

/// A/B routing rule.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ABRoutingRule {
    pub rule_id: String,
    pub condition: ABRoutingCondition,
    pub lane: ProviderLane,
    #[serde(default)]
    pub description: Option<String>,
    pub enabled: bool,
}

/// Complete A/B routing configuration.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ABRoutingConfig {
    pub enabled: bool,
    pub mode: ABRoutingMode,
    #[serde(default)]
    pub gal_code_percentage: Option<u32>,
    #[serde(default)]
    pub vendor_provider: Option<String>,
    #[serde(default)]
    pub gal_code_providers: Option<Vec<GalCodeProviderEndpoint>>,
    #[serde(default)]
    pub rules: Option<Vec<ABRoutingRule>>,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub updated_by: Option<String>,
}

/// A/B routing decision.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ABRoutingDecision {
    pub lane: ProviderLane,
    pub provider: String,
    pub reason: ABRoutingDecisionReason,
    #[serde(default)]
    pub matched_rule_id: Option<String>,
    #[serde(default)]
    pub gal_code_model_id: Option<String>,
    #[serde(default)]
    pub gal_code_endpoint_url: Option<String>,
    pub config_mode: ABRoutingMode,
    #[serde(default)]
    pub config_gal_code_percentage: Option<u32>,
    #[serde(default)]
    pub random_seed: Option<u32>,
    pub decided_at: String,
}

/// A/B routing decision reason codes.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ABRoutingDecisionReason {
    AbDisabled,
    VendorOnlyMode,
    GalCodeOnlyMode,
    PercentageVendor,
    PercentageGalCode,
    RoundRobinVendor,
    RoundRobinGalCode,
    ConditionalRuleMatch,
    ConditionalDefaultVendor,
    GalCodeFallbackToVendor,
    ExplicitAgentOverride,
}

// =============================================================================
// Telemetry Types
// =============================================================================

/// Telemetry severity levels (GCP Cloud Logging compatible).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum TelemetrySeverity {
    #[serde(rename = "DEFAULT")]
    Default,
    #[serde(rename = "DEBUG")]
    Debug,
    #[serde(rename = "INFO")]
    Info,
    #[serde(rename = "NOTICE")]
    Notice,
    #[serde(rename = "WARNING")]
    Warning,
    #[serde(rename = "ERROR")]
    Error,
    #[serde(rename = "CRITICAL")]
    Critical,
    #[serde(rename = "ALERT")]
    Alert,
    #[serde(rename = "EMERGENCY")]
    Emergency,
}

/// Telemetry resource identifying the source.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryResource {
    pub service: String,
    pub version: String,
    #[serde(default)]
    pub instance_id: Option<String>,
}

/// Telemetry event type.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TelemetryEventType {
    CliCommand,
    HookTriggered,
    AuthLogin,
    SyncPull,
    SessionCreated,
    SessionTerminated,
    BackgroundAgentDispatch,
    ConfigApprove,
}

/// Enhanced telemetry event (OTEL-compatible).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryEvent {
    pub id: String,
    pub timestamp: String,
    pub severity: TelemetrySeverity,
    pub resource: TelemetryResource,
    pub event_type: TelemetryEventType,
    pub attributes: HashMap<String, serde_json::Value>,
    pub installation_id: String,
    #[serde(default)]
    pub trace: Option<TelemetryTrace>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryTrace {
    #[serde(default)]
    pub trace_id: Option<String>,
    #[serde(default)]
    pub span_id: Option<String>,
}

/// Telemetry events request/response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryEventsRequest {
    pub events: Vec<TelemetryEvent>,
    #[serde(default)]
    pub schema_version: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetryEventsResponse {
    pub accepted: bool,
    #[serde(default)]
    pub count: Option<u32>,
    #[serde(default)]
    pub stored: Option<bool>,
    #[serde(default)]
    pub message: Option<String>,
}

// =============================================================================
// User Settings Types
// =============================================================================

/// GAL Code user settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GalCodeUserSettings {
    pub collect_interactive_sessions: bool,
}

/// User settings.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserSettings {
    pub gal_code: GalCodeUserSettings,
}

/// Update user settings request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UpdateUserSettingsRequest {
    #[serde(default)]
    pub gal_code: Option<GalCodeUserSettings>,
}

// =============================================================================
// OAuth Proxy Types
// =============================================================================

/// Enhanced OAuth state structure.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnhancedOAuthState {
    pub state: String,
    #[serde(default)]
    pub redirect_uri: Option<String>,
    pub created_at: u64,
    #[serde(default)]
    pub preview_context: Option<PreviewDeploymentContext>,
}

/// Preview deployment context.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PreviewDeploymentContext {
    #[serde(default)]
    pub pr_number: Option<String>,
    #[serde(default)]
    pub pr_prefix: Option<String>,
    pub environment: String,
    #[serde(default)]
    pub channel: Option<String>,
}

/// OAuth proxy callback request.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthProxyCallbackParams {
    #[serde(default)]
    pub code: Option<String>,
    pub state: String,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub error_description: Option<String>,
}

/// OAuth proxy callback response.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthProxyCallbackResponse {
    pub action: OAuthProxyAction,
    #[serde(default)]
    pub target_url: Option<String>,
    pub status_code: u16,
    #[serde(default)]
    pub error_message: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OAuthProxyAction {
    Redirect,
    Error,
}

/// OAuth proxy routing decision.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthRoutingDecision {
    pub valid: bool,
    pub target_api_url: String,
    #[serde(default)]
    pub preview_context: Option<PreviewDeploymentContext>,
    pub routing_reason: String,
}

/// OAuth proxy error types.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OAuthProxyErrorType {
    InvalidState,
    MalformedParams,
    UrlConstructionFailed,
    RateLimitExceeded,
    InternalError,
}

/// OAuth proxy error.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthProxyError {
    pub r#type: OAuthProxyErrorType,
    pub message: String,
    #[serde(default)]
    pub details: Option<serde_json::Value>,
    #[serde(default)]
    pub request_id: Option<String>,
    pub timestamp: u64,
}

// =============================================================================
// Operations / Work Item Execution Context Types
// =============================================================================

/// Process execution mode.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProcessExecutionMode {
    Agent,
    Hybrid,
    Manual,
    Workforce,
}

/// Process approval policy.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProcessApprovalPolicy {
    AgentAutonomous,
    HumanReviewOnException,
    HumanApprovalRequired,
    HumanExecutionRequired,
    WorkforceExecutionRequired,
}

/// Process risk level.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProcessRiskLevel {
    High,
    Medium,
    Low,
}

/// Business criticality level.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ProcessCriticality {
    Critical,
    High,
    Medium,
    Low,
}

/// Operations boundary state.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum OperationsBoundaryState {
    Missing,
    Agent,
    Hybrid,
    Manual,
    Workforce,
    Disabled,
    Invalid,
    Mismatch,
}

/// Human approval controls.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationsApprovalGate {
    #[serde(default)]
    pub approvers: Option<Vec<String>>,
    #[serde(default)]
    pub timeout_ms: Option<u64>,
    #[serde(default)]
    pub timeout_action: Option<String>,
}

/// Automation scope.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationsAutomationScope {
    #[serde(default)]
    pub allowed_profiles: Option<Vec<String>>,
    #[serde(default)]
    pub allowed_providers: Option<Vec<String>>,
    #[serde(default)]
    pub max_duration_minutes: Option<u32>,
    #[serde(default)]
    pub max_cost_usd: Option<f64>,
}

/// Operations process step contract.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationsProcessStep {
    pub process_key: String,
    pub title: String,
    pub execution_path: ProcessExecutionMode,
    pub enabled: bool,
    #[serde(default)]
    pub source: Option<String>,
    #[serde(default)]
    pub approval_gate: Option<OperationsApprovalGate>,
    #[serde(default)]
    pub automation_scope: Option<OperationsAutomationScope>,
    #[serde(default)]
    pub match_criteria: Option<OperationsMatchCriteria>,
    #[serde(default)]
    pub synced_at: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
    #[serde(default)]
    pub updated_by: Option<String>,
}

/// Match criteria for binding work items to operations boundaries.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OperationsMatchCriteria {
    #[serde(default)]
    pub work_item_types: Option<Vec<WorkItemType>>,
    #[serde(default)]
    pub repository_patterns: Option<Vec<String>>,
    #[serde(default)]
    pub command_patterns: Option<Vec<String>>,
    #[serde(default)]
    pub sdlc_phases: Option<Vec<u32>>,
}

/// Work item execution context (passed via env var).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WorkItemExecutionContext {
    #[serde(default)]
    pub process_key: Option<String>,
    #[serde(default)]
    pub related_process_keys: Option<Vec<String>>,
    #[serde(default)]
    pub project_id: Option<String>,
    #[serde(default)]
    pub schedule_id: Option<String>,
    #[serde(default)]
    pub project_context: Option<String>,
    #[serde(default)]
    pub github_number: Option<u32>,
    #[serde(default)]
    pub work_item_id: Option<String>,
    #[serde(default)]
    pub gal_organization_id: Option<String>,
    #[serde(default)]
    pub requested_by_user_id: Option<String>,
    #[serde(default)]
    pub requested_by: Option<String>,
    #[serde(default)]
    pub approval_state: Option<String>,
    #[serde(default)]
    pub business_criticality: Option<String>,
    #[serde(default)]
    pub operations_boundary: Option<OperationsProcessStep>,
    #[serde(default)]
    pub execution_identity: Option<ExecutionIdentityEnvelope>,
}

/// Execution identity envelope (#4901).
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExecutionIdentityEnvelope {
    pub requester_id: String,
    pub credential_owner_id: String,
    pub execution_owner_id: String,
    pub credential_resolution_method: CredentialResolutionMethod,
    pub resolved_at: String,
}

/// Credential resolution method.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum CredentialResolutionMethod {
    ExplicitCredentialUser,
    CallerIdentity,
    TokenLabel,
    OrgCredentialOwner,
    ProviderCredentialOwner,
}

// =============================================================================
// Approved Config Enforcement Types
// =============================================================================

/// Enforcement manifest for an approved config.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovedConfigEnforcementManifest {
    pub platform: String,
    pub hash: String,
    pub version: String,
    pub approved_at: String,
    pub approved_by: String,
    pub enforcement_settings: EnforcementSettings,
    pub allowed_domains: Vec<String>,
    pub allowed_executables: Vec<String>,
    pub has_mcp: bool,
    pub has_environment: bool,
}

/// Approved config from the API.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovedConfig {
    pub platform: String,
    pub hash: String,
    pub version: String,
    pub approved_at: String,
    pub approved_by: String,
    #[serde(default)]
    pub instructions: Option<ApprovedConfigContent>,
    #[serde(default)]
    pub settings: Option<ApprovedConfigContent>,
    #[serde(default)]
    pub mcp: Option<ApprovedConfigContent>,
    #[serde(default)]
    pub environment: Option<ApprovedConfigContent>,
    #[serde(default)]
    pub commands: Option<Vec<ApprovedConfigContent>>,
    #[serde(default)]
    pub hooks: Option<Vec<ApprovedConfigContent>>,
    #[serde(default)]
    pub subagents: Option<Vec<ApprovedConfigContent>>,
    #[serde(default)]
    pub rules: Option<Vec<ApprovedConfigContent>>,
    #[serde(default)]
    pub skills: Option<Vec<ApprovedConfigContent>>,
    #[serde(default)]
    pub enforcement_settings: Option<EnforcementSettings>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ApprovedConfigContent {
    pub content: String,
}

// =============================================================================
// Common Constants
// =============================================================================

/// Current schema version for the sync state file format.
pub const SYNC_STATE_SCHEMA_VERSION: u32 = 2;

/// Current schema version for the local config.
pub const LOCAL_CONFIG_SCHEMA_VERSION: u32 = 2;
