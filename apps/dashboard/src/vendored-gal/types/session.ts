/**
 * Background Agent Session Types
 *
 * Types for managing Claude Code agent sessions running on remote infrastructure.
 */

// =============================================================================
// CLI Agent Types (#610)
// =============================================================================

/**
 * Supported CLI agents for background sessions.
 */
export type SessionAgent = 'claude' | 'codex' | 'gemini' | 'cursor-agent' | 'copilot' | 'oss' | 'gal';

/**
 * Configuration for a CLI agent.
 */
export interface SessionAgentConfig {
  /** Agent identifier */
  id: SessionAgent;
  /** Display name for the UI */
  displayName: string;
  /** Icon (emoji) for the agent */
  icon: string;
  /** Description of the agent */
  description: string;
}

/**
 * Available CLI agents configuration.
 */
export const SESSION_AGENTS: SessionAgentConfig[] = [
  { id: 'claude', displayName: 'Claude Code', icon: '🤖', description: 'Anthropic Claude Code CLI' },
  { id: 'codex', displayName: 'Codex CLI', icon: '🌟', description: 'OpenAI Codex CLI' },
  { id: 'gemini', displayName: 'Gemini CLI', icon: '💎', description: 'Google Gemini CLI' },
  { id: 'cursor-agent', displayName: 'Cursor Agent', icon: '🎯', description: 'Cursor AI Agent' },
  { id: 'copilot', displayName: 'GitHub Copilot', icon: '🚀', description: 'GitHub Copilot CLI' },
  { id: 'oss', displayName: 'GAL Code (GLM-5)', icon: '🔓', description: 'GAL Code gateway for the GLM-5 executor lane' },
  { id: 'gal', displayName: 'GAL Code', icon: '🧠', description: 'GAL Code executor lane (GLM-5)' },
];

/**
 * Default agent when no selection is made.
 */
export const DEFAULT_SESSION_AGENT: SessionAgent = 'claude';

// =============================================================================
// Session Status Types
// =============================================================================

/**
 * Session status representing the lifecycle of a background agent session.
 */
export type SessionStatus =
  | 'PENDING' // Session created, waiting for runner
  | 'INITIALIZING' // Runner started, Claude Code launching
  | 'ACTIVE' // Session running, accepting input
  | 'DISCONNECTED' // Temporary connection loss
  | 'TERMINATED' // Session ended (user or timeout)
  | 'FAILED'; // Session failed to start

/**
 * Machine-readable failure reason codes for session failure classification (#978).
 * Stored in Session.failureReasonCode to enable filtering, alerting, and diagnostics.
 */
export type SessionFailureReason =
  | 'NO_HEARTBEAT'              // Watchdog: session stopped sending heartbeats
  | 'PENDING_TIMEOUT'           // Cleanup: session never progressed past PENDING/INITIALIZING
  | 'NON_GHA_ORPHAN'            // Cleanup: non-GHA dispatch (Hive/WarmPool) never connected
  | 'WORKFLOW_FAILED'           // GHA workflow concluded with failure
  | 'WORKFLOW_CANCELLED'        // GHA workflow was cancelled
  | 'WORKFLOW_TIMED_OUT'        // GHA workflow timed out
  | 'SETUP_FAILED'              // Pre-session: fast_setup step failed before runner started
  | 'COMMAND_NOT_FOUND'         // Runner: slash command not found or produced no output
  | 'NO_OUTPUT'                 // Runner: session completed with no text output
  | 'WORKFLOW_PERMISSION_DENIED'// Runner: push denied due to missing workflows:write permission
  | 'RUNNER_ERROR'              // Runner: uncaught exception during session execution
  | 'RTDB_SYNC_FAILED'          // Runner: RTDB status update failed (Firestore may diverge)
  | 'WORKFLOW_TRIGGER_FAILED'   // Dispatch: GitHub Actions workflow_dispatch call failed
  | 'UNKNOWN';                  // Catch-all for unclassified failures

