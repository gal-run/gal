/**
 * Structured Error Codes for Background Agent Sessions (Issue #1775)
 *
 * P0 production observability - structured error taxonomy for agent session failures.
 */

/**
 * Session error codes representing specific failure scenarios.
 */
export enum SessionErrorCode {
  /** Authentication token has expired and needs renewal */
  AUTH_EXPIRED = 'AUTH_EXPIRED',
  /** Authentication token has been revoked */
  AUTH_REVOKED = 'AUTH_REVOKED',
  /** A tool call timed out during session execution */
  TOOL_TIMEOUT = 'TOOL_TIMEOUT',
  /** Agent has exceeded its quota (rate limit or usage cap) */
  AGENT_QUOTA = 'AGENT_QUOTA',
  /** Failed to clone the repository for the session */
  CLONE_FAILED = 'CLONE_FAILED',
  /** GitHub Actions workflow dispatch or execution failed */
  WORKFLOW_FAILED = 'WORKFLOW_FAILED',
  /** Runner process crashed unexpectedly */
  RUNNER_CRASHED = 'RUNNER_CRASHED',
  /** Error from the underlying LLM provider (Anthropic, OpenAI, Google) */
  PROVIDER_ERROR = 'PROVIDER_ERROR',
  /** Unknown or unclassified error */
  UNKNOWN = 'UNKNOWN',
}

/**
 * Broad error categories for grouping related failure types.
 */
export enum ErrorCategory {
  /** Authentication and credential failures */
  auth = 'auth',
  /** Tool execution failures */
  tool = 'tool',
  /** Agent-level failures (quota, provider issues) */
  agent = 'agent',
  /** Infrastructure failures (runner, workflow, clone) */
  infra = 'infra',
  /** User-caused errors */
  user = 'user',
}

/**
 * Structured error object with full context for observability.
 */
export interface StructuredError {
  /** Specific error code identifying the failure type */
  code: SessionErrorCode;
  /** Broad category for grouping errors */
  category: ErrorCategory;
  /** Human-readable error message */
  message: string;
  /** The session ID where the error occurred */
  sessionId: string;
  /** The agent type that was running (claude, codex, gemini, etc.) */
  agent: string;
  /** ISO 8601 timestamp when the error occurred */
  timestamp: string;
}

/**
 * Maps SessionErrorCode to its ErrorCategory.
 */
export const ERROR_CODE_CATEGORIES: Record<SessionErrorCode, ErrorCategory> = {
  [SessionErrorCode.AUTH_EXPIRED]: ErrorCategory.auth,
  [SessionErrorCode.AUTH_REVOKED]: ErrorCategory.auth,
  [SessionErrorCode.TOOL_TIMEOUT]: ErrorCategory.tool,
  [SessionErrorCode.AGENT_QUOTA]: ErrorCategory.agent,
  [SessionErrorCode.CLONE_FAILED]: ErrorCategory.infra,
  [SessionErrorCode.WORKFLOW_FAILED]: ErrorCategory.infra,
  [SessionErrorCode.RUNNER_CRASHED]: ErrorCategory.infra,
  [SessionErrorCode.PROVIDER_ERROR]: ErrorCategory.agent,
  [SessionErrorCode.UNKNOWN]: ErrorCategory.infra,
}
