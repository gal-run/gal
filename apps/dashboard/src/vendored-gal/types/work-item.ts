/**
 * Work Item Management Types (SAL-1)
 *
 * Firestore-based job queue for managing agentic work items
 * with priority-based processing.
 */

import type { ActiveBackgroundAgentRunnerLabel } from './session.js'

/**
 * Work item priority levels (lower number = higher priority)
 * @deprecated Use WorkItemScore.tier for v2 scoring
 */
export type WorkItemPriority = 0 | 1 | 2 | 3

/**
 * Score tier classification for Work Prioritizer 2.0 (WSJF-based)
 * - CRITICAL: 50+ (urgent, needs immediate attention)
 * - HIGH: 30-49 (high priority, should be done soon)
 * - MEDIUM: 15-29 (normal priority, active SDLC)
 * - NORMAL: 5-14 (standard backlog)
 * - LOW: <5 (can wait)
 */
export type WorkItemScoreTier = 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'NORMAL' | 'LOW'

/**
 * Complete WSJF score breakdown for a work item (SAL-2 v2.0)
 *
 * Formula: finalScore = (CoD / JobSize) × stageMultiplier × blockingMultiplier
 * Where: CoD = BusinessValue + TimeCriticality + RiskReduction
 *
 * @see specs/884-work-prioritizer-v2/plan.md
 */
export interface WorkItemScore {
  // WSJF components (1-5 scale)
  businessValue: number
  timeCriticality: number
  riskReduction: number
  jobSize: number

  // Calculated values
  costOfDelay: number      // BV + TC + RR
  wsjf: number             // CoD / JobSize

  // Multipliers
  stageBonus: number       // 0-25 based on SDLC phase
  stageMultiplier: number  // 1 + (stageBonus / 50)
  blockingCount: number    // Number of items this blocks
  blockingMultiplier: number // 1 + (blockingCount * 0.1)

  // Final result
  finalScore: number       // wsjf * stageMultiplier * blockingMultiplier
  tier: WorkItemScoreTier
  calculatedAt: Date
}

/**
 * Prioritized item with score breakdown (for API responses)
 */
export interface PrioritizedWorkItem {
  workItem: WorkItem
  githubNumber: number
  githubType: 'issue' | 'pr'
  suggestedCommand: string
  reason: string
  score?: WorkItemScore
}

/**
 * Work item status
 */
export type WorkItemStatus =
  | 'pending'      // Waiting to be claimed
  | 'claimed'      // Claimed by agent, not yet started
  | 'in_progress'  // Actively being worked on
  | 'completed'    // Successfully completed
  | 'failed'       // Failed after retries
  | 'blocked'      // Agent attempted but was blocked (human intervention or reroute required)

export type WorkItemFailureCategory =
  | 'startup_failure'
  | 'credential_error'
  | 'timeout'
  | 'runtime_error'
  | 'command_expansion'
  | 'preflight_rejection'
  | 'manual'

/**
 * Type of work to be performed
 */
export type WorkItemType =
  | 'pr_review'    // Review a pull request
  | 'implement'    // Implement a feature/fix
  | 'bug_fix'      // Fix a bug
  | 'sdlc_task'    // SDLC phase task
  | 'session'      // Background agent session (queued dispatch)
  | 'github_issue' // GitHub issue processed via queue (#4381)

/**
 * Preferred agent type for work item execution (GAL-1721).
 * Matches CredentialProvider + 'any' — see platform registry (Issue #2821).
 */
export type WorkItemAgent = 'claude' | 'codex' | 'gemini' | 'oss' | 'any'

/**
 * Source type for work item creation
 */
export type WorkItemSourceType =
  | 'github_issue' // Created from GitHub issue
  | 'github_pr'    // Created from GitHub PR
  | 'manual'       // Manually created
  | 'dashboard'    // Created from dashboard session UI

/**
 * Source information for traceability
 */
export interface WorkItemSource {
  type: WorkItemSourceType
  url?: string              // GitHub issue/PR URL
  issueNumber?: number      // GitHub issue number
  prNumber?: number         // GitHub PR number
  repository?: string       // Repository full name (owner/repo)
}

