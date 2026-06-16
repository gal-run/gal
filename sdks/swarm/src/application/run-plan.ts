import {
  GAL_SWARM_API_VERSION,
  GAL_SWARM_ENABLED_SANDBOX_PROVIDERS,
  GAL_SWARM_SANDBOX_PROVIDERS,
  type GalSwarmCalibrationSummary,
  type GalSwarmCapacityAction,
  type GalSwarmCapacityDecision,
  type GalSwarmCapacityObservation,
  type GalSwarmCapacityPolicy,
  type GalSwarmCapacityPolicyProfile,
  type GalSwarmCapacityReason,
  type GalSwarmComputeTarget,
  type GalSwarmExecutionActuals,
  type GalSwarmExecutionApproval,
  type GalSwarmOperatorQuestionnaire,
  type GalSwarmProviderActionPlan,
  type GalSwarmProviderExecutorMode,
  type GalSwarmProviderOperation,
  type GalSwarmProviderOperationType,
  type GalSwarmRunPlan,
  type GalSwarmRunPreflightCheck,
  type GalSwarmRunRequest,
  type GalSwarmSandboxProvider,
} from '../contracts.js'

export function createGalSwarmRunPlan(request: GalSwarmRunRequest): GalSwarmRunPlan {
  validateGalSwarmRunRequest(request)
  const runId = request.correlationId?.trim() || `swarm_${Date.now().toString(36)}`
  const sandboxProvider = resolveGalSwarmSandboxProvider(request.target)
  const questionnaire = normalizeRunQuestionnaire(request)
  const executionApproval = normalizeExecutionApproval(request, questionnaire)
  // This is a planning estimate for gal-api and dashboards. It is intentionally
  // conservative and local; provider telemetry calibrates it after execution.
  const predictedTokenSeconds = Math.ceil((request.workload.promptTokens + request.workload.completionTokens) / 120)
  const predictedDurationSeconds = Math.max(
    predictedTokenSeconds,
    request.workload.workflowWaitSeconds,
    request.workload.toolCalls * 8,
  )

  return {
    apiVersion: GAL_SWARM_API_VERSION,
    runId,
    orgName: request.orgName,
    status: request.mode === 'apply' ? 'ready_for_apply' : 'planned',
    source: request.source,
    mode: request.mode,
    objective: request.objective,
    questionnaire,
    executionApproval,
    target: request.target,
    workload: request.workload,
    predictedDurationSeconds,
    predictedTokenSeconds,
    serverlessFallbackRequired: true,
    approvalRequired: request.mode === 'apply',
    preflightChecks: createRunPreflightChecks(request),
    stratusOperations: [
      {
        type: 'preflight',
        taskType: 'stratus.gpu.swarm.preflight.check',
        workflow: 'gpu-swarm-preflight.yml',
        artifactName: `gpu-swarm-preflight-result-${sandboxProvider}`,
      },
      {
        type: 'burst-start-plan',
        taskType: 'stratus.gpu.swarm.burst.start.plan',
        workflow: 'gpu-swarm-burst-start.yml',
        artifactName: `gpu-swarm-burst-start-plan-${sandboxProvider}`,
      },
      {
        type: 'burst-run',
        taskType: 'stratus.gpu.swarm.burst.run',
        workflow: 'gpu-swarm-burst-run.yml',
        artifactName: `gpu-swarm-burst-run-result-${sandboxProvider}-${request.mode}`,
      },
      {
        type: 'monitor',
        taskType: 'stratus.gpu.swarm.monitor',
      },
      {
        type: 'drain',
        taskType: 'stratus.gpu.swarm.drain',
      },
    ],
  }
}

export function createGalSwarmCalibrationSummary(
  plan: Pick<GalSwarmRunPlan, 'predictedDurationSeconds' | 'workload'>,
  actuals: GalSwarmExecutionActuals,
): GalSwarmCalibrationSummary {
  validateGalSwarmExecutionActuals(actuals)
  const predictedTokens = plan.workload.promptTokens + plan.workload.completionTokens
  const actualTokens = actuals.promptTokens + actuals.completionTokens
  return {
    durationRatio: metricRatio(actuals.durationSeconds, plan.predictedDurationSeconds),
    tokenRatio: metricRatio(actualTokens, predictedTokens),
    toolCallRatio: metricRatio(actuals.toolCalls, plan.workload.toolCalls),
    workflowWaitRatio: metricRatio(actuals.workflowWaitSeconds, plan.workload.workflowWaitSeconds),
    sandboxRatio: metricRatio(actuals.sandboxCount, plan.workload.sandboxCount),
  }
}