/**
 * A single MCP server entry passed to an agent session (#6307).
 * Matches the shape consumed by the Claude Agent SDK's `mcpServers` option.
 */
export interface McpServerSpec {
  /** Executable to launch (e.g. "node", "python"). */
  command: string;
  /** Arguments passed to the command. */
  args?: string[];
  /** Environment variables scoped to this MCP server. */
  env?: Record<string, string>;
}

/**
 * MCP configuration attached to a session at creation (#6307).
 *
 * The API accepts this as an optional field on `CreateSessionRequest` and
 * persists it verbatim on `Session` so the runner can load the listed MCP
 * servers before the agent starts. Enables the web-coding-agent pattern:
 * product-specific MCP servers (e.g. financial) get injected into a GAL Code
 * session without the session code knowing about the product.
 */
export interface McpConfig {
  /** Map of logical server name -> server spec. */
  servers: Record<string, McpServerSpec>;
}

/**
 * A running Claude Code instance on remote infrastructure.
 */
export interface Session {
  /** Unique session identifier (UUID v4) */
  id: string;
  /** Organization that owns the session */
  organizationId: string;
  /** User who created the session */
  userId: string;
  /** Current session state */
  status: SessionStatus;
  /**
   * Whether this session currently consumes worker pool capacity.
   * Computed by the API using the same rules as capacity snapshots.
   */
  countsTowardCapacity?: boolean;
  /** User-friendly session name */
  name?: string;
  /** Repository or project path context */
  projectContext?: string;
  /** Git branch to checkout */
  branch?: string;
  /** CLI agent to use for the session (default: claude) */
  agent?: SessionAgent;
  /** ARC runner label targeted for this session */
  runnerLabel?: RunnerLabel;
  /** GitHub Actions runner ID when running */
  runnerId?: string;
  /** GitHub Actions workflow run ID */
  workflowRunId?: number;
  /**
   * Session creation time.
   * Write paths store a Date (Firestore converts to Timestamp for proper ordering).
   * Read paths (API responses) return an ISO 8601 string via `.toDate().toISOString()`.
   * TODO(#3405): Migrate existing documents and narrow back to `string` after backfill.
   */
  createdAt: string | Date;
  /** When Claude Code started. See `createdAt` note on Date vs string. */
  startedAt?: string | Date;
  /** When dashboard connected to session (ISO 8601) */
  connectedAt?: string;
  /** Last input/output time. See `createdAt` note on Date vs string. */
  lastActivityAt?: string | Date;
  /** Session end time. See `createdAt` note on Date vs string. */
  terminatedAt?: string | Date;
  /** Error message if session failed */
  errorMessage?: string;
  /** Machine-readable failure reason code for classification (#978) */
  failureReasonCode?: SessionFailureReason;
  /** Additional session metadata */
  metadata?: Record<string, unknown>;
  /** Version for optimistic locking (#641) - incremented on each update */
  version?: number;
  /** Last heartbeat timestamp for stale session detection (#643). See `createdAt` note on Date vs string. */
  lastHeartbeatAt?: string | Date;
  /** First successful runner/API heartbeat timestamp. Used for startup SLO proof. */
  firstHeartbeatAt?: string | Date;
  /** Milliseconds from session creation to first successful runner/API heartbeat. */
  startupLatencyMs?: number;
  /** Agent's internal session ID for resume support */
  agentSessionId?: string;
  /** Audit trail of name changes (#1924) - preserves original name + rename history */
  nameHistory?: SessionNameHistoryEntry[];
  /** MCP servers attached to this session (#6307). Loaded by the runner at startup. */
  mcpConfig?: McpConfig;
}

/**
 * A single entry in the session name audit trail (#1924).
 */
export interface SessionNameHistoryEntry {
  /** The name value that was set */
  name: string;
  /** ISO 8601 timestamp when this name was set */
  changedAt: string;
  /** Reason for the change (e.g. "directive_scope_change", "manual_rename") */
  reason?: string;
}

