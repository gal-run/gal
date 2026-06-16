/**
 * Team Assignment Engine Types (#2139)
 *
 * Defines the contract for supervisor-worker team formation with 1:3 balancing.
 * A team is composed of one supervisor session and up to N worker sessions.
 * The engine enforces hard caps, provider-aware routing, backpressure,
 * and fairness across priorities and repositories.
 */

import type { WorkerProvider } from './worker-pool.js';
import type { WorkItemPriority } from './work-item.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/**
 * Team assignment engine configuration.
 * Stored in Firestore under dispatch_rules or provided inline.
 */
export interface TeamAssignmentConfig {
  /** Maximum workers a single supervisor can manage (default: 3) */
  supervisorWorkerRatio: number;
  /** Hard cap on total active workers across all teams in the org */
  maxTotalWorkers: number;
  /** Per-provider hard caps (provider -> max concurrent workers) */
  providerCaps: Partial<Record<WorkerProvider, number>>;
  /** Maximum pending (queued) assignments waiting for capacity */
  maxPendingAssignments: number;
  /** Maximum workers assigned to a single repository at a time */
  maxWorkersPerRepo: number;
  /** Fairness weight for priority spreading (0 = none, 1 = strict round-robin) */
  fairnessWeight: number;
}

/**
 * Sensible defaults for team assignment.
 */
export const DEFAULT_TEAM_ASSIGNMENT_CONFIG: TeamAssignmentConfig = {
  supervisorWorkerRatio: 3,
  maxTotalWorkers: 12,
  providerCaps: { claude: 6, codex: 4, gemini: 4 },
  maxPendingAssignments: 20,
  maxWorkersPerRepo: 4,
  fairnessWeight: 0.5,
};

// ---------------------------------------------------------------------------
// Team & Slot Modelling
// ---------------------------------------------------------------------------

/**
 * Role of a session within a team.
 */
export type TeamRole = 'supervisor' | 'worker';

/**
 * A team is a logical grouping of one supervisor and its workers.
 */
export interface Team {
  /** Unique team identifier (UUID) */
  id: string;
  /** Organization that owns this team */
  organizationId: string;
  /** Supervisor session ID (exactly one per team) */
  supervisorSessionId: string;
  /** Currently active worker session IDs */
  workerSessionIds: string[];
  /** Provider assignment for each worker session */
  workerProviders: Record<string, WorkerProvider>;
  /** Maximum workers this team can hold (from config.supervisorWorkerRatio) */
  maxWorkers: number;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 last modification timestamp */
  updatedAt: string;
}

/**
 * A request to assign a worker to a team.
 */
export interface AssignmentRequest {
  /** Organization ID */
  organizationId: string;
  /** Work item ID being assigned */
  workItemId: string;
  /** Repository the work targets (owner/repo) */
  repository: string;
  /** Requested provider (or 'any' for engine-chosen) */
  preferredProvider: WorkerProvider | 'any';
  /** Priority of the work item */
  priority: WorkItemPriority;
  /** Optional: specific team to assign to */
  teamId?: string;
}

/**
 * Result of an assignment attempt.
 */
export interface AssignmentResult {
  /** Whether the assignment succeeded */
  success: boolean;
  /** Team the worker was assigned to (if success) */
  teamId?: string;
  /** Provider selected for the worker */
  provider?: WorkerProvider;
  /** Worker session ID (if created) */
  workerSessionId?: string;
  /** Rejection reason if not successful */
  rejectionReason?: AssignmentRejectionReason;
  /** Backpressure signal for callers */
  backpressure?: BackpressureSignal;
}

/**
 * Reasons an assignment can be rejected.
 */
export type AssignmentRejectionReason =
  | 'total_worker_cap'          // Global maxTotalWorkers reached
  | 'provider_cap'              // Per-provider cap reached
  | 'team_saturated'            // All teams at supervisorWorkerRatio
  | 'no_supervisors'            // No supervisor sessions available
  | 'repo_cap'                  // maxWorkersPerRepo reached
  | 'pending_queue_full'        // maxPendingAssignments reached
  | 'config_disabled';          // Assignment engine disabled

// ---------------------------------------------------------------------------
// Backpressure
// ---------------------------------------------------------------------------

/**
 * Backpressure signal returned to callers when the team is under load.
 */
export interface BackpressureSignal {
  /** Whether the caller should back off */
  shouldBackoff: boolean;
  /** Suggested wait time before retrying (milliseconds) */
  retryAfterMs: number;
  /** Current utilisation percentage (0-100) */
  utilizationPct: number;
  /** Structured reason for backpressure */
  reason: string;
}

// ---------------------------------------------------------------------------
// Capacity Snapshot (team-level)
// ---------------------------------------------------------------------------

/**
 * Point-in-time capacity view across all teams in an organization.
 */
export interface TeamCapacitySnapshot {
  /** Organization ID */
  organizationId: string;
  /** Total active teams */
  totalTeams: number;
  /** Total active workers across all teams */
  totalActiveWorkers: number;
  /** Hard cap on total workers */
  maxTotalWorkers: number;
  /** Per-provider breakdown */
  providerUtilization: Record<WorkerProvider, { active: number; max: number; available: boolean }>;
  /** Per-repository worker counts */
  repoWorkerCounts: Record<string, number>;
  /** Number of pending assignments in queue */
  pendingAssignments: number;
  /** Whether any capacity is available */
  hasCapacity: boolean;
  /** ISO 8601 timestamp */
  fetchedAt: string;
}

// ---------------------------------------------------------------------------
// Fairness Tracking
// ---------------------------------------------------------------------------

/**
 * Tracks how work has been distributed for fairness scoring.
 */
export interface FairnessState {
  /** Assignments per priority bucket in the current window */
  assignmentsByPriority: Record<number, number>;
  /** Assignments per repository in the current window */
  assignmentsByRepo: Record<string, number>;
  /** Window start time (ISO 8601) */
  windowStart: string;
  /** Window duration in milliseconds */
  windowDurationMs: number;
}