/**
 * Phase history entry for SDLC tracking
 */
export interface PhaseHistoryEntry {
  phase: number
  status: 'started' | 'completed' | 'failed' | 'skipped'
  timestamp: Date
  agentId?: string
}

export type DispatchReadinessStatus = 'ready' | 'blocked'

export type DispatchReadinessFailureType =
  | 'credentials_missing'
  | 'credentials_expired'
  | 'provider_quota_exhausted'
  | 'approved_config_missing'
  | 'environment_config_missing'
  | 'user_scoped_auth_required'
  | 'browser_profiles_missing'
  | 'browser_profile_storage_invalid'
  | 'browser_profile_storage_unavailable'
  | 'workflow_inputs_invalid'
  | 'dispatch_prerequisite_unavailable'

export interface WorkItemDispatchReadiness {
  status: DispatchReadinessStatus
  checkedAt: Date
  selectedProvider: 'claude' | 'codex' | 'gemini' | 'oss'
  codexOnlyWindow?: {
    active: boolean
    endsAt: string
    overriddenAgent?: string
  }
  requirements: {
    browserProfilesRequired: boolean
    environmentConfigRequired: boolean
    reasons: string[]
  }
  providerCredentials: {
    provider: 'claude' | 'codex' | 'gemini' | 'oss'
    userId: string
    status: 'active' | 'expired' | 'not_configured' | 'quota_exhausted' | 'error'
    error?: string | null
  }
  browserProfiles?: {
    required: boolean
    attached: boolean
    profileIds: string[]
    invalidProfileIds?: string[]
  }
  environmentConfig?: {
    required: boolean
    resolved: boolean
    authRefsValidated: boolean
    missingAuthRefs?: Array<{ kind: string; source: string }>
  }
  workflowInputs?: {
    valid: boolean
    missing: string[]
  }
  failure?: {
    type: DispatchReadinessFailureType
    message: string
    terminal: boolean
    details?: Record<string, unknown>
  }
}

export type ReleaseVerificationState =
  | 'not_required'
  | 'awaiting_release_issue'
  | 'awaiting_production_verification'
  | 'verified'
  | 'blocked'

export interface ReleaseHandoffResult {
  mergedPrNumber?: number
  releaseIssueNumber?: number
  verificationState: ReleaseVerificationState
  eligibleForClosure: boolean
  handedOffAt: Date
}

/**
 * Work item - unit of work in the job queue
 */
export interface WorkItem {
  // Identity
  id: string
  organizationId: string

  // Priority & Status
  priority: WorkItemPriority
  status: WorkItemStatus

  // Work Definition
  type: WorkItemType
  source: WorkItemSource
  command: string           // Command to execute (e.g., "/pr-review", "/implement")
  context?: string          // Additional context for the work
  operationsBoundary?: OperationsProcessStep  // Optional Operations contract for dispatch gating

  // Agent Selection (GAL-1721)
  preferredAgent?: WorkItemAgent  // Preferred agent type (default: 'any')

  // Runner Label Routing (#4956)
  runnerLabel?: ActiveBackgroundAgentRunnerLabel  // Target ARC runner label (e.g. 'agents-kali-runc' for security work)

  // Claim Management
  claimedBy?: string        // Agent/worker ID that claimed this item
  claimedAt?: Date          // When it was claimed
  lastHeartbeatAt?: Date    // Last heartbeat from worker (for stale detection)

  // Dispatch Binding (#2028: Prevent duplicate dispatch)
  sessionId?: string        // Background session ID created for this work item
  workflowRunId?: number    // GitHub Actions workflow run ID for this dispatch
  dispatchedAt?: Date       // When the session was dispatched (prevents re-dispatch)

  // Timestamps
  createdAt: Date
  updatedAt: Date
  startedAt?: Date          // When work actually started
  completedAt?: Date        // When work completed (success or failure)

