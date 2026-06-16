/**
 * GAL Telemetry Types
 *
 * Enhanced telemetry types with OTEL-compatible attributes for GCP Cloud Logging.
 * These types are used by both CLI (event producer) and API (event consumer).
 *
 * Design principles:
 * - Anonymous: No PII collected, installation IDs are random UUIDs
 * - OTEL-compatible: Uses OpenTelemetry semantic conventions for resource/attributes
 * - GCP-native: Severity levels map to Cloud Logging levels
 * - Backward compatible: Extends existing CLI telemetry types
 */

// =============================================================================
// OTEL Resource Conventions (service identification)
// See: https://opentelemetry.io/docs/specs/semconv/resource/
// =============================================================================

/**
 * Resource attributes identifying the telemetry source
 * Based on OTEL semantic conventions for resource identification
 */
export interface TelemetryResource {
  /** Service name identifying the telemetry source */
  'service.name': 'gal-cli' | 'gal-run-api' | 'gal-run-dashboard' | 'gal-chrome-extension';

  /** Service version (e.g., '0.1.13') */
  'service.version': string;

  /** Operating system (darwin, linux, win32) */
  'host.os': 'darwin' | 'linux' | 'win32';

  /** CPU architecture (x64, arm64) */
  'host.arch': 'x64' | 'arm64' | 'ia32';

  /** Node.js version (e.g., 'v20.10.0') */
  'process.runtime.version'?: string;
}

// =============================================================================
// Severity Levels (GCP Cloud Logging compatible)
// See: https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#LogSeverity
// =============================================================================

/**
 * Log severity levels compatible with GCP Cloud Logging
 */
export type TelemetrySeverity =
  | 'DEBUG'    // Debug or trace information
  | 'INFO'     // Routine information
  | 'NOTICE'   // Normal but significant events
  | 'WARNING'  // Warning events
  | 'ERROR'    // Error events
  | 'CRITICAL' // Critical events (application may fail)
  | 'ALERT'    // Action must be taken immediately
  | 'EMERGENCY'; // System is unusable

// =============================================================================
// Event Types
// =============================================================================

/**
 * All telemetry event types tracked by GAL CLI
 */
