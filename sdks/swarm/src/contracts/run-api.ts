import type { GalSwarmSandboxProvider } from './providers.js'

/**
 * Run API contracts consumed by the gal-api Swarm microservice.
 *
 * gal-swarm owns these request and plan shapes; gal-api owns the HTTP route,
 * authorization, persistence, dispatch, and status hydration around them.
 */

export const GAL_SWARM_API_VERSION = '2026-05-07' as const

export type GalSwarmTriggerSource = 'dashboard' | 'gal-code' | 'gal-cli' | 'gal-mcp' | 'api'
export type GalSwarmRunMode = 'dry-run' | 'apply'
// @deprecated Use GalSwarmSandboxProvider for the swarm compute target.
export type GalSwarmProvider = GalSwarmSandboxProvider
export type GalSwarmRunStatus =
  | 'planned'
  | 'preflight_required'
  | 'ready_for_apply'
  | 'running'
  | 'draining'
  | 'completed'
  | 'failed'

export interface GalSwarmWorkloadEstimate {
  tasks: number
  promptTokens: number
  completionTokens: number
  toolCalls: number
  workflowWaitSeconds: number
  sandboxCount: number
}

export interface GalSwarmExecutionActuals {
  durationSeconds: number
  promptTokens: number
  completionTokens: number
  toolCalls: number
  workflowWaitSeconds: number
  sandboxCount: number
  completedAt?: string
  notes?: string
}

export interface GalSwarmCalibrationSummary {
  durationRatio: number
  tokenRatio: number
  toolCallRatio: number
  workflowWaitRatio: number
  sandboxRatio: number
}

export interface GalSwarmOperatorQuestionnaire {
  highLevelPrompt: string
  successCriteria: string[]
  constraints: string[]
  approvalQuestion: string
}

export interface GalSwarmExecutionApproval {
  required: true
  approved: boolean
  approvalEvidenceUrl?: string
  approvedBy?: string
  approvedAt?: string
  question: string
}

export type GalSwarmCapacityAction =
  | 'hold'
  | 'scale_up'
  | 'drain'
  | 'switch_to_serverless'
  | 'shutdown'

export type GalSwarmCapacityReason =
  | 'within_target'
  | 'backlog_pressure'
  | 'latency_pressure'
  | 'provider_unhealthy'
  | 'budget_exhausted'
  | 'ttl_exhausted'
  | 'low_utilization'
  | 'idle_drained'

export type GalSwarmCapacityPolicyProfile = 'dev-smoke' | 'small-paid' | 'large-burst'

export interface GalSwarmCapacityPolicy {
  profile: GalSwarmCapacityPolicyProfile
  minWorkers: number
  maxWorkers: number
  scaleUpQueuedTokenSeconds: number
  scaleUpLatencyP95Ms: number
  scaleDownUtilizationPercent: number
  scaleDownIdleSeconds: number
  drainIdleSeconds: number
  hardTtlSeconds: number
  maxSpendUsd: number
}

export interface GalSwarmCapacityObservation {
  activeWorkers: number
  queuedTokenSeconds: number
  tokensPerSecond: number
  latencyP95Ms: number
  gpuUtilizationPercent: number
  memoryUtilizationPercent: number
  activeTasks: number
  queuedTasks: number
  errorRatePercent: number
  providerHealthy: boolean
  elapsedSeconds: number
  spendUsd: number
  idleSeconds: number
  serverlessFallbackHealthy: boolean
}

export interface GalSwarmCapacityDecision {
  action: GalSwarmCapacityAction
  reason: GalSwarmCapacityReason
  desiredWorkers: number
  serverlessFallbackActive: boolean
  drain: boolean
  shutdown: boolean
  explanation: string
}

export type GalSwarmProviderExecutorMode = 'noop-dry-run' | 'apply'
export type GalSwarmProviderOperationType =
  | 'none'
  | 'scale-up'
  | 'drain-workers'
  | 'route-serverless'
  | 'shutdown-capacity'

export interface GalSwarmProviderOperation {
  type: GalSwarmProviderOperationType
  provider: GalSwarmProvider
  computeProfileId: string
  desiredWorkers: number
  desiredComputeUnits: number
  serverlessEndpointId: string
  dryRun: boolean
  reason: GalSwarmCapacityReason
  command: string
}

export interface GalSwarmProviderActionPlan {
  executorMode: GalSwarmProviderExecutorMode
  provider: GalSwarmProvider
  operation: GalSwarmProviderOperation
  requiresApproval: boolean
  canApply: boolean
  notes: string[]
}

export interface GalSwarmComputeTarget {
  /** @deprecated Use sandboxProvider instead. Kept for backward compatibility. */
  provider?: GalSwarmProvider
  /** The sandbox provider where worker infrastructure runs. Stratus is the only production-enabled target today. */
  sandboxProvider?: GalSwarmSandboxProvider
  computeProfileId: string
  capacityPolicyProfile?: GalSwarmCapacityPolicyProfile
  desiredWorkers: number
  desiredComputeUnits: number
  ttlHours: number
  maxHourlyUsd: number
  serverlessEndpointId: string
}

export interface GalSwarmRunRequest {
  orgName: string
  objective: string
  questionnaire?: Partial<GalSwarmOperatorQuestionnaire>
  source: GalSwarmTriggerSource
  mode: GalSwarmRunMode
  target: GalSwarmComputeTarget
  workload: GalSwarmWorkloadEstimate
  approvalEvidenceUrl?: string
  executionApproval?: Partial<GalSwarmExecutionApproval>
  correlationId?: string
}

export interface GalSwarmStratusOperation {
  type: 'preflight' | 'burst-start-plan' | 'burst-run' | 'monitor' | 'drain'
  taskType: string
  workflow?: string
  artifactName?: string
}

