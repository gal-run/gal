/**
 * Governance Audit Types (#822 Phase 2)
 *
 * Types for the runtime governance layer: pre-tool-call validation,
 * post-tool-call audit logging, and token usage tracking.
 *
 * Firestore paths:
 * - organizations/{orgName}/sessions/{sessionId}/audit-log/{entryId}
 * - Session metadata: totalInputTokens, totalOutputTokens, estimatedCost
 */

/** A single audit log entry for a tool call within a session */
export interface GovernanceAuditEntry {
  id: string;
  sessionId: string;
  orgName: string;
  toolName: string;
  /** Sanitized tool inputs (secrets redacted, paths shortened) */
  toolInput: Record<string, unknown>;
  /** Truncated tool output (max 2000 chars) */
  toolOutput?: string;
  /** Whether the tool call resulted in an error */
  isError: boolean;
  /** Duration of the tool call in milliseconds */
  durationMs: number;
  /** Policy evaluation result for this tool call */
  policyAction: 'allowed' | 'denied' | 'audited';
  /** Reason from policy evaluation (if denied or audited) */
  policyReason?: string;
  /** ID of the matched policy (if any) */
  matchedPolicyId?: string;
  /** ISO 8601 timestamp */
  timestamp: string;
  /** Sequential tool call number within the session */
  toolCallNumber: number;
}

/** Per-model token breakdown written to RTDB session metadata */
export interface ModelTokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
  costUsd: number;
}

/** Token usage stats tracked per session */
export interface SessionTokenUsage {
  totalInputTokens: number;
  totalOutputTokens: number;
  /** Estimated cost in USD (based on provider pricing) */
  estimatedCost: number;
  /** Actual cost in USD reported by the SDK (only present when SDK provides it) */
  actualCostUsd?: number;
  /** Per-model token and cost breakdown (only present when SDK provides it) */
  tokensByModel?: Record<string, ModelTokenUsage>;
}

/** Response shape for the session audit log retrieval API */
export interface SessionAuditLogResponse {
  entries: GovernanceAuditEntry[];
  total: number;
  limit: number;
  offset: number;
  /** Token usage summary for the session */
  tokenUsage?: SessionTokenUsage;
}