  // Results
  result?: {
    success: boolean
    message?: string
    failureCategory?: WorkItemFailureCategory
    workflowRunUrl?: string
    failedStep?: string
    details?: Record<string, unknown>
    operationsBoundary?: OperationsBoundaryDecision
  }

  // Pre-flight Qualification (#4381)
  qualificationResult?: {
    qualified: boolean
    reason?: string
    checkedAt: Date
    reviewRequired?: boolean
    operationsBoundary?: OperationsBoundaryDecision
  }
  dispatchReadiness?: WorkItemDispatchReadiness

  // Retry Management
  retryCount: number
  maxRetries: number

  // SDLC Orchestration
  sdlcPhase?: number        // SDLC phase number (1-7)
  parentIssueId?: string    // GitHub issue ID this work item is associated with
  completedPhases?: number[]  // Array of completed phase numbers
  currentPhase?: number       // Current phase being worked
  phaseHistory?: PhaseHistoryEntry[]  // History of phase state changes
  releaseHandoff?: ReleaseHandoffResult
}

/**
 * Response from claiming a work item
 */
export interface ClaimWorkItemResponse {
  success: boolean
  workItem?: WorkItem
  message?: string
}

/**
 * Execution mode for a company process
 */
export type ProcessExecutionMode = 'agent' | 'hybrid' | 'manual' | 'workforce'

/**
 * Approval policy derived from execution mode and process context.
 * See operations/lib/process-contract.mjs for derivation logic.
 */
export type ProcessApprovalPolicy =
  | 'agent-autonomous'
  | 'human-review-on-exception'
  | 'human-approval-required'
  | 'human-execution-required'
  | 'workforce-execution-required'

/**
 * Risk level for an automated process
 */
export type ProcessRiskLevel = 'high' | 'medium' | 'low'

/**
 * Business criticality level
 */
export type ProcessCriticality = 'critical' | 'high' | 'medium' | 'low'

/**
 * Operations automation boundary state.
 *
 * `missing` means the process has no contract yet and should be treated as
 * manual-only by dispatch gates.
 */
export type OperationsBoundaryState =
  | 'missing'
  | 'agent'
  | 'hybrid'
  | 'manual'
  | 'workforce'
  | 'disabled'
  | 'invalid'
  | 'mismatch'

/**
 * Human approval controls attached to an operations process boundary.
 */
export interface OperationsApprovalGate {
  approvers?: string[]
  timeoutMs?: number
  timeoutAction?: 'block' | 'escalate'
}

/**
 * Automation scope attached to an operations process boundary.
 */
export interface OperationsAutomationScope {
  allowedProfiles?: string[]
  allowedProviders?: WorkItemAgent[]
  maxDurationMinutes?: number
  maxCostUSD?: number
}

/**
 * Matching hints used to bind work items to an operations boundary.
 */
export interface OperationsMatchCriteria {
  workItemTypes?: WorkItemType[]
  repositoryPatterns?: string[]
  commandPatterns?: string[]
  sdlcPhases?: number[]
}

/**
 * Contract published by Operations and consumed by GAL for dispatch gating.
 */
export interface OperationsProcessStep {
  processKey: string
  title: string
  executionPath: ProcessExecutionMode
  enabled: boolean
  source?: 'operations'
  approvalGate?: OperationsApprovalGate
  automationScope?: OperationsAutomationScope
  matchCriteria?: OperationsMatchCriteria
  syncedAt?: Date | string
  updatedAt?: Date | string
  updatedBy?: string
}

/**
 * Result of evaluating an operations boundary for dispatch.
 */
export interface OperationsBoundaryDecision {
  canExecute: boolean
  requiresReview: boolean
  boundaryState: OperationsBoundaryState
  processKey?: string
  executionPath?: ProcessExecutionMode
  reason?: string
}

/**
 * CloudEvents-compatible execution telemetry contract for a later feedback
 * sync loop. Phase 1/2 currently models the payload shape but does not yet
 * emit or persist these events back into the Operations source of truth.
 */