export type TelemetryEventType =
  // CLI command events
  | 'cli_command'        // Any CLI command execution
  | 'cli_error'          // CLI errors/exceptions
  | 'cli_update'         // CLI auto-update attempt (success/failure)

  // Authentication events
  | 'auth_login'         // Successful login
  | 'auth_logout'        // Logout
  | 'auth_expired'       // Token expired
  | 'auth_refresh'       // Token refresh attempt

  // Sync events
  | 'sync_pull'          // Config sync from API
  | 'sync_push'          // Config push (future)
  | 'sync_conflict'      // Sync conflict detected

  // Hook events
  | 'hook_triggered'     // Hook notification shown
  | 'hook_error'         // Hook execution failed
  | 'hook_dismissed'     // User dismissed hook notification

  // Config events
  | 'config_loaded'      // Config file loaded
  | 'config_error'       // Config parsing/validation error

  // Developer status events (GAL-130)
  | 'developer_status'   // Periodic status report
  | 'heartbeat'           // Health check ping

  // Server-side events (Issue #1691)
  | 'session.create'      // Background agent session created
  | 'session.complete'    // Background agent session finished
  | 'background_agent.dispatch' // Background agent dispatched
  | 'config.approve'    // Approved config set/updated
  | 'auto_approval.settings_updated' // Auto-approval settings changed
  | 'auto_approval.evaluated' // Auto-approval model decision recorded
  | 'auto_approval.acted' // Auto-approval took action on a proposal
  | 'auto_approval.fallback' // Auto-approval fell back due to timeout/error

  // Convenience model events (Issue #1772 - Data Loop + KPI Gates)
  | 'model.discovery_request'     // Auto-discovery model invocation
  | 'model.approved_config_request' // Approved config generation request
  | 'model.sync_request'          // Config sync model invocation
  | 'model.validation'            // Model output validation result
  | 'model.fallback'              // Model fallback triggered
  | 'model.outcome'               // Final user/system outcome

  // Orchestrator decision events (Issue #2119 - Decision Telemetry)
  | 'orchestrator.dispatch'       // Orchestrator dispatch decision (provider routing, confidence, fallback)
  | 'orchestrator.claim'          // Work item claim decision (atomic claim, release, stale override)
  | 'orchestrator.merge'          // PR merge decision (auto-merge, admin merge, squash)
  | 'orchestrator.fallback'       // Orchestrator fallback triggered (credential, confidence, policy)
  | 'orchestrator.override'       // Manual control plane override applied

  // Learnings events (Issue #2851 - Discovery/Approval/Sync loop signals)
  | 'learnings.discovery_updated'     // Discovery aggregate updated after scan
  | 'learnings.approval_updated'      // Approval aggregate updated after review
  | 'learnings.sync_updated'          // Sync aggregate updated after pull

  // Chrome Extension events (Issue #3855)
  | 'extension.installed'             // First install (chrome.runtime.onInstalled reason=install)
  | 'extension.updated'               // Version update (chrome.runtime.onInstalled reason=update)
  | 'extension.session_start'         // Service worker activated / popup opened (version heartbeat)
  | 'extension.popup_opened'          // User opens the GAL popup
  | 'extension.palette_opened'        // Command palette opened (Ctrl+Shift+P)
  | 'extension.workflow_palette_opened' // Workflow injection palette opened (Ctrl+Shift+G)
  | 'extension.platform_detected'     // Content script detected a supported platform
  | 'extension.workflow_selected'     // User selected a workflow from palette
  | 'extension.workflow_injected'     // Workflow text injected into chatbox
  | 'extension.workflow_dismissed'    // Palette closed without injecting
  | 'extension.scan_triggered'        // User triggered a repo scan
  | 'extension.scan_completed'        // Scan completed
  | 'extension.auth_changed'          // Auth state changed (login/logout/expired)
  | 'extension.org_selected'          // User switched active org
  | 'extension.config_fetched'        // Approved config fetched from API
  | 'extension.button_toggled';       // Chatbox injection button enabled/disabled



// =============================================================================
// Event Attributes (OTEL-compatible)
// =============================================================================

/**
 * Common attributes present on all events
 */
export interface CommonEventAttributes {
  /** CLI command that was executed (e.g., 'sync', 'auth login') */
  command?: string;

  /** Subcommand if applicable (e.g., 'pull' for 'sync pull') */
  subcommand?: string;

  /** Whether the operation succeeded */
  success?: boolean;

  /** Duration of the operation in milliseconds */
  duration_ms?: number;

  /** Error type if operation failed (e.g., 'NETWORK_ERROR', 'AUTH_EXPIRED') */
  error_type?: string;

  /** Error message (sanitized, no PII) */
  error_message?: string;

  /** Exit code if applicable */
  exit_code?: number;
}

/**
 * Attributes for command execution events
 */
export interface CommandEventAttributes extends CommonEventAttributes {
  /** Arguments passed to the command (sanitized) */
  args?: string;

  /** Config version being used */
  config_version?: string;
}

/**
 * Attributes for authentication events
 */
export interface AuthEventAttributes extends CommonEventAttributes {
  /** Authentication method used */
  auth_method?: 'github_oauth' | 'dev_token' | 'ci_token';

  /** Whether this is a first-time login */
  is_first_login?: boolean;

  /** Token expiration time (ISO 8601) */
  token_expires_at?: string;
}

/**
 * Attributes for sync events
 */
export interface SyncEventAttributes extends CommonEventAttributes {
  /** Number of files synced */
  files_synced?: number;

  /** Config version synced to */
  config_version?: string;

  /** Hours since last sync */
  sync_age_hours?: number;

  /** Whether sync was forced */
  forced?: boolean;
}

/**
 * Attributes for hook events
 */
export interface HookEventAttributes extends CommonEventAttributes {
  /** Hook name (e.g., 'pre-prompt-submit') */
  hook_name?: string;

  /** Notification type shown */
  notification_type?: string;