/**
 * Active ARC runner labels for background agent sessions.
 * These map to the currently deployed x64 Kata-backed agent scale sets.
 */
export const ACTIVE_BACKGROUND_AGENT_RUNNER_LABELS = [
  'agents-standard-runc-x64',
  'agents-medium-runc-x64',
  'agents-high-runc-x64',
  'agents-kali-runc',
] as const;

/** Runner labels that require security role or admin to dispatch. */
export const SECURITY_GATED_RUNNER_LABELS: ReadonlySet<string> = new Set([
  'agents-kali-runc',
]);

export type ActiveBackgroundAgentRunnerLabel =
  (typeof ACTIVE_BACKGROUND_AGENT_RUNNER_LABELS)[number];

/**
 * Legacy background-agent runner labels that still appear in older sessions,
 * workflow inputs, or stored queue metadata.
 *
 * These aliases now normalize to the x64 Kata-backed lanes.
 */
export const RETIRED_BACKGROUND_AGENT_RUNNER_LABELS = {
  'arc-linux-agents': 'agents-standard-runc-x64',
  'arc-linux-agents-runc': 'agents-standard-runc-x64',
  'agents-standard-runc': 'agents-standard-runc-x64',
  'agents-medium-runc': 'agents-medium-runc-x64',
  'agents-high-runc': 'agents-high-runc-x64',
  'agents-standard-vz-arm64': 'agents-standard-runc-x64',
  'agents-medium-vz-arm64': 'agents-medium-runc-x64',
  'agents-high-vz-arm64': 'agents-high-runc-x64',
} as const;

export type RetiredBackgroundAgentRunnerLabel =
  keyof typeof RETIRED_BACKGROUND_AGENT_RUNNER_LABELS;

/**
 * ARC runner labels accepted by the background-session API.
 * Retired labels are normalized to active x64 Kata-backed lanes before dispatch.
 */
export type RunnerLabel =
  | ActiveBackgroundAgentRunnerLabel
  | RetiredBackgroundAgentRunnerLabel;

export function isActiveBackgroundAgentRunnerLabel(
  value: string,
): value is ActiveBackgroundAgentRunnerLabel {
  return (
    ACTIVE_BACKGROUND_AGENT_RUNNER_LABELS as readonly string[]
  ).includes(value);
}

export function normalizeBackgroundAgentRunnerLabel(
  value?: string | null,
): ActiveBackgroundAgentRunnerLabel | undefined {
  if (!value) return undefined;
  if (isActiveBackgroundAgentRunnerLabel(value)) return value;
  return RETIRED_BACKGROUND_AGENT_RUNNER_LABELS[
    value as RetiredBackgroundAgentRunnerLabel
  ];
}

/**
 * Default runner label for background agent sessions.
 * Must match an actually deployed ARC scale set name.
 * See: kubectl get autoscalingrunnerset -n arc-runners
 */
export const DEFAULT_RUNNER_LABEL: ActiveBackgroundAgentRunnerLabel =
  'agents-standard-runc-x64';

/**
 * Where to run background agent sessions.
 * - auto: Use server routing rules (default).
 * - gha: Force GitHub Actions workflow dispatch.
 * - hive: Force Hive dispatch (pre-warmed VM pool).
 * - warm-pool: Force warm pool dispatch (pre-warmed K8s daemon pods).
 */
export type SessionDispatchBackend = 'auto' | 'gha' | 'hive' | 'warm-pool';

/**
 * How to dispatch a background agent session.
 * - direct: Trigger workflow immediately (current default).
 * - queue: Create a work item; agent picks it up via `gal agent queue`.
 */
export type SessionDispatchMode = 'direct' | 'queue';

/**
 * Session type distinguishes between worker sessions (counted toward pool capacity)
 * and control-plane sessions (excluded from capacity gating).
 *
 * - local: Interactive local session (capacity-gated)
 * - background: Remote worker session (capacity-gated)
 * - orchestrator: Control-plane session for steering/coordination (NOT capacity-gated)
 */