export interface OperationsExecutionEvent {
  specversion: '1.0'
  type:
    | 'gal.operations.execution.completed'
    | 'gal.operations.execution.failed'
    | 'gal.operations.execution.handoff'
    | 'gal.operations.execution.blocked'
  source: 'gal-run-api' | 'background-agent-runner'
  id: string
  time: string
  data: {
    processKey: string
    boundaryState: OperationsBoundaryState
    executionPath?: ProcessExecutionMode
    reviewRequired: boolean
    outcome: 'success' | 'failure' | 'partial' | 'blocked' | 'escalated'
    sessionId?: string
    workItemId?: string
    reason?: string
    handoff?: {
      reason: string
      handoffTo: 'human' | 'supervisor' | 'different-agent'
      context: string
    }
  }
}

function normalizeStringList(values?: string[]): string[] | undefined {
  if (!values) return values
  const normalized = values
    .map((value) => typeof value === 'string' ? value.trim() : '')
    .filter((value) => value.length > 0)
  return normalized.length > 0 ? normalized : undefined
}

const PROCESS_EXECUTION_MODES = ['agent', 'hybrid', 'manual', 'workforce'] as const

function isProcessExecutionMode(value: unknown): value is ProcessExecutionMode {
  return typeof value === 'string'
    && (PROCESS_EXECUTION_MODES as readonly string[]).includes(value)
}

/**
 * Normalize an OperationsProcessStep by trimming string fields and removing
 * empty entries from array fields.
 */
export function normalizeOperationsProcessStep(
  raw?: OperationsProcessStep,
): OperationsProcessStep | undefined {
  if (!raw) return undefined

  const executionPath = typeof raw.executionPath === 'string'
    ? raw.executionPath.trim()
    : raw.executionPath

  const result: OperationsProcessStep = {
    ...raw,
    processKey: String(raw.processKey ?? '').trim(),
    title: String(raw.title ?? '').trim(),
    executionPath: executionPath as ProcessExecutionMode,
  }

  if (raw.updatedBy) {
    result.updatedBy = raw.updatedBy.trim()
  }
  if (raw.source) {
    result.source = raw.source
  }
  if (raw.approvalGate) {
    const approvers = normalizeStringList(raw.approvalGate.approvers)
    result.approvalGate = {
      ...raw.approvalGate,
      approvers,
    }
  }
  if (raw.automationScope) {
    const allowedProfiles = normalizeStringList(raw.automationScope.allowedProfiles)
    result.automationScope = {
      ...raw.automationScope,
      allowedProfiles,
    }
  }
  if (raw.matchCriteria) {
    const repositoryPatterns = normalizeStringList(raw.matchCriteria.repositoryPatterns)
    const commandPatterns = normalizeStringList(raw.matchCriteria.commandPatterns)
    result.matchCriteria = {
      ...raw.matchCriteria,
      repositoryPatterns,
      commandPatterns,
    }
  }

  return result
}

/**
 * Resolve a dispatch decision from an Operations boundary contract.
 *
 * Missing boundaries are treated as manual-only for work items that already
 * carry a process key, but remain backward-compatible for generic sessions
 * with no process context.
 */