export function createDefaultCapacityPolicy(plan: GalSwarmRunPlan): GalSwarmCapacityPolicy {
  const profile = plan.target.capacityPolicyProfile ?? inferCapacityPolicyProfile(plan)
  const timing = getCapacityPolicyTiming(profile)
  return {
    profile,
    minWorkers: plan.mode === 'apply' ? 1 : 0,
    maxWorkers: Math.max(plan.target.desiredWorkers, 1),
    scaleUpQueuedTokenSeconds: 300,
    scaleUpLatencyP95Ms: 60_000,
    scaleDownUtilizationPercent: 35,
    scaleDownIdleSeconds: timing.scaleDownIdleSeconds,
    drainIdleSeconds: timing.drainIdleSeconds,
    hardTtlSeconds: Math.ceil(plan.target.ttlHours * 3600),
    maxSpendUsd: Number((plan.target.ttlHours * plan.target.maxHourlyUsd).toFixed(2)),
  }
}

export function decideGalSwarmCapacity(
  plan: GalSwarmRunPlan,
  observation: GalSwarmCapacityObservation,
  policy: GalSwarmCapacityPolicy = createDefaultCapacityPolicy(plan),
): GalSwarmCapacityDecision {
  validateGalSwarmCapacityObservation(observation)
  validateGalSwarmCapacityPolicy(policy)

  if (!observation.providerHealthy) {
    return runCapacityDecision('switch_to_serverless', 'provider_unhealthy', policy.minWorkers, true, true, false, 'Provider health check failed; drain self-hosted workers and route to serverless fallback.')
  }

  if (observation.spendUsd >= policy.maxSpendUsd) {
    return runCapacityDecision('switch_to_serverless', 'budget_exhausted', policy.minWorkers, true, true, false, 'Spend reached the approved cap; drain self-hosted workers and route remaining work to serverless fallback.')
  }

  if (observation.elapsedSeconds >= policy.hardTtlSeconds) {
    return runCapacityDecision('switch_to_serverless', 'ttl_exhausted', policy.minWorkers, true, true, false, 'Hard TTL expired; drain self-hosted workers and route remaining work to serverless fallback.')
  }

  if (observation.activeTasks === 0 && observation.queuedTasks === 0 && observation.idleSeconds >= policy.drainIdleSeconds) {
    return runCapacityDecision('shutdown', 'idle_drained', 0, false, true, true, 'No active or queued work remains past the drain idle window; shut down on-demand capacity.')
  }

  if (
    observation.activeWorkers < policy.maxWorkers &&
    (observation.queuedTokenSeconds >= policy.scaleUpQueuedTokenSeconds ||
      observation.latencyP95Ms >= policy.scaleUpLatencyP95Ms)
  ) {
    const desiredWorkers = Math.min(policy.maxWorkers, Math.max(observation.activeWorkers + 1, policy.minWorkers))
    const reason = observation.queuedTokenSeconds >= policy.scaleUpQueuedTokenSeconds ? 'backlog_pressure' : 'latency_pressure'
    return runCapacityDecision('scale_up', reason, desiredWorkers, false, false, false, 'Backlog or latency pressure justifies adding self-hosted workers.')
  }

  if (
    observation.activeWorkers > policy.minWorkers &&
    observation.gpuUtilizationPercent < policy.scaleDownUtilizationPercent &&
    observation.queuedTasks === 0 &&
    observation.idleSeconds >= policy.scaleDownIdleSeconds
  ) {
    return runCapacityDecision('drain', 'low_utilization', Math.max(policy.minWorkers, observation.activeWorkers - 1), true, true, false, 'Utilization is below threshold with no queued work; drain one worker and keep serverless fallback available.')
  }

  return runCapacityDecision('hold', 'within_target', observation.activeWorkers, false, false, false, 'Capacity is within policy thresholds.')
}

