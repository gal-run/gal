/**
 * Orchestrator Brain Types (#1883)
 *
 * Public interfaces for the intelligent queue orchestrator.
 * Phase 1: Rule-based decision layer.
 * Phase 2: Model-driven reprioritization (hooks ready, not yet activated).
 * Phase 3: Autonomous proactive scheduling.
 *
 * @see docs/features/orchestrator-brain.md
 */

import type { WorkItem } from './work-item.js'

// ─────────────────────────────────────────────────────────────────
// Decision Actions
// ─────────────────────────────────────────────────────────────────

/**
 * Actions the orchestrator can take for a queue item.
 */
export type OrchestratorAction =
  | 'DISPATCH'   // Dispatch this item now
  | 'DEFER'      // Skip this item, try the next one
  | 'WAIT'       // No items ready; back off and retry later
  | 'DECOMPOSE'  // Break this item into sub-tasks (Phase 2+)

/**
 * A single orchestrator decision.
 */
export interface OrchestratorDecision {
  /** The action to take */
  action: OrchestratorAction

  /** Work item to dispatch (for DISPATCH action) */
  workItemId?: string

  /** Human-readable reasoning for this decision */
  reasoning: string

  /** Rule that triggered this decision (Phase 1) */
  triggeredBy?: string

  /** Milliseconds to wait before retrying (for WAIT action) */
  retryAfterMs?: number

  /** Sub-items to queue (for DECOMPOSE action, Phase 2+) */
  decomposedItems?: OrchestratorSubItem[]

  /** Metadata for telemetry */
  meta?: Record<string, unknown>
}

/**
 * A sub-item produced by task decomposition (Phase 2+).
 */
export interface OrchestratorSubItem {
  command: string
  context?: string
  priority?: number
  parentWorkItemId: string
}

// ─────────────────────────────────────────────────────────────────
// Context
// ─────────────────────────────────────────────────────────────────

/**
 * Context passed to the orchestrator on each dispatch cycle.
 */
export interface OrchestratorContext {
  organizationId: string

  /** Current queue snapshot (pending items, ordered by score) */
  queue: WorkItem[]

  /** Active session counts per provider */
  activeSessionCounts: Record<string, number>

  /** Max concurrent sessions per provider */
  maxSessionCounts: Record<string, number>

  /** Current budget consumption */
  budgetConsumption: BudgetConsumption

  /** Recent outcome history (last N sessions) */
  recentOutcomes?: WorkItemOutcome[]

  /** ISO timestamp of context snapshot */
  snapshotAt: string
}

// ─────────────────────────────────────────────────────────────────
// Budget
// ─────────────────────────────────────────────────────────────────

/**
 * Budget policy for an organization.
 */
export interface BudgetPolicy {
  /** Hard stop when daily spend exceeds this (USD) */
  dailyLimitUSD: number

  /** Weekly limit: soft warning at 80%, hard stop at 100% (USD) */
  weeklyLimitUSD: number

  /** When at 80% of weekly budget, defer items below P1 */
  deferLowPriorityOnSoftLimit: boolean
}

/**
 * Current budget consumption state.
 */
export interface BudgetConsumption {
  dailySpendUSD: number
  weeklySpendUSD: number
  lastUpdatedAt: string
}

/**
 * A session cost event reported by a runner.
 */
export interface SessionCostEvent {
  sessionId: string
  workItemId: string
  organizationId: string

  /** Token counts */
  inputTokens: number
  outputTokens: number
  totalTokens: number

  /** Estimated cost in USD */
  estimatedCostUSD: number

  /** ISO timestamp */
  recordedAt: string
}

// ─────────────────────────────────────────────────────────────────
// Outcome Tracking
// ─────────────────────────────────────────────────────────────────

/**
 * Outcome reported when a work item's session completes.
 * Stored for audit + fed into Phase 2 model context.
 */
export interface WorkItemOutcome {
  workItemId: string
  sessionId: string
  organizationId: string

  /** Whether the session fully succeeded */
  success: boolean

  /** Partial completion percentage (0-100) if not fully successful */
  partialCompletion?: number

  /** Natural language suggestions for follow-up work (from session output) */
  followUpSuggestions?: string[]

  /** Cost of the session */
  tokenCost?: SessionCostEvent

  /** Errors or warnings from the session */
  errors?: string[]

  /** ISO timestamp */
  completedAt: string
}

// ─────────────────────────────────────────────────────────────────
// Model-Driven Hooks (Phase 2 interface — stubs in Phase 1)
// ─────────────────────────────────────────────────────────────────

/**
 * Hook interface for model-driven orchestration.
 *
 * Phase 1: All methods are stubs (no-ops).
 * Phase 2: Implementations call in-house model.
 *
 * This interface is the primary extension point for plugging in
 * the model-driven orchestrator without changing the decision layer.
 */
export interface ModelDrivenHooks {
  /**
   * Reprioritize the queue before dispatch.
   * Phase 1: Returns queue unchanged.
   * Phase 2: Calls in-house model for dynamic reordering.
   */
  reprioritize(
    queue: WorkItem[],
    context: OrchestratorContext,
  ): Promise<WorkItem[]>

  /**
   * Decompose a complex work item into sub-tasks.
   * Phase 1: Returns the original item as a single-element array.
   * Phase 2: Calls in-house model to break down high-level objectives.
   */
  decompose(
    item: WorkItem,
    context: OrchestratorContext,
  ): Promise<WorkItem[]>

  /**
   * Called when a session completes to determine follow-up work.
   * Phase 1: Returns empty array (no follow-ups).
   * Phase 2: Calls in-house model to generate follow-up queue items.
   */
  onOutcome(
    outcome: WorkItemOutcome,
    context: OrchestratorContext,
  ): Promise<OrchestratorSubItem[]>
}

// ─────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────

/**
 * Configuration for OrchestratorBrainService.
 */
export interface OrchestratorBrainConfig {
  /**
   * Enable the orchestrator brain decision layer.
   * When false, falls back to simple priority ordering.
   * Default: true
   */
  enabled: boolean

  /**
   * Budget policy. If undefined, no budget caps are enforced.
   */
  budgetPolicy?: BudgetPolicy

  /**
   * Maximum number of items to evaluate per dispatch cycle.
   * Default: 10
   */
  maxCandidates: number

  /**
   * Milliseconds to wait between dispatch retries on WAIT decision.
   * Default: 5000 (5 seconds)
   */
  waitIntervalMs: number

  /**
   * Model-driven hooks implementation.
   * Defaults to Phase 1 stub (NoopModelDrivenHooks).
   */
  modelHooks?: ModelDrivenHooks
}