export function resolveOperationsBoundaryDecision(params: {
  processKey?: string
  boundary?: OperationsProcessStep | undefined | null
}): OperationsBoundaryDecision {
  const processKey = params.processKey?.trim()
  const boundary = normalizeOperationsProcessStep(params.boundary ?? undefined)

  if (!boundary) {
    if (!processKey) {
      return {
        canExecute: true,
        requiresReview: false,
        boundaryState: 'missing',
      }
    }

    return {
      canExecute: false,
      requiresReview: false,
      boundaryState: 'missing',
      processKey,
      reason: `Missing Operations boundary contract for process "${processKey}". Treating as manual-only and refusing autonomous dispatch.`,
    }
  }

  const executionPath = boundary.executionPath
  const hasValidExecutionPath = isProcessExecutionMode(executionPath)

  if (!boundary.processKey || !boundary.title || !hasValidExecutionPath) {
    const malformedPath = typeof executionPath === 'string' && executionPath.length > 0
      ? executionPath
      : '(missing)'
    const malformedReason = !hasValidExecutionPath
      ? `Operations boundary contract for process "${processKey || boundary.processKey || '(unknown)'}" has invalid executionPath "${malformedPath}". Treating as manual-only and refusing autonomous dispatch.`
      : 'Operations boundary contract is incomplete or malformed. Treating as manual-only and refusing autonomous dispatch.'

    return {
      canExecute: false,
      requiresReview: false,
      boundaryState: 'invalid',
      processKey: processKey || boundary.processKey || undefined,
      reason: malformedReason,
    }
  }

  const resolvedProcessKey = boundary.processKey.trim()
  if (processKey && processKey !== resolvedProcessKey) {
    return {
      canExecute: false,
      requiresReview: false,
      boundaryState: 'mismatch',
      processKey,
      executionPath,
      reason: `Process key "${processKey}" does not match Operations boundary "${resolvedProcessKey}". Refusing dispatch until the contract is aligned.`,
    }
  }

  if (!boundary.enabled) {
    return {
      canExecute: false,
      requiresReview: false,
      boundaryState: 'disabled',
      processKey: resolvedProcessKey,
      executionPath,
      reason: `Operations boundary "${resolvedProcessKey}" is disabled.`,
    }
  }

  if (executionPath === 'manual' || executionPath === 'workforce') {
    return {
      canExecute: false,
      requiresReview: false,
      boundaryState: executionPath,
      processKey: resolvedProcessKey,
      executionPath,
      reason: `Operations boundary "${resolvedProcessKey}" is ${executionPath}-only and cannot be dispatched to a background agent.`,
    }
  }

  if (executionPath === 'hybrid') {
    return {
      canExecute: true,
      requiresReview: true,
      boundaryState: 'hybrid',
      processKey: resolvedProcessKey,
      executionPath,
      reason: `Operations boundary "${resolvedProcessKey}" allows agent execution but requires human review checkpoints.`,
    }
  }

  return {
    canExecute: true,
    requiresReview: false,
    boundaryState: 'agent',
    processKey: resolvedProcessKey,
    executionPath,
  }
}

/**
 * Execution frequency for a process
 */
export type ProcessFrequency = 'daily' | 'weekly' | 'per-issue' | 'event-driven' | 'continuous' | 'on-demand'

/**
 * Rules for matching incoming work items to a known process.
 * Used by the WorkItemClassifier (Phase 2) to classify work.
 */
export interface ProcessMatchingRules {
  /** GitHub labels that indicate this process (e.g., ["bug", "sentry"]) */
  labels?: string[]
  /** Repository patterns (e.g., ["gal-run-private", "infra"]) */
  repoPatterns?: string[]
  /** Title keyword patterns (e.g., ["fix", "bug", "sentry", "error"]) */
  titlePatterns?: string[]
}

/**
 * A synced process catalog entry from the Operations Map.
 * Stored in Firestore: organizations/{orgId}/process-catalog/{processKey}
 *
 * This is NOT a copy of the full operations data — it's the execution-relevant
 * subset that GAL needs to classify and govern agent work.
 *
 * @see openspec/changes/connect-operations-process-automation/proposal.md
 */
export interface ProcessCatalogEntry {
  /** Unique process key (e.g., "development.bugfix.ai-bug-investigation") */
  processKey: string
  /** Human-readable process title */
  title: string
  /** Business area (e.g., "development", "operations") */
  area: string
  /** Process stage within the area (e.g., "bugfix", "control-loop") */
  stage: string
  /** Current execution mode */
  currentMode: ProcessExecutionMode
  /** Derived approval policy */
  approvalPolicy: ProcessApprovalPolicy
  /** How often this process runs */
  frequency: ProcessFrequency
  /** Business criticality */
  criticality: ProcessCriticality
  /** Risk level for automated execution */
  riskLevel: ProcessRiskLevel
  /** Primary process owner */
  owner: string
  /** Manual fallback procedure */
  fallback?: string
  /** URL to operational runbook/playbook */
  runbookUrl?: string
  /** Rules for matching work items to this process */
  matchingRules?: ProcessMatchingRules
  /** Whether this process is enabled for agent execution */
  enabled: boolean