export function createGalSwarmProviderActionPlan(
  plan: GalSwarmRunPlan,
  decision: GalSwarmCapacityDecision,
  executorMode: GalSwarmProviderExecutorMode = 'noop-dry-run',
): GalSwarmProviderActionPlan {
  const dryRun = executorMode === 'noop-dry-run'
  const operationType = getProviderOperationType(decision.action)
  const sandboxProvider = resolveGalSwarmSandboxProvider(plan.target)
  const operation: GalSwarmProviderOperation = {
    type: operationType,
    provider: sandboxProvider,
    computeProfileId: plan.target.computeProfileId,
    desiredWorkers: decision.desiredWorkers,
    desiredComputeUnits: Math.min(plan.target.desiredComputeUnits, Math.max(decision.desiredWorkers, 0)),
    serverlessEndpointId: plan.target.serverlessEndpointId,
    dryRun,
    reason: decision.reason,
    command: createProviderOperationCommand(plan, decision, operationType, dryRun),
  }

  return {
    executorMode,
    provider: sandboxProvider,
    operation,
    requiresApproval: operationType !== 'none' && !plan.executionApproval.approved,
    canApply: operationType !== 'none' && !dryRun && plan.mode === 'apply' && plan.executionApproval.approved,
    notes: createProviderActionNotes(plan, decision, operationType, dryRun),
  }
}

export function validateGalSwarmRunRequest(request: GalSwarmRunRequest): void {
  if (!request.orgName.trim()) throw new Error('orgName is required.')
  if (!request.objective.trim()) throw new Error('objective is required.')
  if (!['dashboard', 'gal-code', 'gal-cli', 'gal-mcp', 'api'].includes(request.source)) {
    throw new Error(`Invalid source: ${request.source}`)
  }
  if (!['dry-run', 'apply'].includes(request.mode)) throw new Error(`Invalid mode: ${request.mode}`)
  // Prefer sandboxProvider, but keep provider as an input shim while older
  // gal-api callers finish migrating.
  const sandboxProvider = request.target.sandboxProvider ?? request.target.provider
  if (!sandboxProvider || !GAL_SWARM_SANDBOX_PROVIDERS.includes(sandboxProvider)) {
    throw new Error(`Unknown sandbox provider: ${sandboxProvider ?? 'undefined'}`)
  }
  if (!GAL_SWARM_ENABLED_SANDBOX_PROVIDERS.includes(sandboxProvider)) {
    throw new Error(`Sandbox provider not enabled: ${sandboxProvider}. Enabled: ${GAL_SWARM_ENABLED_SANDBOX_PROVIDERS.join(', ')}`)
  }
  if (!request.target.computeProfileId.trim()) throw new Error('target.computeProfileId is required.')
  if (
    request.target.capacityPolicyProfile &&
    !['dev-smoke', 'small-paid', 'large-burst'].includes(request.target.capacityPolicyProfile)
  ) {
    throw new Error(`Invalid target.capacityPolicyProfile: ${request.target.capacityPolicyProfile}`)
  }
  if (!request.target.serverlessEndpointId.trim()) throw new Error('target.serverlessEndpointId is required.')
  if (request.target.desiredWorkers <= 0) throw new Error('target.desiredWorkers must be positive.')
  if (request.target.desiredComputeUnits <= 0) throw new Error('target.desiredComputeUnits must be positive.')
  if (request.target.ttlHours <= 0 || request.target.ttlHours > 2) throw new Error('target.ttlHours must be between 0 and 2.')
  if (request.target.maxHourlyUsd <= 0) throw new Error('target.maxHourlyUsd must be positive.')
  if (request.workload.tasks <= 0) throw new Error('workload.tasks must be positive.')
  if (request.workload.promptTokens < 0 || request.workload.completionTokens < 0) throw new Error('workload tokens must be non-negative.')
  if (request.workload.toolCalls < 0 || request.workload.workflowWaitSeconds < 0 || request.workload.sandboxCount < 0) {
    throw new Error('workload estimates must be non-negative.')
  }
  const questionnaire = normalizeRunQuestionnaire(request)
  if (!questionnaire.highLevelPrompt.trim()) throw new Error('questionnaire.highLevelPrompt is required.')
  if (questionnaire.successCriteria.length === 0) throw new Error('questionnaire.successCriteria is required.')
  if (request.mode === 'apply' && !request.approvalEvidenceUrl?.trim()) {
    throw new Error('approvalEvidenceUrl is required for apply mode.')
  }
  if (request.mode === 'apply' && request.executionApproval?.approved !== true) {
    throw new Error('executionApproval.approved is required for apply mode.')
  }
}