  /** Whether rate limit was hit */
  rate_limit_hit?: boolean;

  /** User action taken */
  user_action?: 'dismissed' | 'clicked' | 'ignored';
}

/**
 * Attributes for developer status events (GAL-130)
 */
export interface DeveloperStatusAttributes {
  /** Developer's organization */
  organization?: string;

  /** CLI version installed */
  cli_version?: string;

  /** Platform (darwin, linux, win32) */
  platform?: 'darwin' | 'linux' | 'win32';

  /** Config version synced */
  config_version?: string | null;

  /** Last sync timestamp (ISO 8601) */
  last_sync_at?: string | null;

  /** Compliance status */
  compliance?: {
    hooks_installed: boolean;
    config_up_to_date: boolean;
    auth_valid: boolean;
  };

  /** Last active timestamp (ISO 8601) */
  last_active_at?: string;

  /** Number of sessions in last 24h */
  session_count_24h?: number;
}

/**
 * Attributes for session lifecycle events (Issue #1691)
 */
export interface SessionEventAttributes extends CommonEventAttributes {
  /** Session ID */
  session_id?: string;

  /** Organization that owns the session */
  organization_id?: string;

  /** User who created the session */
  user_id?: string;

  /** AI agent used (claude, codex, gemini) */
  agent?: string;

  /** Project context (owner/repo) */
  project_context?: string;

  /** Session name */
  session_name?: string;

  /** Runner label */
  runner_label?: string;

  /** Dispatch backend (gha, hive, warm-pool, auto) */
  dispatch_backend?: string;

  /** Workflow run ID (GitHub Actions) */
  workflow_run_id?: number;

  /** Final session status (for session.complete) */
  final_status?: string;

  /** Terminate reason (for session.complete) */
  terminate_reason?: string;
}

/**
 * Attributes for background agent dispatch events (Issue #1691)
 */
export interface BackgroundAgentDispatchAttributes extends CommonEventAttributes {
  /** Session ID being dispatched */
  session_id?: string;

  /** Dispatch backend used */
  dispatch_backend?: string;

  /** Workflow run ID returned by dispatch */
  workflow_run_id?: number;

  /** Organization ID */
  organization_id?: string;

  /** AI agent name */
  agent?: string;

  /** Project context (owner/repo) */
  project_context?: string;
}

/**
 * Attributes for config approval events (Issue #1691)
 */
export interface ConfigApproveAttributes extends CommonEventAttributes {
  /** Organization name */
  organization?: string;

  /** Platform (claude, cursor, copilot, gemini, codex, windsurf) */
  platform?: string;

  /** Config hash */
  config_hash?: string;

  /** Policy name */
  policy_name?: string;

  /** User who approved */
  approved_by?: string;
}

/**
 * Attributes for convenience model events (Issue #1772)
 * Used for training/eval data loop and KPI gates
 */
export interface ConvenienceModelEventAttributes extends CommonEventAttributes {
  /** Feature type (discovery, approved_config, sync) */
  feature_type?: 'discovery' | 'approved_config' | 'sync';

  /** Request context (redacted - no PII) */
  request_context?: {
    /** Organization ID (for approved config/sync) */
    organization_id?: string;
    /** Platform being discovered/configured */
    platform?: string;
    /** Client surface emitting the model request */
    client_surface?:
      | 'api'
      | 'cli'
      | 'dashboard'
      | 'vscode_extension'
      | 'chrome_extension'
      | 'mcp_session'
      | 'background_agent';
    /** Number of repos in scope */
    repo_count?: number;
    /** Request parameters hash (for deduplication) */
    request_hash?: string;
  };

  /** Model output metadata */
  model_output?: {
    /** Whether output is valid JSON */
    is_valid_json?: boolean;
    /** Model used (e.g., 'claude-3-haiku', 'gpt-4') */
    model_name?: string;
    /** Token count (if available) */
    token_count?: number;
    /** Latency in milliseconds */
    latency_ms?: number;
    /** Output hash (for content analysis) */
    output_hash?: string;
  };