export type SessionType = 'local' | 'background' | 'orchestrator';

// =============================================================================
// Automations Types (#2929)
// =============================================================================

/**
 * Supported automation trigger types for background agent sessions.
 * These define the event that initiates an automated agent session.
 */
export type AutomationTriggerType =
  | 'schedule'       // Cron-based schedule
  | 'webhook'        // External webhook event
  | 'pr_event'       // Pull request opened/updated/merged
  | 'push'           // Push to branch
  | 'manual';        // Manual trigger via UI/API

/**
 * Configuration for an automation trigger.
 */
export interface AutomationTrigger {
  /** Trigger type */
  type: AutomationTriggerType;
  /** Cron expression for schedule triggers (e.g. "0 9 * * 1-5") */
  cronExpression?: string;
  /** Branch filter pattern (glob) for push/PR triggers */
  branchFilter?: string;
  /** Repository filter (owner/repo format) */
  repoFilter?: string;
}

/**
 * An automation rule that defines when and how to create background agent sessions.
 */
export interface AutomationRule {
  /** Unique rule identifier */
  id: string;
  /** Organization that owns this rule */
  organizationId: string;
  /** Human-readable name */
  name: string;
  /** Description of what this automation does */
  description?: string;
  /** Whether this rule is active */
  enabled: boolean;
  /** The trigger that activates this rule */
  trigger: AutomationTrigger;
  /** Template for the session to create */
  sessionTemplate: AutomationSessionTemplate;
  /** ISO 8601 timestamp of rule creation */
  createdAt: string;
  /** ISO 8601 timestamp of last update */
  updatedAt: string;
  /** User who created the rule */
  createdBy: string;
  /** Number of times this rule has fired */
  executionCount?: number;
  /** ISO 8601 timestamp of last execution */
  lastExecutedAt?: string;
}

/**
 * Template for sessions created by an automation rule.
 */
export interface AutomationSessionTemplate {
  /** Repository to target (owner/repo format) */
  projectContext?: string;
  /** Branch to checkout */
  branch?: string;
  /** Prompt to send to the agent */
  initialPrompt: string;
  /** Agent to use */
  agent?: SessionAgent;
  /** Runner label */
  runnerLabel?: RunnerLabel;
  /** Maximum session duration in minutes */
  maxDurationMinutes?: number;
}

/**
 * Request to create a new background agent session.
 */
export interface CreateSessionRequest {
  /** Optional friendly name for the session */
  name?: string;
  /** Optional organization/workspace override for multi-org users */
  org?: string;
  /** Repository path or project context */
  projectContext?: string;
  /** Git branch to checkout (default: repository's default branch) */
  branch?: string;
  /** Optional initial prompt to send after session starts */
  initialPrompt?: string;
  /** CLI agent to use for the session (default: claude) */
  agent?: SessionAgent;
  /** ARC runner label to target (default: agents-standard-runc-x64) */
  runnerLabel?: RunnerLabel;
  /** Optional dispatch override (auto by default). */
  dispatchBackend?: SessionDispatchBackend;
  /**
   * Optional orchestrator decision candidate (JSON object or stringified JSON).
   * Used for shadow/enforce rollout evaluation on the API side.
   */
  orchestratorDecision?: unknown;
  /**
   * Internal-only metadata populated by API rollout evaluation.
   * Not intended to be set by external clients.
   */
  orchestratorRollout?: Record<string, unknown>;
  /** Dispatch mode: "direct" triggers immediately, "queue" creates a work item (default: direct). */
  dispatchMode?: SessionDispatchMode;
  /**
   * Session type for capacity gating (#2103).
   * - local/background: capacity-gated worker sessions
   * - orchestrator: control-plane session, NOT gated by pool capacity
   */
  sessionType?: SessionType;
  /** Optional model override for the agent (e.g. "gemini-3.1-pro-preview", "claude-sonnet-4-20250514") */
  model?: string;
  /**
   * MCP servers to load for this session (#6307).
   * When set, the runner starts the listed MCP servers and exposes their tools
   * to the agent. Used by the web-coding-agent pattern to inject product-specific
   * MCP servers (e.g. a financial dashboard's statement tools) into a GAL Code session.
   */
  mcpConfig?: McpConfig;
}