export function validateGalSwarmExecutionActuals(actuals: GalSwarmExecutionActuals): void {
  if (!Number.isFinite(actuals.durationSeconds) || actuals.durationSeconds < 0) {
    throw new Error('actual durationSeconds must be non-negative.')
  }
  if (!Number.isFinite(actuals.promptTokens) || !Number.isFinite(actuals.completionTokens) || actuals.promptTokens < 0 || actuals.completionTokens < 0) {
    throw new Error('actual tokens must be non-negative.')
  }
  if (
    !Number.isFinite(actuals.toolCalls) ||
    !Number.isFinite(actuals.workflowWaitSeconds) ||
    !Number.isFinite(actuals.sandboxCount) ||
    actuals.toolCalls < 0 ||
    actuals.workflowWaitSeconds < 0 ||
    actuals.sandboxCount < 0
  ) {
    throw new Error('actual execution metrics must be non-negative.')
  }
}

export function validateGalSwarmCapacityPolicy(policy: GalSwarmCapacityPolicy): void {
  if (!Number.isFinite(policy.minWorkers) || policy.minWorkers < 0) throw new Error('capacity policy minWorkers must be non-negative.')
  if (!Number.isFinite(policy.maxWorkers) || policy.maxWorkers < policy.minWorkers) throw new Error('capacity policy maxWorkers must be at least minWorkers.')
  if (!Number.isFinite(policy.scaleUpQueuedTokenSeconds) || policy.scaleUpQueuedTokenSeconds < 0) throw new Error('capacity policy scaleUpQueuedTokenSeconds must be non-negative.')
  if (!Number.isFinite(policy.scaleUpLatencyP95Ms) || policy.scaleUpLatencyP95Ms < 0) throw new Error('capacity policy scaleUpLatencyP95Ms must be non-negative.')
  if (!Number.isFinite(policy.scaleDownUtilizationPercent) || policy.scaleDownUtilizationPercent < 0 || policy.scaleDownUtilizationPercent > 100) throw new Error('capacity policy scaleDownUtilizationPercent must be between 0 and 100.')
  if (!Number.isFinite(policy.scaleDownIdleSeconds) || policy.scaleDownIdleSeconds < 0) throw new Error('capacity policy scaleDownIdleSeconds must be non-negative.')
  if (!Number.isFinite(policy.drainIdleSeconds) || policy.drainIdleSeconds < 0) throw new Error('capacity policy drainIdleSeconds must be non-negative.')
  if (!Number.isFinite(policy.hardTtlSeconds) || policy.hardTtlSeconds <= 0) throw new Error('capacity policy hardTtlSeconds must be positive.')
  if (!Number.isFinite(policy.maxSpendUsd) || policy.maxSpendUsd <= 0) throw new Error('capacity policy maxSpendUsd must be positive.')
}

export function validateGalSwarmCapacityObservation(observation: GalSwarmCapacityObservation): void {
  const nonNegativeFields: Array<keyof GalSwarmCapacityObservation> = [
    'activeWorkers',
    'queuedTokenSeconds',
    'tokensPerSecond',
    'latencyP95Ms',
    'gpuUtilizationPercent',
    'memoryUtilizationPercent',
    'activeTasks',
    'queuedTasks',
    'errorRatePercent',
    'elapsedSeconds',
    'spendUsd',
    'idleSeconds',
  ]
  for (const field of nonNegativeFields) {
    const value = observation[field]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`capacity observation ${field} must be non-negative.`)
    }
  }
  if (observation.gpuUtilizationPercent > 100 || observation.memoryUtilizationPercent > 100 || observation.errorRatePercent > 100) {
    throw new Error('capacity observation percentages must be between 0 and 100.')
  }
}


function metricRatio(actual: number, predicted: number): number {
  if (predicted === 0) {
    return actual === 0 ? 1 : Number.POSITIVE_INFINITY
  }
  return Number((actual / predicted).toFixed(3))
}