  /** Validation result */
  validation?: {
    /** Whether validation passed */
    passed?: boolean;
    /** Validation errors (redacted) */
    error_types?: string[];
    /** Validator name */
    validator?: string;
  };

  /** Policy check result (for enforcement tier) */
  policy?: {
    /** Whether policy check passed */
    passed?: boolean;
    /** Policy violations (redacted) */
    violation_types?: string[];
    /** Policy name */
    policy_name?: string;
  };

  /** Fallback information */
  fallback?: {
    /** Whether fallback was triggered */
    triggered?: boolean;
    /** Fallback reason */
    reason?: 'validation_failure' | 'timeout' | 'model_error' | 'rate_limit' | 'policy_violation';
    /** Fallback strategy used */
    strategy?: 'static_default' | 'cached_response' | 'degraded_mode' | 'manual_override';
  };

  /** Final outcome */
  outcome?: {
    /** Whether the operation succeeded for the user */
    user_success?: boolean;
    /** Business metric proxy (e.g., 'config_applied', 'repos_synced') */
    metric?: string;
    /** Metric value */
    metric_value?: number;
    /** User feedback (if available) */
    user_rating?: number;
  };

  /** Rollout/experiment context */
  experiment?: {
    /** Rollout mode (shadow, enforce) */
    mode?: 'shadow' | 'enforce';
    /** Experiment ID */
    experiment_id?: string;
    /** Variant (e.g., 'control', 'treatment') */
    variant?: string;
  };
}

/**
 * Attributes for orchestrator decision events (Issue #2119)
 * Captures why a provider was chosen, fallback paths, and risk signals
 * for the data flywheel.
 */
export interface OrchestratorDecisionEventAttributes extends CommonEventAttributes {
  /** Organization ID the decision was made for */
  organization_id?: string;

  /** User who triggered the decision */
  user_id?: string;

  /** Session ID (for dispatch decisions) */
  session_id?: string;

  /** Work item ID (for claim/complete decisions) */
  work_item_id?: string;

  /** Decision action (dispatch, claim, release, complete, fail, override) */
  decision_action?: string;

  /** Source of the decision (client, inference, control-plane, none) */
  decision_source?: string;

  /** Whether the orchestrator decision was applied vs fell back to baseline */
  decision_applied?: boolean;

  /** Baseline agent before orchestrator routing */
  baseline_agent?: string;

  /** Agent selected by orchestrator (may differ from effective) */
  selected_agent?: string;

  /** Effective agent after fallback resolution */
  effective_agent?: string;

  /** Whether the agent was changed from baseline */
  agent_changed?: boolean;

  /** Orchestrator confidence score (0-1) */
  confidence?: number;

  /** Rollout mode (disabled, shadow, enforce) */
  rollout_mode?: string;

  /** Rollout percentage the org is subject to */
  rollout_percentage?: number;

  /** Whether the org was targeted by rollout */
  targeted?: boolean;

  /** Targeting gate reason (TARGETED, NOT_TARGETED, ORG_DENYLIST, etc.) */
  targeting_reason?: string;

  /** Fallback reason if decision was not applied */
  fallback_reason?: string;

  /** Whether credential fallback was triggered */
  credential_fallback?: boolean;

  /** Agent that credential fallback originated from */
  credential_fallback_from?: string;

  /** Agent that credential fallback landed on */
  credential_fallback_to?: string;

  /** Inference latency in milliseconds (if inference was used) */
  inference_latency_ms?: number;

  /** Inference provider (e.g., governance-model) */
  inference_provider?: string;

  /** Inference model (e.g., gemini-2.5-flash) */
  inference_model?: string;

  /** Whether policy validation passed */
  policy_valid?: boolean;

  /** Number of policy violations */
  policy_violations?: number;

  /** Number of policy warnings */
  policy_warnings?: number;

  /** Risk flags emitted by the orchestrator */
  risk_flags?: string;

  /** Dispatch backend used (gha, hive, warm-pool, auto) */
  dispatch_backend?: string;

  /** Override type (pause, resume, reroute, cancel) for manual overrides */
  override_type?: string;

  /** Who issued the override */
  override_issued_by?: string;