/**
 * Response containing a paginated list of sessions.
 */
export interface SessionListResponse {
  /** List of sessions */
  sessions: Session[];
  /** Cursor for next page of results */
  nextCursor?: string;
  /** Total number of sessions matching query */
  totalCount?: number;
}

/**
 * Response containing a paginated list of sessions (alternate naming).
 */
export interface ListSessionsResponse {
  /** List of sessions */
  sessions: Session[];
  /** Whether there are more results */
  hasMore: boolean;
  /** Cursor for next page of results */
  cursor?: string;
}

/**
 * A slash command available in a session's project.
 */
export interface SlashCommand {
  /** Command name (e.g., "sdlc:1-specify:run") */
  name: string;
  /** File path relative to .claude/commands/ */
  path: string;
  /** Command description */
  description?: string;
  /** Command category */
  category?: string;
}

/**
 * Response containing available slash commands.
 */
export interface CommandListResponse {
  /** List of available commands */
  commands: SlashCommand[];
}

/**
 * In-memory terminal buffer (not persisted to database).
 */
export interface TerminalBuffer {
  /** Associated session ID */
  sessionId: string;
  /** Terminal output lines (max 10,000) */
  lines: string[];
  /** Current cursor position */
  cursorPosition: { row: number; col: number };
  /** Last Firestore snapshot timestamp */
  lastSnapshotAt?: string;
}

// =============================================================================
// WebSocket Event Types
// =============================================================================

/**
 * Request to join a terminal session room.
 */
export interface JoinSessionRequest {
  sessionId: string;
}

/**
 * Response after successfully joining a session.
 */
export interface SessionJoinedResponse {
  sessionId: string;
  status: SessionStatus;
  /** Recent terminal output buffer */
  bufferLines: string[];
  cursorPosition: { row: number; col: number };
}

/**
 * Payload for session:joined event (sent to dashboard clients).
 */
export interface SessionJoinedPayload {
  sessionId: string;
  status: SessionStatus;
  /** Buffered terminal output as a single string */
  bufferedOutput?: string;
  /** Connected viewers count */
  viewerCount?: number;
}

/**
 * Session error event.
 */
export interface SessionError {
  sessionId: string;
  code:
    | 'NOT_FOUND'
    | 'ACCESS_DENIED'
    | 'SESSION_TERMINATED'
    | 'SERVER_ERROR'
    | 'AUTH_REQUIRED'
    | 'AUTH_INVALID'
    | 'SESSION_NOT_ACTIVE'
    | 'RATE_LIMITED';
  message: string;
}

/**
 * Session status change event.
 */
export interface SessionStatusEvent {
  sessionId: string;
  status: SessionStatus;
  timestamp: string;
}

/**
 * Terminal input from client to server.
 */
export interface TerminalInput {
  sessionId: string;
  /** Raw terminal input (including control characters) */
  data: string;
  /** Input timestamp (ISO 8601) */
  timestamp?: string;
}

/**
 * Terminal output from server to client.
 */
export interface TerminalOutput {
  sessionId: string;
  /** Raw terminal output (may include ANSI codes) */
  data: string;
  timestamp: string;
}

/**
 * Terminal resize event.
 */
export interface TerminalResize {
  sessionId: string;
  cols: number;
  rows: number;
}

/**
 * Request to reconnect to a disconnected session.
 */
export interface ReconnectRequest {
  sessionId: string;
  /** Get output since this timestamp */
  lastSeenTimestamp?: string;
}

/**
 * Response after successful reconnection.
 */
export interface ReconnectedResponse {
  sessionId: string;
  /** Output missed during disconnection */
  missedOutput: string[];
  currentStatus: SessionStatus;
}
