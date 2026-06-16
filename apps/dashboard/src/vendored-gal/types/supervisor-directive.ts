/**
 * Supervisor Directive Types (#2137)
 *
 * Contract for supervisor control-plane operations in hybrid orchestration.
 * Enforces deterministic queue state mutations with policy validation.
 */

import type { WorkItemAgent } from './work-item.js';

/**
 * Supervisor directive action types.
 * Defines all valid queue state mutations a supervisor can request.
 */
export type SupervisorDirectiveType =
  | 'claim'      // Claim a pending work item for execution
  | 'pause'      // Pause an in-progress work item
  | 'retry'      // Retry a failed work item
  | 'reassign'   // Reassign work item to different agent/worker
  | 'escalate';  // Escalate to human review

/**
 * Base directive structure.
 * All directive types extend this interface.
 */
export interface SupervisorDirectiveBase {
  /** Directive type */
  type: SupervisorDirectiveType;
  /** Work item ID being operated on */
  workItemId: string;
  /** Organization ID (for auth and capacity checks) */
  organizationId: string;
  /** Supervisor session ID issuing the directive */
  supervisorSessionId: string;
  /** Timestamp when directive was issued (ISO 8601) */
  issuedAt: string;
  /** Idempotency key for retry safety */
  idempotencyKey?: string;
}

/**
 * Claim directive payload.
 * Request to claim a pending work item for execution.
 */
export interface ClaimDirectivePayload {
  /** Agent type that will execute the work */
  agentType: WorkItemAgent;
  /** Expected capacity consumption (1 = one worker slot) */
  expectedCapacity?: number;
}

/**
 * Pause directive payload.
 * Request to pause an in-progress work item.
 */
export interface PauseDirectivePayload {
  /** Reason for pausing (e.g., "rate_limit", "manual", "capacity_pressure") */
  reason: string;
  /** Whether to preserve work state for resume */
  preserveState?: boolean;
}

/**
 * Retry directive payload.
 * Request to retry a failed work item.
 */
export interface RetryDirectivePayload {
  /** Reason for retry (e.g., "transient_error", "supervisor_decision") */
  reason: string;
  /** Reset retry count (default: false - increments existing count) */
  resetRetryCount?: boolean;
  /** Delay before retry in milliseconds */
  retryDelayMs?: number;
}

/**
 * Reassign directive payload.
 * Request to reassign work item to a different agent or worker.
 */
export interface ReassignDirectivePayload {
  /** New agent type for execution */
  newAgentType: WorkItemAgent;
  /** Reason for reassignment (e.g., "agent_unavailable", "better_fit") */
  reason: string;
  /** Whether to restart work from beginning */
  restartFromBeginning?: boolean;
}

/**
 * Escalate directive payload.
 * Request to escalate work item to human review.
 */
export interface EscalateDirectivePayload {
  /** Reason for escalation (e.g., "high_risk", "policy_violation", "ambiguous_requirements") */
  reason: string;
  /** Severity level (info, warning, error) */
  severity?: 'info' | 'warning' | 'error';
  /** Additional context for human reviewer */
  context?: Record<string, unknown>;
}

/**
 * Typed supervisor directives by action type.
 */
export type SupervisorDirective =
  | (SupervisorDirectiveBase & { type: 'claim'; payload: ClaimDirectivePayload })
  | (SupervisorDirectiveBase & { type: 'pause'; payload: PauseDirectivePayload })
  | (SupervisorDirectiveBase & { type: 'retry'; payload: RetryDirectivePayload })
  | (SupervisorDirectiveBase & { type: 'reassign'; payload: ReassignDirectivePayload })
  | (SupervisorDirectiveBase & { type: 'escalate'; payload: EscalateDirectivePayload });

/**
 * Directive validation result.
 * Returned by policy validator before execution.
 */
export interface DirectiveValidationResult {
  /** Whether the directive is valid and can be executed */
  valid: boolean;
  /** Validation errors that block execution */
  errors: DirectiveViolation[];
  /** Validation warnings (non-blocking) */
  warnings: DirectiveViolation[];
  /** Metadata from validation process */
  metadata?: {
    /** Capacity check results */
    capacityAvailable?: number;
    capacityRequired?: number;
    /** Budget check results */
    budgetRemaining?: number;
    budgetRequired?: number;
    /** Idempotency check */
    isDuplicate?: boolean;
    previousDirectiveId?: string;
  };
}

/**
 * Directive policy violation.
 */
export interface DirectiveViolation {
  /** Policy rule that was violated */
  rule: string;
  /** Severity level */
  severity: 'error' | 'warning';
  /** Human-readable violation message */
  message: string;
  /** Structured violation details */
  details?: Record<string, unknown>;
}

/**
 * Directive execution result.
 * Returned after a directive is applied to the queue.
 */
export interface DirectiveExecutionResult {
  /** Whether the directive was successfully executed */
  success: boolean;
  /** Directive ID for audit trail */
  directiveId?: string;
  /** Updated work item state after execution */
  workItem?: {
    id: string;
    status: string;
    claimedBy?: string;
    updatedAt: string;
  };
  /** Execution errors */
  errors?: DirectiveViolation[];
  /** Timestamp when directive was executed (ISO 8601) */
  executedAt?: string;
}

/**
 * Directive policy configuration.
 * Defines constraints and limits for directive validation.
 */
export interface DirectivePolicyConfig {
  /** Maximum capacity per organization (concurrent workers) */
  maxCapacityPerOrg: number;
  /** Maximum retry attempts before escalation required */
  maxRetryAttempts: number;
  /** Minimum delay between retries (milliseconds) */
  minRetryDelayMs: number;
  /** Budget cap per organization (USD) */
  dailyBudgetCapUSD?: number;
  weeklyBudgetCapUSD?: number;
  /** Allowed agent types for this organization */
  allowedAgents: WorkItemAgent[];
  /** Whether idempotency checks are enforced */
  enforceIdempotency: boolean;
  /** Idempotency window (how long to track duplicate directives, milliseconds) */
  idempotencyWindowMs: number;
}

/**
 * Default directive policy configuration.
 */
export const DEFAULT_DIRECTIVE_POLICY: DirectivePolicyConfig = {
  maxCapacityPerOrg: 10,
  maxRetryAttempts: 3,
  minRetryDelayMs: 5000, // 5 seconds
  allowedAgents: ['claude', 'codex', 'gemini', 'oss', 'any'],
  enforceIdempotency: true,
  idempotencyWindowMs: 300000, // 5 minutes
};

/**
 * Directive telemetry event.
 * Emitted for all directive validations and executions.
 */
export interface DirectiveTelemetryEvent {
  /** Event type */
  eventType: 'directive_validated' | 'directive_executed' | 'directive_rejected';
  /** Directive that triggered the event */
  directive: SupervisorDirective;
  /** Validation result (for validated/rejected events) */
  validationResult?: DirectiveValidationResult;
  /** Execution result (for executed events) */
  executionResult?: DirectiveExecutionResult;
  /** Timestamp when event occurred (ISO 8601) */
  timestamp: string;
  /** Additional context */
  context?: Record<string, unknown>;
}