  // Execution telemetry (updated by GAL, not synced from operations)
  /** Total times this process has been executed by agents */
  totalExecutions: number
  /** Last execution timestamp */
  lastExecutedAt?: Date
  /** Success rate (0-1) */
  successRate?: number

  // Sync metadata
  /** When this entry was last synced from operations */
  syncedAt: Date
  /** Source identifier (e.g., "operations-api-v1") */
  syncSource: string
}

// ============================================================================
// Work Item Execution Context (#4180 / #4190)
//
// Structured context that flows from session creation → workflow dispatch →
// runner env → prompt injection. Allows the runner to understand provenance,
// approval state, and criticality of the work it is executing.
// ============================================================================

/**
 * Approval state for a work item execution.
 * Determines whether the runner should execute autonomously or escalate.
 */
export type WorkItemApprovalState =
  | 'approved-for-agent'       // Agent can execute autonomously
  | 'autonomous'               // Same as approved-for-agent (alias)
  | 'pending-human-approval'   // Needs human approval before execution
  | 'human-review-required'    // Agent can execute but human must review output
  | 'rejected'                 // Execution has been explicitly rejected

/**
 * Business criticality level for a work item.
 */
export type WorkItemBusinessCriticality = 'critical' | 'high' | 'medium' | 'low'

/**
 * Structured context passed to the runner via WORK_ITEM_CONTEXT_JSON env var.
 *
 * Contains provenance (where the work came from), governance (approval state),
 * and classification (criticality, process key) information.
 */
export interface WorkItemExecutionContext {
  // --- Provenance ---
  /** Process key from the operations map (e.g., "development.bugfix.ai-bug-investigation") */
  processKey?: string
  /** Related process keys for cross-process tracing */
  relatedProcessKeys?: string[]
  /** Project Master project ID (e.g., "pm-241") */
  projectId?: string
  /** Schedule ID if dispatched on a schedule (e.g., "schedule-17") */
  scheduleId?: string
  /** Project/repository context (e.g., "Scheduler-Systems/gal-run-private") */
  projectContext?: string
  /** GitHub issue or PR number */
  githubNumber?: number
  /** Internal work item ID for queue completion / telemetry */
  workItemId?: string

  // --- Identity ---
  /** GAL organization ID */
  galOrganizationId?: string
  /** User ID who requested this work (e.g., "github:103112957") */
  requestedByUserId?: string
  /** Requester display identifier (e.g., "github:103112957") */
  requestedBy?: string

  // --- Governance ---
  /** Approval state governing runner execution behavior */
  approvalState?: WorkItemApprovalState
  /** Business criticality level */
  businessCriticality?: WorkItemBusinessCriticality
  /** Optional Operations boundary contract used to gate dispatch */
  operationsBoundary?: OperationsProcessStep
  /** Canonical execution identity envelope (#4901) */
  executionIdentity?: ExecutionIdentityEnvelope
}

/**
 * Canonical execution identity envelope (#4901).
 *
 * Every background session or queue dispatch MUST carry this envelope so that:
 * - **requesterId** identifies who requested the work (human or orchestrator)
 * - **credentialOwnerId** identifies whose credentials power the execution
 * - **executionOwnerId** identifies the identity the runner session runs as
 *
 * All three are resolved at intake time and propagated end-to-end.
 * The queue consumer MUST reject any dispatch where this envelope is missing
 * or contains ambiguous values.
 */
export interface ExecutionIdentityEnvelope {
  /** GAL user ID who initiated this work request (e.g., "github:103112957") */
  requesterId: string
  /** GAL user ID whose credentials power the execution (e.g., "github:228015975") */
  credentialOwnerId: string
  /** GAL user ID the session/runner will execute as — may differ from requester when credential delegation is used */
  executionOwnerId: string
  /** How the credentialOwnerId was resolved */
  credentialResolutionMethod: CredentialResolutionMethod
  /** ISO 8601 timestamp when this envelope was created */
  resolvedAt: string
}

