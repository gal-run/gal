/**
 * Agent Activity Types (#4686)
 *
 * Shared context pool for concurrent background agents.
 * Enables agents to publish their working set (files, branches, issues)
 * so other agents can coordinate and avoid conflicts.
 *
 * Firestore path: organizations/{orgId}/agent-activity/{sessionId}
 */

// =============================================================================
// Agent Activity Core Types
// =============================================================================

/**
 * Status of an agent activity record.
 * - active: Agent is currently working
 * - idle: Agent is running but not actively modifying files
 * - completed: Agent finished its work (cleanup pending)
 */
export type AgentActivityStatus = 'active' | 'idle' | 'completed'

/**
 * A file claim by a running agent.
 * Tracks which files an agent is currently modifying.
 */
export interface AgentFileClaim {
  /** Relative file path from repo root (e.g., "apps/api/src/routes/session-routes.ts") */
  path: string
  /** Type of operation being performed */
  operation: 'read' | 'write' | 'create' | 'delete'
  /** ISO 8601 timestamp when the claim was made */
  claimedAt: string
}

/**
 * Agent activity record — published by each running background agent.
 *
 * Stored in Firestore: organizations/{orgId}/agent-activity/{sessionId}
 * Agents heartbeat this record periodically to keep it fresh.
 * Stale records (no heartbeat in 5 min) are considered abandoned.
 */
export interface AgentActivity {
  /** Session ID (matches the background agent session ID) */
  sessionId: string
  /** Organization ID */
  organizationId: string
  /** Agent type (claude, codex, gemini, etc.) */
  agent: string
  /** Current status */
  status: AgentActivityStatus

  // --- Work Context ---
  /** GitHub issue number being worked on (if any) */
  issueNumber?: number
  /** Repository in owner/repo format */
  repository?: string
  /** Git branch name */
  branch?: string
  /** Work item ID from the queue (if dispatched via queue) */
  workItemId?: string
  /** Human-readable description of current task */
  currentTask?: string

  // --- File Claims ---
  /** Files currently being modified by this agent */
  files: AgentFileClaim[]

  // --- Timestamps ---
  /** ISO 8601 timestamp when the activity record was created */
  createdAt: string
  /** ISO 8601 timestamp of last heartbeat update */
  lastHeartbeatAt: string
  /** ISO 8601 timestamp when the activity ended (status=completed) */
  completedAt?: string
}

// =============================================================================
// API Request/Response Types
// =============================================================================

/**
 * Request to publish or update agent activity.
 */
export interface PublishAgentActivityRequest {
  /** Session ID */
  sessionId: string
  /** Agent type */
  agent?: string
  /** Current status */
  status?: AgentActivityStatus
  /** GitHub issue number */
  issueNumber?: number
  /** Repository in owner/repo format */
  repository?: string
  /** Git branch */
  branch?: string
  /** Work item ID */
  workItemId?: string
  /** Human-readable task description */
  currentTask?: string
  /** Files being modified */
  files?: AgentFileClaim[]
}

/**
 * Request to check if files conflict with other agents' activity.
 */
export interface CheckFileConflictsRequest {
  /** Files to check for conflicts */
  filePaths: string[]
  /** Repository context */
  repository?: string
  /** Exclude this session from conflict check (self) */
  excludeSessionId?: string
}

/**
 * A detected conflict between agents.
 */
export interface AgentFileConflict {
  /** The conflicting file path */
  filePath: string
  /** Session ID of the agent that has the file claimed */
  claimedBySessionId: string
  /** Agent type of the claiming agent */
  claimedByAgent: string
  /** Branch the claiming agent is working on */
  claimedByBranch?: string
  /** Issue the claiming agent is working on */
  claimedByIssue?: number
  /** When the file was claimed */
  claimedAt: string
}

/**
 * Response from conflict check.
 */
export interface CheckFileConflictsResponse {
  /** Whether any conflicts were found */
  hasConflicts: boolean
  /** List of detected conflicts */
  conflicts: AgentFileConflict[]
}

/**
 * Summary of all active agent activity in an organization.
 */
export interface AgentActivitySummary {
  /** Total active agents */
  activeAgents: number
  /** Breakdown by agent type */
  agentBreakdown: Record<string, number>
  /** All active activity records */
  activities: AgentActivity[]
  /** All files currently claimed across all agents */
  claimedFiles: Array<{
    path: string
    sessionId: string
    agent: string
    branch?: string
  }>
  /** Branches currently being worked on */
  activeBranches: Array<{
    branch: string
    sessionId: string
    agent: string
    issueNumber?: number
  }>
}