  /** Dispatch retry attempt number */
  dispatch_attempt?: number;

  /** Selected provider score (lower is better) */
  provider_score?: number;
}

/**
 * Attributes for Chrome Extension events (Issue #3855)
 */
export interface ExtensionEventAttributes extends CommonEventAttributes {
  /** Extension version (e.g., '0.0.286') */
  extension_version?: string;

  /** Detected AI platform (claude, chatgpt, gemini, etc.) */
  platform?: string;

  /** Previous extension version (for update events) */
  previous_version?: string;

  /** Number of workflows available */
  workflow_count?: number;

  /** Workflow ID that was selected/injected */
  workflow_id?: string;

  /** Number of configs found during scan */
  configs_found?: number;

  /** Auth state (authenticated, unauthenticated, expired) */
  auth_state?: 'authenticated' | 'unauthenticated' | 'expired';

  /** Config version fetched */
  config_version?: string;

  /** Whether chatbox injection button is enabled */
  button_enabled?: boolean;
}

/**
 * Union of all event attribute types
 */
export type TelemetryEventAttributes =
  | CommonEventAttributes
  | CommandEventAttributes
  | AuthEventAttributes
  | SyncEventAttributes
  | HookEventAttributes
  | DeveloperStatusAttributes
  | SessionEventAttributes
  | BackgroundAgentDispatchAttributes
  | ConfigApproveAttributes
  | ConvenienceModelEventAttributes
  | OrchestratorDecisionEventAttributes
  | ExtensionEventAttributes;

// =============================================================================
// Enhanced Telemetry Event (OTEL-compatible)
// =============================================================================

/**
 * Enhanced telemetry event with OTEL-compatible structure
 *
 * This structure is designed to work with:
 * - GCP Cloud Logging (severity, timestamp format)
 * - OpenTelemetry (resource, attributes naming)
 * - Existing CLI telemetry (backward compatible)
 */
export interface EnhancedTelemetryEvent {
  /** Unique event ID (UUID) */
  id: string;

  /** Timestamp in ISO 8601 format */
  timestamp: string;

  /** Severity level (GCP Cloud Logging compatible) */
  severity: TelemetrySeverity;

  /** Resource identifying the telemetry source */
  resource: TelemetryResource;

  /** Event type */
  eventType: TelemetryEventType;

  /** Event-specific attributes */
  attributes: Record<string, string | number | boolean | null>;

  /** Anonymous installation ID (random UUID, not tied to identity) */
  installationId: string;

  /** Optional trace context for distributed tracing (future) */
  trace?: {
    traceId?: string;
    spanId?: string;
  };
}

// =============================================================================
// Legacy Types (for backward compatibility)
// =============================================================================

/**
 * Legacy event type (v1) - still supported
 * @deprecated Use EnhancedTelemetryEvent for new implementations
 */
export type LegacyTelemetryEventType =
  | 'cli_command'
  | 'hook_triggered'
  | 'auth_login'
  | 'sync_pull';

/**
 * Legacy payload structure (v1)
 * @deprecated Use typed attributes from EnhancedTelemetryEvent
 */
export interface LegacyTelemetryPayload {
  command?: string;
  success?: boolean;
  errorType?: string;
  durationMs?: number;
  cliVersion?: string;
  platform?: 'darwin' | 'linux' | 'win32';
  nodeVersion?: string;
  notificationType?: string;
  rateLimitHit?: boolean;
  syncAgeHours?: number;
  filesTracked?: number;
}

/**
 * Legacy telemetry event (v1)
 * @deprecated Use EnhancedTelemetryEvent for new implementations
 */
export interface LegacyTelemetryEvent {
  id: string;
  installationId: string;
  timestamp: string;
  eventType: LegacyTelemetryEventType;
  payload: LegacyTelemetryPayload;
}

// =============================================================================
// API Request/Response Types
// =============================================================================

/**
 * Request body for POST /telemetry/events
 */
export interface TelemetryEventsRequest {
  /** Events to store (supports both legacy and enhanced formats) */
  events: (EnhancedTelemetryEvent | LegacyTelemetryEvent)[];