/** How the credential owner was resolved for a dispatch */
export type CredentialResolutionMethod =
  | 'explicit-credential-user'   // credentialUser param explicitly specified
  | 'caller-identity'            // caller's own userId used
  | 'token-label'                // resolved from context labels (e.g., [user:github:XXX])
  | 'org-credential-owner'       // fallback to org-level credential owner
  | 'provider-credential-owner'  // fallback to provider-specific credential owner

/**
 * Validate an ExecutionIdentityEnvelope.
 * Returns null if valid, or an error message string if malformed.
 */
export function validateExecutionIdentityEnvelope(
  envelope: unknown,
): string | null {
  if (!envelope || typeof envelope !== 'object') {
    return 'ExecutionIdentityEnvelope is missing or not an object'
  }
  const e = envelope as Record<string, unknown>
  const requiredStringFields: Array<keyof ExecutionIdentityEnvelope> = [
    'requesterId',
    'credentialOwnerId',
    'executionOwnerId',
    'credentialResolutionMethod',
    'resolvedAt',
  ]
  for (const field of requiredStringFields) {
    if (typeof e[field] !== 'string' || (e[field] as string).trim().length === 0) {
      return `ExecutionIdentityEnvelope.${field} is missing or empty`
    }
  }
  const validMethods: CredentialResolutionMethod[] = [
    'explicit-credential-user',
    'caller-identity',
    'token-label',
    'org-credential-owner',
    'provider-credential-owner',
  ]
  if (!validMethods.includes(e.credentialResolutionMethod as CredentialResolutionMethod)) {
    return `ExecutionIdentityEnvelope.credentialResolutionMethod "${e.credentialResolutionMethod}" is not a valid resolution method`
  }
  return null
}

/**
 * Result of parsing a WORK_ITEM_CONTEXT_JSON string.
 *
 * If the string is valid JSON with structured fields, `context` is populated.
 * If the string is plain text (legacy format), `legacyText` is populated.
 */
export interface ParsedWorkItemContext {
  /** Parsed structured context (undefined if legacy text) */
  context?: WorkItemExecutionContext
  /** Legacy plain-text context (undefined if structured JSON) */
  legacyText?: string
}

/**
 * Normalize a WorkItemExecutionContext by trimming strings and filtering
 * empty entries from string arrays.
 */
export function normalizeWorkItemExecutionContext(
  raw: WorkItemExecutionContext,
): WorkItemExecutionContext {
  const result: WorkItemExecutionContext = { ...raw }

  // Filter empty/whitespace-only entries from string arrays
  if (result.relatedProcessKeys) {
    result.relatedProcessKeys = result.relatedProcessKeys
      .filter((k) => typeof k === 'string' && k.trim().length > 0)
  }

  if (result.operationsBoundary) {
    result.operationsBoundary = normalizeOperationsProcessStep(result.operationsBoundary)
  }

  return result
}

/**
 * Serialize a WorkItemExecutionContext to a JSON string for env var transport.
 */
export function serializeWorkItemExecutionContext(
  ctx: WorkItemExecutionContext,
): string {
  return JSON.stringify(normalizeWorkItemExecutionContext(ctx))
}

/**
 * Parse a WORK_ITEM_CONTEXT_JSON string into a ParsedWorkItemContext.
 *
 * - If the input is valid JSON containing an object, it is treated as structured context.
 * - If the input is plain text (not JSON), it is treated as legacy text.
 * - If the input is empty/undefined, both fields are undefined.
 */
export function parseWorkItemExecutionContext(
  raw: string | undefined,
): ParsedWorkItemContext {
  if (!raw || raw.trim().length === 0) {
    return {}
  }

  try {
    const parsed = JSON.parse(raw)
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      return { context: normalizeWorkItemExecutionContext(parsed as WorkItemExecutionContext) }
    }
    // JSON but not an object (e.g., a number or array) — treat as legacy
    return { legacyText: raw }
  } catch {
    // Not valid JSON — treat as legacy plain text
    return { legacyText: raw }
  }
}