function inferCapacityPolicyProfile(plan: Pick<GalSwarmRunPlan, 'mode' | 'target'>): GalSwarmCapacityPolicyProfile {
  if (plan.target.computeProfileId.includes('8xh200') || plan.target.desiredComputeUnits >= 8) {
    return 'large-burst'
  }
  if (plan.mode === 'apply') {
    return 'small-paid'
  }
  return 'dev-smoke'
}

function getCapacityPolicyTiming(profile: GalSwarmCapacityPolicyProfile): Pick<GalSwarmCapacityPolicy, 'scaleDownIdleSeconds' | 'drainIdleSeconds'> {
  switch (profile) {
    case 'dev-smoke':
      return { scaleDownIdleSeconds: 60, drainIdleSeconds: 120 }
    case 'small-paid':
      return { scaleDownIdleSeconds: 180, drainIdleSeconds: 300 }
    case 'large-burst':
      return { scaleDownIdleSeconds: 600, drainIdleSeconds: 900 }
  }
}

function getProviderOperationType(action: GalSwarmCapacityAction): GalSwarmProviderOperationType {
  switch (action) {
    case 'scale_up':
      return 'scale-up'
    case 'drain':
      return 'drain-workers'
    case 'switch_to_serverless':
      return 'route-serverless'
    case 'shutdown':
      return 'shutdown-capacity'
    case 'hold':
      return 'none'
  }
}

function createProviderOperationCommand(
  plan: GalSwarmRunPlan,
  decision: GalSwarmCapacityDecision,
  operationType: GalSwarmProviderOperationType,
  dryRun: boolean,
): string {
  const prefix = dryRun ? 'noop' : 'provider'
  const sandboxProvider = resolveGalSwarmSandboxProvider(plan.target)
  switch (operationType) {
    case 'scale-up':
      return `${prefix}:${sandboxProvider}:scale-up:${plan.target.computeProfileId}:workers=${decision.desiredWorkers}`
    case 'drain-workers':
      return `${prefix}:${sandboxProvider}:drain:${plan.target.computeProfileId}:workers=${decision.desiredWorkers}`
    case 'route-serverless':
      return `${prefix}:${sandboxProvider}:route-serverless:${plan.target.serverlessEndpointId}`
    case 'shutdown-capacity':
      return `${prefix}:${sandboxProvider}:shutdown:${plan.target.computeProfileId}`
    case 'none':
      return `${prefix}:${sandboxProvider}:hold`
  }
}

function createProviderActionNotes(
  plan: GalSwarmRunPlan,
  decision: GalSwarmCapacityDecision,
  operationType: GalSwarmProviderOperationType,
  dryRun: boolean,
): string[] {
  const notes = [
    decision.explanation,
    dryRun
      ? 'No provider resources will be created, changed, or deleted.'
      : 'Provider executor may change live capacity.',
  ]
  if (operationType !== 'none' && !plan.executionApproval.approved) {
    notes.push('Execution approval is required before applying provider operations.')
  }
  return notes
}

function runCapacityDecision(
  action: GalSwarmCapacityAction,
  reason: GalSwarmCapacityReason,
  desiredWorkers: number,
  serverlessFallbackActive: boolean,
  drain: boolean,
  shutdown: boolean,
  explanation: string,
): GalSwarmCapacityDecision {
  return {
    action,
    reason,
    desiredWorkers,
    serverlessFallbackActive,
    drain,
    shutdown,
    explanation,
  }
}

