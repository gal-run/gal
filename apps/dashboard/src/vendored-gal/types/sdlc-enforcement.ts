/**
 * SDLC Enforcement Types
 *
 * Types for displaying SDLC execution progress, blocker reasons,
 * and stage transitions in the dashboard.
 */

/**
 * SDLC lifecycle state values
 */
export type SdlcLifecycleStateValue =
  | 'intake' // Issue claimed, awaiting implementation start
  | 'implement' // Active implementation in progress
  | 'test' // Tests being written/run
  | 'pr_created' // PR created, awaiting review
  | 'review' // PR under review
  | 'merge_ready' // PR approved, ready to merge
  | 'merged' // PR merged to main
  | 'release_verify'; // Production verification in progress

/**
 * Blocker reason types
 */
export type BlockerReasonType =
  | 'missing_issue_link' // GitHub issue not linked to PR
  | 'missing_pr_link' // PR not created yet
  | 'invalid_branch_name' // Branch name doesn't match issue pattern
  | 'ci_failure' // CI checks failed
  | 'merge_conflict' // PR has merge conflicts
  | 'review_requested' // Awaiting review from specific reviewers
  | 'changes_requested' // Reviewer requested changes
  | 'pr_budget_exceeded' // Too many open PRs (throttling)
  | 'stale_session' // Session heartbeat timeout
  | 'custom'; // Custom blocker with free-form message

/**
 * Blocker reason data structure
 */
export interface BlockerReasonData {
  type: BlockerReasonType;
  message: string;
  metadata?: Record<string, unknown> | undefined;
  detectedAt: Date;
}

/**
 * SDLC stage transition event
 */
export interface SdlcStageTransition {
  workItemId: string;
  sessionId?: string | undefined;
  fromState: SdlcLifecycleStateValue | null;
  toState: SdlcLifecycleStateValue;
  timestamp: Date;
  durationMs?: number | undefined;
  metadata?: Record<string, unknown> | undefined;
}

/**
 * SDLC stage metrics snapshot
 */
export interface SdlcStageMetrics {
  workItemId: string;
  currentState: SdlcLifecycleStateValue;
  timeInStateMs: number;
  transitionCount: number;
  isBlocked: boolean;
  totalBlockedTimeMs?: number | undefined;
  lastTransitionAt: Date;
  snapshotAt: Date;
}

/**
 * SDLC progress snapshot
 */
export interface SdlcProgressSnapshot {
  workItemId: string;
  organizationId: string;
  currentState: SdlcLifecycleStateValue | null;
  completedStates: SdlcLifecycleStateValue[];
  blockerType: string | null;
  isBlocked: boolean;
  issueNumber?: string | undefined;
  prNumber?: string | undefined;
  branchName?: string | undefined;
  timestamp: Date;
}

/**
 * Dashboard-friendly SDLC progress display
 */
export interface SdlcProgressDisplay {
  /** Work item ID */
  workItemId: string;
  /** Current lifecycle state */
  currentState: {
    name: SdlcLifecycleStateValue;
    description: string;
    since: string; // ISO 8601
  } | null;
  /** Completed states with timestamps */
  completedStates: Array<{
    name: SdlcLifecycleStateValue;
    completedAt: string; // ISO 8601
    durationMs: number;
  }>;
  /** Current blocker if any */
  blocker: {
    type: BlockerReasonType;
    message: string;
    detectedAt: string; // ISO 8601
    recoverable: boolean;
    requiresHuman: boolean;
  } | null;
  /** Issue/PR linkage */
  linkage: {
    issueNumber?: string;
    issueUrl?: string;
    prNumber?: string;
    prUrl?: string;
    branchName?: string;
  };
  /** Progress percentage (0-100) */
  progressPercent: number;
  /** Estimated time to completion (ms) */
  estimatedCompletionMs?: number;
}

/**
 * PR budget status for dashboard display
 */
export interface PrBudgetStatus {
  /** Organization ID */
  organizationId: string;
  /** Current open PR count */
  currentOpenPrs: number;
  /** Max allowed open PRs */
  maxAllowed: number;
  /** Utilization percentage (0-100) */
  utilizationPercent: number;
  /** Whether dispatch should be throttled */
  shouldThrottle: boolean;
  /** Recommended concurrent dispatches */
  recommendedConcurrent: number;
  /** Open PRs by agent */
  byAgent?: Array<{
    agentId: string;
    openPrCount: number;
    maxAllowed: number;
  }>;
  /** Last updated timestamp */
  lastUpdatedAt: string; // ISO 8601
}

/**
 * SDLC stage transition event for real-time updates
 */
export interface SdlcStageTransitionEvent {
  /** Work item ID */
  workItemId: string;
  /** Session ID if applicable */
  sessionId?: string;
  /** Previous state */
  fromState: SdlcLifecycleStateValue | null;
  /** New state */
  toState: SdlcLifecycleStateValue;
  /** Transition timestamp */
  timestamp: string; // ISO 8601
  /** Duration in previous state (ms) */
  durationMs?: number;
  /** Additional context */
  metadata?: Record<string, unknown>;
}

/**
 * SDLC bottleneck analysis for dashboard
 */
export interface SdlcBottleneckAnalysis {
  /** Organization ID */
  organizationId: string;
  /** Time period analyzed */
  period: {
    start: string; // ISO 8601
    end: string; // ISO 8601
  };
  /** Top bottleneck states */
  bottlenecks: Array<{
    state: SdlcLifecycleStateValue;
    avgDurationMs: number;
    count: number;
    percentOfTotal: number;
  }>;
  /** Most common blockers */
  commonBlockers: Array<{
    type: BlockerReasonType;
    count: number;
    avgResolutionTimeMs: number;
  }>;
  /** Overall metrics */
  overall: {
    totalWorkItems: number;
    avgCycleTimeMs: number;
    successRate: number;
  };
}

/**
 * Request to update SDLC lifecycle state
 */
export interface UpdateLifecycleStateRequest {
  /** Work item ID */
  workItemId: string;
  /** New lifecycle state */
  newState: SdlcLifecycleStateValue;
  /** Optional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Request to set blocker on work item
 */
export interface SetBlockerRequest {
  /** Work item ID */
  workItemId: string;
  /** Blocker type */
  type: BlockerReasonType;
  /** Blocker message */
  message?: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Request to update work item linkage
 */
export interface UpdateLinkageRequest {
  /** Work item ID */
  workItemId: string;
  /** Branch name */
  branchName?: string;
  /** Issue number */
  issueNumber?: string;
  /** PR number */
  prNumber?: string;
}