  /** Schema version (v1 = legacy, v2 = enhanced) */
  schemaVersion?: 'v1' | 'v2';
}

/**
 * Response from POST /telemetry/events
 */
export interface TelemetryEventsResponse {
  accepted: boolean;
  count?: number;
  stored?: boolean;
  message?: string;
}

/**
 * Request body for POST /telemetry/feedback
 */
export interface TelemetryFeedbackRequest {
  installationId: string;
  rating?: number; // 1-5 satisfaction rating
  comment?: string;
  context?: {
    command?: string;
    errorType?: string;
    errorMessage?: string;
    cliVersion?: string;
    platform?: string;
  };
}

/**
 * Response from POST /telemetry/feedback
 */
export interface TelemetryFeedbackResponse {
  accepted: boolean;
  feedbackId?: string;
}

// =============================================================================
// Developer Status Report (GAL-130)
// =============================================================================

/**
 * Developer status report sent periodically from CLI
 * Used for the developer status dashboard feature
 */
export interface DeveloperStatusReport {
  /** Developer identification (from auth token) */
  developerId: string;

  /** GitHub username */
  githubLogin: string;

  /** Organization the developer belongs to */
  organization: string;

  /** CLI installation info */
  cli: {
    version: string;
    platform: 'darwin' | 'linux' | 'win32';
    nodeVersion: string;
    installedAt?: string;
  };

  /** Config sync status */
  config: {
    version: string | null;
    lastSyncAt: string | null;
    isUpToDate: boolean;
  };

  /** Authentication status */
  auth: {
    valid: boolean;
    expiresAt?: string;
    method?: 'github_oauth' | 'dev_token' | 'ci_token';
  };

  /** Compliance status */
  compliance: {
    hooksInstalled: boolean;
    configUpToDate: boolean;
    authValid: boolean;
  };

  /** Activity metrics */
  activity: {
    lastActiveAt: string;
    sessionCount24h: number;
    commandCount24h: number;
  };

  /** Report timestamp */
  reportedAt: string;
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * Check if an event is in the enhanced format (v2)
 */
export function isEnhancedEvent(
  event: EnhancedTelemetryEvent | LegacyTelemetryEvent
): event is EnhancedTelemetryEvent {
  return 'resource' in event && 'severity' in event;
}

/**
 * Convert legacy event to enhanced format
 */
export function upgradeToEnhancedEvent(
  legacy: LegacyTelemetryEvent
): EnhancedTelemetryEvent {
  return {
    id: legacy.id,
    timestamp: legacy.timestamp,
    severity: legacy.payload.success === false ? 'ERROR' : 'INFO',
    resource: {
      'service.name': 'gal-cli',
      'service.version': legacy.payload.cliVersion || 'unknown',
      'host.os': legacy.payload.platform || 'linux',
      'host.arch': 'x64', // Default, not available in legacy
      'process.runtime.version': legacy.payload.nodeVersion,
    },
    eventType: legacy.eventType as TelemetryEventType,
    attributes: {
      command: legacy.payload.command ?? null,
      success: legacy.payload.success ?? null,
      error_type: legacy.payload.errorType ?? null,
      duration_ms: legacy.payload.durationMs ?? null,
      notification_type: legacy.payload.notificationType ?? null,
      rate_limit_hit: legacy.payload.rateLimitHit ?? null,
      sync_age_hours: legacy.payload.syncAgeHours ?? null,
      files_synced: legacy.payload.filesTracked ?? null,
    },
    installationId: legacy.installationId,
  };
}

/**
 * Map severity to GCP log level number
 * See: https://cloud.google.com/logging/docs/reference/v2/rest/v2/LogEntry#LogSeverity
 */
export function severityToNumber(severity: TelemetrySeverity): number {
  const levels: Record<TelemetrySeverity, number> = {
    DEBUG: 100,
    INFO: 200,
    NOTICE: 300,
    WARNING: 400,
    ERROR: 500,
    CRITICAL: 600,
    ALERT: 700,
    EMERGENCY: 800,
  };
  return levels[severity];
}