function createRunPreflightChecks(request: GalSwarmRunRequest): GalSwarmRunPreflightCheck[] {
  const sandboxProvider = resolveGalSwarmSandboxProvider(request.target)
  return [
    {
      id: 'approval-evidence',
      category: 'approval',
      required: true,
      status: 'pending',
      description: request.mode === 'apply'
        ? 'Verify approvalEvidenceUrl and confirm the request is allowed to start paid compute.'
        : 'Confirm this is a dry-run plan and cannot start paid compute.',
    },
    {
      id: 'budget-cap',
      category: 'budget',
      required: true,
      status: 'pending',
      description: `Confirm maxHourlyUsd (${request.target.maxHourlyUsd}) and ttlHours (${request.target.ttlHours}) are within the approved burst budget.`,
    },
    {
      id: 'provider-credentials',
      category: 'provider',
      required: true,
      status: 'pending',
      description: `Verify ${sandboxProvider} credentials, project/account selection, and API access for compute profile ${request.target.computeProfileId}.`,
    },
    {
      id: 'provider-quota',
      category: 'quota',
      required: true,
      status: 'pending',
      description: `Verify quota for ${request.target.desiredComputeUnits} compute unit(s) and ${request.target.desiredWorkers} worker(s).`,
    },
    {
      id: 'model-capacity',
      category: 'model',
      required: true,
      status: 'pending',
      description: 'Verify the selected model endpoint can satisfy predicted token throughput and context needs.',
    },
    {
      id: 'workload-estimate',
      category: 'workload',
      required: true,
      status: 'pending',
      description: `Validate ${request.workload.tasks} task(s), ${request.workload.toolCalls} tool call(s), and ${request.workload.workflowWaitSeconds}s workflow wait estimate.`,
    },
    {
      id: 'sandbox-capacity',
      category: 'sandbox',
      required: true,
      status: 'pending',
      description: `Verify ${request.workload.sandboxCount} sandbox(es) can be started with required secrets and filesystem isolation.`,
    },
    {
      id: 'monitoring',
      category: 'monitoring',
      required: true,
      status: 'pending',
      description: 'Confirm utilization, cost, token throughput, tool latency, and workflow wait monitoring is active before apply.',
    },
    {
      id: 'drain-plan',
      category: 'drain',
      required: true,
      status: 'pending',
      description: 'Confirm low-utilization drain threshold, timeout, and shutdown path before any self-hosted burst.',
    },
    {
      id: 'serverless-fallback',
      category: 'fallback',
      required: true,
      status: 'pending',
      description: `Verify serverless fallback endpoint ${request.target.serverlessEndpointId} is ready if self-hosted utilization drops below threshold.`,
    },
  ]
}

function resolveGalSwarmSandboxProvider(
  target: Pick<GalSwarmComputeTarget, 'provider' | 'sandboxProvider'>,
): GalSwarmSandboxProvider {
  return target.sandboxProvider ?? target.provider ?? 'stratus'
}

function normalizeRunQuestionnaire(request: Pick<GalSwarmRunRequest, 'objective' | 'questionnaire'>): GalSwarmOperatorQuestionnaire {
  const highLevelPrompt = request.questionnaire?.highLevelPrompt?.trim() || request.objective.trim()
  const successCriteria = normalizeStringList(
    request.questionnaire?.successCriteria,
    [`Complete the requested objective: ${request.objective.trim()}`],
  )
  const constraints = normalizeStringList(request.questionnaire?.constraints, [])
  const approvalQuestion = request.questionnaire?.approvalQuestion?.trim() ||
    `Approve starting this swarm to satisfy: ${highLevelPrompt}?`

  return {
    highLevelPrompt,
    successCriteria,
    constraints,
    approvalQuestion,
  }
}

function normalizeExecutionApproval(
  request: Pick<GalSwarmRunRequest, 'approvalEvidenceUrl' | 'executionApproval'>,
  questionnaire: GalSwarmOperatorQuestionnaire,
): GalSwarmExecutionApproval {
  const approval: GalSwarmExecutionApproval = {
    required: true,
    approved: request.executionApproval?.approved === true,
    question: request.executionApproval?.question?.trim() || questionnaire.approvalQuestion,
  }
  const approvalEvidenceUrl = request.approvalEvidenceUrl?.trim() || request.executionApproval?.approvalEvidenceUrl?.trim()
  const approvedBy = request.executionApproval?.approvedBy?.trim()
  const approvedAt = request.executionApproval?.approvedAt?.trim()
  if (approvalEvidenceUrl) approval.approvalEvidenceUrl = approvalEvidenceUrl
  if (approvedBy) approval.approvedBy = approvedBy
  if (approvedAt) approval.approvedAt = approvedAt
  return approval
}

function normalizeStringList(value: unknown, fallback: string[]): string[] {
  if (!Array.isArray(value)) {
    return fallback
  }
  return value
    .map((item) => typeof item === 'string' ? item.trim() : '')
    .filter((item) => item.length > 0)
}