export type GalSwarmRunPreflightCategory =
  | 'approval'
  | 'budget'
  | 'provider'
  | 'quota'
  | 'model'
  | 'workload'
  | 'sandbox'
  | 'monitoring'
  | 'drain'
  | 'fallback'

export interface GalSwarmRunPreflightCheck {
  id: string
  category: GalSwarmRunPreflightCategory
  required: true
  status: 'pending'
  description: string
}

export interface GalSwarmRunPlan {
  apiVersion: typeof GAL_SWARM_API_VERSION
  runId: string
  orgName: string
  status: GalSwarmRunStatus
  source: GalSwarmTriggerSource
  mode: GalSwarmRunMode
  objective: string
  questionnaire: GalSwarmOperatorQuestionnaire
  executionApproval: GalSwarmExecutionApproval
  target: GalSwarmComputeTarget
  workload: GalSwarmWorkloadEstimate
  predictedDurationSeconds: number
  predictedTokenSeconds: number
  serverlessFallbackRequired: true
  approvalRequired: boolean
  preflightChecks: GalSwarmRunPreflightCheck[]
  stratusOperations: GalSwarmStratusOperation[]
}

export const GAL_SWARM_DEFAULT_RUNNER_LABEL = 'agents-standard-runc-x64' as const
export const GAL_SWARM_DEFAULT_RUNNER_LABELS = [
  GAL_SWARM_DEFAULT_RUNNER_LABEL,
  'agents-medium-runc-x64',
  'agents-high-runc-x64',
] as const

export const GAL_SWARM_LEGACY_RUNNER_LABELS = {
  'arc-linux-agents': 'agents-standard-runc-x64',
  'arc-linux-agents-runc': 'agents-standard-runc-x64',
  'agents-standard-runc': 'agents-standard-runc-x64',
  'agents-medium-runc': 'agents-medium-runc-x64',
  'agents-high-runc': 'agents-high-runc-x64',
  'agents-standard-vz-arm64': 'agents-standard-runc-x64',
  'agents-medium-vz-arm64': 'agents-medium-runc-x64',
  'agents-high-vz-arm64': 'agents-high-runc-x64',
} as const

export type GalSwarmRunnerLabel = (typeof GAL_SWARM_DEFAULT_RUNNER_LABELS)[number]
export type GalSwarmWorkerDispatchBackend = 'stratus' | 'gha' | (string & {})
export type GalSwarmWorkerAgent = 'claude' | 'codex' | 'gemini' | 'gal' | 'gal-code' | (string & {})

export interface GalSwarmWorkerIssue {
  repository: string
  issueNumber: number
  title: string
  url?: string
  labels?: string[]
}

export interface GalSwarmWorkerDispatchRequest {
  enabled: boolean
  maxSessions?: number
  projectContext?: string
  branch?: string
  agent?: GalSwarmWorkerAgent
  model?: string
  runnerLabel?: GalSwarmRunnerLabel
  runnerLabels?: GalSwarmRunnerLabel[]
  dispatchBackend?: GalSwarmWorkerDispatchBackend
  issues: GalSwarmWorkerIssue[]
}

export interface GalSwarmWorkerSessionDispatch {
  status: 'dispatched' | 'failed'
  sessionId?: string
  workflowRunId?: number
  workflowOwner?: string
  workflowRepo?: string
  repository: string
  issueNumber: number
  title: string
  url?: string
  runnerLabel?: GalSwarmRunnerLabel
  error?: string
  liveStatus?: {
    sessionStatus?: string
    workflowStatus?: string
    workflowConclusion?: string | null
    refreshedAt: string
  }
}

export interface GalSwarmWorkerDispatchState {
  status: 'dispatched' | 'partial' | 'failed' | 'skipped'
  requested: number
  dispatched: number
  failed: number
  maxSessions: number
  runnerLabels?: GalSwarmRunnerLabel[]
  dispatchedAt: string
  sessions: GalSwarmWorkerSessionDispatch[]
}

export interface GalSwarmStratusWorkflowDispatch {
  status: 'dispatched' | 'failed'
  workflow: string
  owner: string
  repo: string
  provider: GalSwarmProvider
  preflightArtifactName: string
  dispatchedAt: string
  workflowUrl?: string
  runId?: number
  runUrl?: string
  error?: string
  liveStatus?: {
    workflowStatus: string
    workflowConclusion: string | null
    refreshedAt: string
  }
}

export interface GalSwarmStratusDispatchState {
  pipeline?: GalSwarmStratusWorkflowDispatch
}

export interface GalSwarmStoredRun {
  plan: GalSwarmRunPlan
  approvalEvidenceUrl?: string
  createdAt: string
  updatedAt: string
  actuals?: GalSwarmExecutionActuals
  calibration?: GalSwarmCalibrationSummary
  capacityObservation?: GalSwarmCapacityObservation
  capacityDecision?: GalSwarmCapacityDecision
  providerActionPlan?: GalSwarmProviderActionPlan
  capacityObservedAt?: string
  stratusDispatch?: GalSwarmStratusDispatchState
  workerDispatch?: GalSwarmWorkerDispatchState
}

export interface GalSwarmRunApiEndpoints {
  dashboard: string
  galCode: string
  stratus: {
    pipelineWorkflow?: string
    preflightWorkflow: string
    burstStartWorkflow: string
    burstRunWorkflow: string
  }
}

export interface GalSwarmRunCreateResponse {
  plan: GalSwarmRunPlan
  run: GalSwarmStoredRun
  endpoints: GalSwarmRunApiEndpoints
}

export type GalSwarmRunStatusResponse = GalSwarmStoredRun & {
  sessionCount?: number
}
