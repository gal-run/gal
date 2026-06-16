/**
 * Provider-neutral GAL prediction contracts.
 *
 * Prediction owns pre-execution forecasting. Swarm owns temporary compute.
 * Queue owns durable dispatch. Agent definitions own capabilities.
 */

export const GAL_PREDICTION_REQUEST_SCHEMA_VERSION = 'gal.prediction-request.v1' as const
export const GAL_EXECUTION_FORECAST_SCHEMA_VERSION = 'gal.execution-forecast.v1' as const
export const GAL_EXECUTION_TRACE_SCHEMA_VERSION = 'gal.execution-trace.v1' as const
export const GAL_TRACE_CALIBRATION_SCHEMA_VERSION = 'gal.trace-calibration.v1' as const
export const GAL_GITHUB_DEPENDENCY_SOURCE_SCHEMA_VERSION = 'gal.github-dependency-source.v1' as const
export const GAL_PREDICTION_BURST_READINESS_SCHEMA_VERSION = 'gal.prediction-burst-readiness.v1' as const
export const GAL_PREDICTION_MODEL_FIT_SCHEMA_VERSION = 'gal.prediction-model-fit.v1' as const

export const GAL_PREDICTION_TASK_KINDS = [
  'coding',
  'review',
  'ci_cd',
  'release',
  'research',
  'browser',
  'repo_triage',
  'planning',
  'other',
] as const

export type GalPredictionTaskKind = (typeof GAL_PREDICTION_TASK_KINDS)[number]

export const GAL_PREDICTION_TOOL_KINDS = [
  'shell',
  'github',
  'browser',
  'ci',
  'deploy',
  'release',
  'filesystem',
  'network',
  'human',
  'other',
] as const

export type GalPredictionToolKind = (typeof GAL_PREDICTION_TOOL_KINDS)[number]

export const GAL_PREDICTION_BLOCKER_KINDS = [
  'none',
  'dependency',
  'ci',
  'review',
  'deployment',
  'release',
  'human',
  'external_service',
] as const

export type GalPredictionBlockerKind = (typeof GAL_PREDICTION_BLOCKER_KINDS)[number]

export const GAL_PREDICTION_CAPACITY_ACTIONS = ['scale_up', 'hold', 'drain', 'route_serverless', 'shutdown'] as const

export type GalPredictionCapacityAction = (typeof GAL_PREDICTION_CAPACITY_ACTIONS)[number]

export const GAL_PREDICTION_CLUSTER_PROVIDER_STATUSES = [
  'starting',
  'running',
  'draining',
  'stopped',
  'error',
] as const

export type GalPredictionClusterProviderStatus = (typeof GAL_PREDICTION_CLUSTER_PROVIDER_STATUSES)[number]

export const GAL_PREDICTION_EXECUTOR_BACKENDS = [
  'gal_agents',
  'codex',
  'kimi_k2_6',
  'openai',
  'local_worker',
  'other',
] as const

export type GalPredictionExecutorBackend = (typeof GAL_PREDICTION_EXECUTOR_BACKENDS)[number]

export const GAL_PREDICTION_EXECUTOR_MODES = [
  'model_single',
  'model_agent',
  'model_agent_swarm',
  'gal_managed_swarm',
  'local_worker',
  'external_service',
] as const

export type GalPredictionExecutorMode = (typeof GAL_PREDICTION_EXECUTOR_MODES)[number]

export const GAL_PREDICTION_SANDBOX_ISOLATION_LEVELS = [
  'none',
  'process',
  'container',
  'microvm',
  'hosted_external',
] as const

export type GalPredictionSandboxIsolationLevel = (typeof GAL_PREDICTION_SANDBOX_ISOLATION_LEVELS)[number]

export interface GalPredictionToolProfile {
  toolKind: GalPredictionToolKind
  expectedCalls: number
  expectedWallClockMinutes: number
  blockingProbability: number
}

export interface GalPredictionCiProfile {
  workflowName: string
  expectedRuntimeMinutes: number
  expectedQueueMinutes: number
  failureProbability: number
  rerunProbability: number
}

export interface GalPredictionTraceTokenUsage {
  inputTokens: number
  outputTokens: number
  reasoningTokens: number
}

export interface GalPredictionTraceToolUsage {
  toolKind: GalPredictionToolKind
  calls: number
  wallClockMinutes: number
  blocked: boolean
}

export interface GalPredictionTraceCiUsage {
  workflowName: string
  runtimeMinutes: number
  queueMinutes: number
  reruns: number
  failed: boolean
}

export interface GalPredictionExecutionTrace {
  schemaVersion: typeof GAL_EXECUTION_TRACE_SCHEMA_VERSION
  traceId: string
  taskId: string
  taskKind: GalPredictionTaskKind
  repository?: string
  startedAt: string
  finishedAt: string
  tokenUsage: GalPredictionTraceTokenUsage
  toolUsage: GalPredictionTraceToolUsage[]
  ciUsage?: GalPredictionTraceCiUsage[]
  blockerKind?: GalPredictionBlockerKind
  completed: boolean
}

export interface GalPredictionTraceCalibration {
  schemaVersion: typeof GAL_TRACE_CALIBRATION_SCHEMA_VERSION
  traceCount: number
  taskKind: GalPredictionTaskKind
  repository?: string
  avgInputTokens: number
  avgOutputTokens: number
  avgReasoningTokens: number
  avgBaseExecutionMinutes: number
  avgToolCallsByKind: Partial<Record<GalPredictionToolKind, number>>
  avgToolMinutesByKind: Partial<Record<GalPredictionToolKind, number>>
  avgCiRuntimeMinutesByWorkflow: Record<string, number>
  avgCiQueueMinutesByWorkflow: Record<string, number>
  ciFailureProbabilityByWorkflow: Record<string, number>
  ciRerunProbabilityByWorkflow: Record<string, number>
  blockerProbabilityByKind: Partial<Record<GalPredictionBlockerKind, number>>
  generatedAt: string
}

export interface GalPredictionGitHubDependencyNode {
  id: string
  repository: string
  title: string
  kind: 'issue' | 'pull_request' | 'workflow_check' | 'release' | 'deployment_gate' | 'external_service'
  state: 'open' | 'queued' | 'in_progress' | 'blocked' | 'failed' | 'success' | 'closed'
  dependsOn: string[]
  url?: string
  labels?: string[]
  requiredReviewers?: number
  failingChecks?: string[]
  pendingChecks?: string[]
  deploymentEnvironment?: string
  externalService?: string
}

export interface GalPredictionGitHubDependencySource {
  schemaVersion: typeof GAL_GITHUB_DEPENDENCY_SOURCE_SCHEMA_VERSION
  sourceId: string
  nodes: GalPredictionGitHubDependencyNode[]
}

export interface GalPredictionGitHubDependencyOptions {
  requestId: string
  horizonMinutes: number
  maxWorkers: number
  workerStartupMinutes: number
  targetUtilization: number
  defaultTokenEstimate?: number
  defaultExecutionMinutes?: number
}

export interface GalPredictionSandboxRequirements {
  isolationLevel: GalPredictionSandboxIsolationLevel
  allowedRepos: string[]
  allowedSecrets: string[]
  allowedNetworks: string[]
  allowedTools: string[]
  requiresFilesystem: boolean
  requiresNetwork: boolean
  requiresGpu: boolean
  allowDeployments: boolean
  minCpuCores?: number
  minMemoryGb?: number
  minDiskGb?: number
}

export interface GalPredictionExecutionRequirements {
  backend: GalPredictionExecutorBackend
  mode: GalPredictionExecutorMode
  modelId?: string
  provider?: string
  estimatedConcurrentAgents: number
  maxSubAgents?: number
  toolCallBudget?: number
  requiresHostedRuntime: boolean
  sandbox: GalPredictionSandboxRequirements
}

export interface GalPredictionModelThroughputProfile {
  id: string
  modelId: string
  provider: string
  gpuType: string
  gpuCount: number
  maxContextTokens: number
  maxConcurrentRequests: number
  prefillTokensPerSecond: number
  decodeTokensPerSecond: number
  reasoningTokensPerSecond?: number
  coldStartSeconds: number
  drainSeconds: number
  shutdownSeconds: number
  minBillableSeconds: number
  hourlyCostUsd?: number
  imageRef?: string
  imagePullSeconds?: number
  modelCacheMode?: 'none' | 'prebaked' | 'hydrate_on_startup' | 'pull_through'
  modelCacheHitProbability?: number
  modelHydrationSeconds?: number
  startupBudgetSeconds?: number
}

export type GalPredictionModelQualityTier = 'smoke' | 'small' | 'standard' | 'frontier' | 'specialized'

export interface GalPredictionModelCapabilityProfile {
  id: string
  modelId: string
  qualityTier: GalPredictionModelQualityTier
  recommendedGate?: 'provider_startup_smoke' | 'tool_calling_smoke' | 'coding_smoke' | 'agent_quality' | 'release_execution'
  maxContextTokens: number
  maxTaskTokens: number
  maxToolCalls: number
  supportsToolCalling?: boolean
  supportsCodeEditing: boolean
  supportsCiDebugging: boolean
  supportsReleaseWork: boolean
  supportsLongHorizonPlanning: boolean
  supportsAutonomousExecution: boolean
}

export interface GalPredictionTokenCapacityForecast {
  profileId: string
  modelId: string
  provider: string
  gpuType: string
  gpuCount: number
  expectedPrefillSeconds: number
  expectedDecodeSeconds: number
  expectedReasoningSeconds: number
  expectedRuntimeMinutes: number
  maxContextTokens: number
  maxConcurrentRequests: number
  contextFits: boolean
}

export interface GalPredictionClusterCapacityForecast {
  profileId: string
  modelId: string
  provider: string
  gpuType: string
  gpuCount: number
  expectedRuntimeMinutes: number
  plannedClusterMinutes: number
  billableClusterMinutes: number
  expectedStartupSeconds: number
  expectedTokenUtilization: number
  contextFits: boolean
  projectedCostUsd?: number
}

export interface GalPredictionServerlessFallbackPolicy {
  enabled: boolean
  endpointId: string
  switchBelowUtilization: number
  minSustainSeconds: number
}

export interface GalPredictionClusterRuntimeSnapshot {
  profileId: string
  observedAt: string
  activeWorkers: number
  busyWorkers: number
  idleWorkers: number
  queuedRequests: number
  runningRequests: number
  inputTokensPerSecond: number
  outputTokensPerSecond: number
  reasoningTokensPerSecond?: number
  gpuUtilizationRatio: number
  gpuMemoryUtilizationRatio: number
  queueWaitSeconds: number
  providerStatus?: GalPredictionClusterProviderStatus
}

export interface GalPredictionClusterUtilization {
  profileId: string
  observedAt: string
  effectiveUtilization: number
  tokenThroughputUtilization: number
  workerUtilization: number
  gpuUtilization: number
  memoryUtilization: number
  queuePressure: number
  queueWaitSeconds: number
  action: GalPredictionCapacityAction
  reason: string
}

export interface GalPredictionTaskInput {
  id: string
  title: string
  kind: GalPredictionTaskKind
  priority: number
  dependsOn: string[]
  expectedInputTokens: number
  expectedOutputTokens: number
  expectedReasoningTokens: number
  baseExecutionMinutes: number
  toolProfiles: GalPredictionToolProfile[]
  ciProfiles?: GalPredictionCiProfile[]
  blockerKind?: GalPredictionBlockerKind
  canRunInParallel: boolean
  requiredAgentCapabilities: string[]
  executionRequirements?: GalPredictionExecutionRequirements
  repository?: string
}

export interface GalPredictionRequest {
  schemaVersion: typeof GAL_PREDICTION_REQUEST_SCHEMA_VERSION
  requestId: string
  horizonMinutes: number
  maxWorkers: number
  workerStartupMinutes: number
  targetUtilization: number
  serverlessFallback?: GalPredictionServerlessFallbackPolicy
  throughputProfiles?: GalPredictionModelThroughputProfile[]
  tasks: GalPredictionTaskInput[]
}

export interface GalPredictionTaskForecast {
  taskId: string
  title: string
  kind: GalPredictionTaskKind
  repository?: string
  expectedTokens: number
  expectedToolCalls: number
  expectedCiMinutes: number
  expectedToolMinutes: number
  expectedWallClockMinutes: number
  blockingProbability: number
  criticalPathMinutes: number
  canRunInParallel: boolean
  dependsOn: string[]
  requiredAgentCapabilities: string[]
  executionRequirements: GalPredictionExecutionRequirements
  tokenCapacity?: GalPredictionTokenCapacityForecast
}

export interface GalPredictionCapacityRecommendation {
  action: GalPredictionCapacityAction
  recommendedWorkers: number
  expectedUtilization: number
  expectedUsefulWorkerMinutes: number
  expectedWastedWorkerMinutes: number
  reason: string
  clusterCapacity?: GalPredictionClusterCapacityForecast
}

export interface GalExecutionForecast {
  schemaVersion: typeof GAL_EXECUTION_FORECAST_SCHEMA_VERSION
  requestId: string
  horizonMinutes: number
  expectedTokens: number
  expectedToolCalls: number
  expectedCiMinutes: number
  expectedWallClockMinutes: number
  criticalPathMinutes: number
  parallelizableTaskIds: string[]
  ciBoundTaskIds: string[]
  blockedTaskIds: string[]
  criticalPathTaskIds: string[]
  taskForecasts: GalPredictionTaskForecast[]
  capacity: GalPredictionCapacityRecommendation
  dependencyMap: Record<string, string[]>
  confidence: number
  generatedAt: string
}

export type GalPredictionReadinessSeverity = 'blocker' | 'warning'

export interface GalPredictionReadinessCheck {
  id: string
  title: string
  severity: GalPredictionReadinessSeverity
  passed: boolean
  reason: string
}

export interface GalPredictionBurstReadinessOptions {
  minConfidence?: number
  maxBlockedTaskRatio?: number
  minRunnableTasks?: number
  maxClusterCostUsd?: number
  maxBillableClusterMinutes?: number
  requireClusterCapacity?: boolean
  requireContextFit?: boolean
}

export interface GalPredictionBurstReadiness {
  schemaVersion: typeof GAL_PREDICTION_BURST_READINESS_SCHEMA_VERSION
  requestId: string
  ready: boolean
  blockerCount: number
  warningCount: number
  runnableTaskCount: number
  blockedTaskCount: number
  checks: GalPredictionReadinessCheck[]
}

export interface GalPredictionTaskModelFit {
  taskId: string
  canSolve: boolean
  canSmokeTest: boolean
  reason: string
}

export interface GalPredictionModelFit {
  schemaVersion: typeof GAL_PREDICTION_MODEL_FIT_SCHEMA_VERSION
  modelProfileId: string
  modelId: string
  totalTasks: number
  solvableTasks: number
  smokeTestableTasks: number
  taskFits: GalPredictionTaskModelFit[]
}

export interface GalPredictionOptions {
  now?: () => string
  minScaleUpUtilization?: number
  shutdownUtilizationThreshold?: number
  confidencePenaltyPerBlocker?: number
  confidencePenaltyPerHighVarianceTask?: number
}

export interface GalPredictionClusterUtilizationOptions {
  minScaleUpUtilization?: number
  shutdownUtilizationThreshold?: number
  serverlessFallback?: GalPredictionServerlessFallbackPolicy
  queuePressureScaleUpThreshold?: number
  memoryPressureScaleUpThreshold?: number
}

export interface GalPredictionCalibrationOptions {
  now?: () => string
  taskKind?: GalPredictionTaskKind
  repository?: string
}

export function buildGalPredictionRequestFromGitHubDependencies(
  source: GalPredictionGitHubDependencySource,
  options: GalPredictionGitHubDependencyOptions,
): GalPredictionRequest {
  validateGalPredictionGitHubDependencySource(source)

  return {
    schemaVersion: GAL_PREDICTION_REQUEST_SCHEMA_VERSION,
    requestId: options.requestId,
    horizonMinutes: options.horizonMinutes,
    maxWorkers: options.maxWorkers,
    workerStartupMinutes: options.workerStartupMinutes,
    targetUtilization: options.targetUtilization,
    tasks: source.nodes.map((node) => buildTaskFromGitHubNode(node, options)),
  }
}

export function buildKimiK26AgentSwarmExecutionRequirements(
  overrides: Partial<GalPredictionExecutionRequirements> = {},
): GalPredictionExecutionRequirements {
  const sandbox = {
    isolationLevel: 'hosted_external',
    allowedRepos: [],
    allowedSecrets: [],
    allowedNetworks: ['kimi.com', 'api.moonshot.ai'],
    allowedTools: ['kimi-agent-swarm'],
    requiresFilesystem: false,
    requiresNetwork: true,
    requiresGpu: false,
    allowDeployments: false,
    ...overrides.sandbox,
  } satisfies GalPredictionSandboxRequirements

  return {
    backend: 'kimi_k2_6',
    mode: 'model_agent_swarm',
    modelId: 'kimi-k2.6',
    provider: 'moonshot',
    estimatedConcurrentAgents: 8,
    maxSubAgents: 300,
    toolCallBudget: 4_000,
    requiresHostedRuntime: true,
    ...overrides,
    sandbox,
  }
}

export function defaultGalPredictionPreflightModelCapabilityProfiles(): GalPredictionModelCapabilityProfile[] {
  return [
    {
      id: 'gcp-l4-spot-glm-4-9b-tool-call-smoke',
      modelId: 'zai-org/glm-4-9b-chat-hf',
      qualityTier: 'smoke',
      recommendedGate: 'tool_calling_smoke',
      maxContextTokens: 128_000,
      maxTaskTokens: 24_000,
      maxToolCalls: 24,
      supportsToolCalling: true,
      supportsCodeEditing: false,
      supportsCiDebugging: false,
      supportsReleaseWork: false,
      supportsLongHorizonPlanning: false,
      supportsAutonomousExecution: false,
    },
    {
      id: 'gcp-l4-spot-qwen2-5-coder-7b-coding-smoke',
      modelId: 'Qwen/Qwen2.5-Coder-7B-Instruct',
      qualityTier: 'smoke',
      recommendedGate: 'coding_smoke',
      maxContextTokens: 32_768,
      maxTaskTokens: 20_000,
      maxToolCalls: 0,
      supportsToolCalling: false,
      supportsCodeEditing: true,
      supportsCiDebugging: false,
      supportsReleaseWork: false,
      supportsLongHorizonPlanning: false,
      supportsAutonomousExecution: false,
    },
  ]
}

export function defaultGalPredictionPreflightThroughputProfiles(): GalPredictionModelThroughputProfile[] {
  const gcpL4SpotHourlyCostUsd = 0.282

  return [
    {
      id: 'gcp-l4-spot-glm-4-9b-tool-call-smoke',
      modelId: 'zai-org/glm-4-9b-chat-hf',
      provider: 'gcp',
      gpuType: 'NVIDIA L4',
      gpuCount: 1,
      maxContextTokens: 128_000,
      maxConcurrentRequests: 2,
      prefillTokensPerSecond: 2_000,
      decodeTokensPerSecond: 80,
      reasoningTokensPerSecond: 80,
      coldStartSeconds: 240,
      imageRef: 'us-docker.pkg.dev/gal-run/gal-swarm-preflight/vllm-openai:latest',
      imagePullSeconds: 45,
      modelCacheMode: 'hydrate_on_startup',
      modelCacheHitProbability: 0.85,
      modelHydrationSeconds: 420,
      startupBudgetSeconds: 600,
      drainSeconds: 60,
      shutdownSeconds: 60,
      minBillableSeconds: 60,
      hourlyCostUsd: gcpL4SpotHourlyCostUsd,
    },
    {
      id: 'gcp-l4-spot-qwen2-5-coder-7b-coding-smoke',
      modelId: 'Qwen/Qwen2.5-Coder-7B-Instruct',
      provider: 'gcp',
      gpuType: 'NVIDIA L4',
      gpuCount: 1,
      maxContextTokens: 32_768,
      maxConcurrentRequests: 2,
      prefillTokensPerSecond: 2_500,
      decodeTokensPerSecond: 90,
      reasoningTokensPerSecond: 90,
      coldStartSeconds: 240,
      imageRef: 'us-docker.pkg.dev/gal-run/gal-swarm-preflight/vllm-openai:latest',
      imagePullSeconds: 45,
      modelCacheMode: 'hydrate_on_startup',
      modelCacheHitProbability: 0.85,
      modelHydrationSeconds: 360,
      startupBudgetSeconds: 600,
      drainSeconds: 60,
      shutdownSeconds: 60,
      minBillableSeconds: 60,
      hourlyCostUsd: gcpL4SpotHourlyCostUsd,
    },
  ]
}

export function forecastGalExecution(
  request: GalPredictionRequest,
  options: GalPredictionOptions = {},
): GalExecutionForecast {
  validateGalPredictionRequest(request)

  const now = options.now ?? (() => new Date().toISOString())
  const taskForecasts = buildTaskForecasts(request)
  const dependencyMap = Object.fromEntries(request.tasks.map((task) => [task.id, [...task.dependsOn]]))
  const criticalPathTaskIds = findCriticalPath(taskForecasts)
  const expectedTokens = sum(taskForecasts.map((task) => task.expectedTokens))
  const expectedToolCalls = sum(taskForecasts.map((task) => task.expectedToolCalls))
  const expectedCiMinutes = sum(taskForecasts.map((task) => task.expectedCiMinutes))
  const expectedWallClockMinutes = Math.max(...taskForecasts.map((task) => task.criticalPathMinutes), 0)
  const parallelizableTaskIds = taskForecasts
    .filter((task) => task.canRunInParallel && task.blockingProbability < 0.75)
    .map((task) => task.taskId)
  const ciBoundTaskIds = taskForecasts.filter((task) => task.expectedCiMinutes > 0).map((task) => task.taskId)
  const blockedTaskIds = taskForecasts.filter((task) => task.blockingProbability >= 0.75).map((task) => task.taskId)
  const capacity = recommendCapacity(request, taskForecasts, expectedWallClockMinutes, options)
  const confidence = calculateConfidence(taskForecasts, options)

  return {
    schemaVersion: GAL_EXECUTION_FORECAST_SCHEMA_VERSION,
    requestId: request.requestId,
    horizonMinutes: request.horizonMinutes,
    expectedTokens,
    expectedToolCalls,
    expectedCiMinutes,
    expectedWallClockMinutes,
    criticalPathMinutes: expectedWallClockMinutes,
    parallelizableTaskIds,
    ciBoundTaskIds,
    blockedTaskIds,
    criticalPathTaskIds,
    taskForecasts,
    capacity,
    dependencyMap,
    confidence,
    generatedAt: now(),
  }
}

export function evaluateGalPredictionBurstReadiness(
  forecast: GalExecutionForecast,
  options: GalPredictionBurstReadinessOptions = {},
): GalPredictionBurstReadiness {
  const minConfidence = options.minConfidence ?? 0.35
  const maxBlockedTaskRatio = options.maxBlockedTaskRatio ?? 0.2
  const minRunnableTasks = options.minRunnableTasks ?? 1
  const requireClusterCapacity = options.requireClusterCapacity ?? true
  const requireContextFit = options.requireContextFit ?? true
  const blockedTaskCount = forecast.blockedTaskIds.length
  const runnableTaskCount = forecast.taskForecasts.length - blockedTaskCount
  const blockedTaskRatio = forecast.taskForecasts.length === 0 ? 0 : blockedTaskCount / forecast.taskForecasts.length
  const clusterCapacity = forecast.capacity.clusterCapacity

  const checks: GalPredictionReadinessCheck[] = [
    readinessCheck(
      'forecast-has-tasks',
      'Forecast contains tasks',
      'blocker',
      forecast.taskForecasts.length > 0,
      `${forecast.taskForecasts.length} tasks are forecast.`,
    ),
    readinessCheck(
      'runnable-work-present',
      'Runnable work is present',
      'blocker',
      runnableTaskCount >= minRunnableTasks,
      `${runnableTaskCount} runnable tasks are available; minimum is ${minRunnableTasks}.`,
    ),
    readinessCheck(
      'blocked-ratio-safe',
      'Blocked task ratio is safe',
      'blocker',
      blockedTaskRatio <= maxBlockedTaskRatio,
      `${round(blockedTaskRatio, 4)} blocked ratio; maximum is ${maxBlockedTaskRatio}.`,
    ),
    readinessCheck(
      'confidence-above-threshold',
      'Forecast confidence is high enough',
      'blocker',
      forecast.confidence >= minConfidence,
      `Forecast confidence is ${forecast.confidence}; minimum is ${minConfidence}.`,
    ),
    readinessCheck(
      'capacity-recommends-start',
      'Capacity recommendation supports startup',
      'blocker',
      forecast.capacity.action === 'scale_up' || forecast.capacity.action === 'hold',
      `Capacity action is ${forecast.capacity.action}.`,
    ),
    readinessCheck(
      'cluster-capacity-present',
      'Cluster capacity forecast is present',
      'blocker',
      !requireClusterCapacity || Boolean(clusterCapacity),
      clusterCapacity ? `Cluster profile is ${clusterCapacity.profileId}.` : 'No cluster capacity forecast is available.',
    ),
    readinessCheck(
      'cluster-context-fits',
      'Tasks fit model context',
      'blocker',
      !requireContextFit || clusterCapacity?.contextFits === true,
      clusterCapacity ? `contextFits is ${clusterCapacity.contextFits}.` : 'No cluster capacity forecast is available.',
    ),
    readinessCheck(
      'cluster-cost-within-cap',
      'Projected cluster cost is capped',
      'blocker',
      options.maxClusterCostUsd === undefined ||
        clusterCapacity?.projectedCostUsd === undefined ||
        clusterCapacity.projectedCostUsd <= options.maxClusterCostUsd,
      clusterCapacity?.projectedCostUsd === undefined
        ? 'Projected cost is unavailable.'
        : `Projected cluster cost is $${clusterCapacity.projectedCostUsd}; cap is $${options.maxClusterCostUsd}.`,
    ),
    readinessCheck(
      'billable-minutes-within-cap',
      'Billable cluster minutes are capped',
      'blocker',
      options.maxBillableClusterMinutes === undefined ||
        clusterCapacity === undefined ||
        clusterCapacity.billableClusterMinutes <= options.maxBillableClusterMinutes,
      clusterCapacity
        ? `Billable cluster minutes are ${clusterCapacity.billableClusterMinutes}; cap is ${options.maxBillableClusterMinutes}.`
        : 'No cluster capacity forecast is available.',
    ),
    readinessCheck(
      'parallelism-available',
      'Parallel runnable work exists',
      'warning',
      forecast.parallelizableTaskIds.length > 0,
      `${forecast.parallelizableTaskIds.length} tasks are parallelizable.`,
    ),
    readinessCheck(
      'ci-wait-not-empty',
      'CI/wait work is visible',
      'warning',
      forecast.expectedCiMinutes >= 0,
      `${forecast.expectedCiMinutes} CI minutes are forecast.`,
    ),
    readinessCheck(
      'critical-path-visible',
      'Critical path is visible',
      'warning',
      forecast.criticalPathTaskIds.length > 0,
      `${forecast.criticalPathTaskIds.length} tasks are on the critical path.`,
    ),
  ]

  const blockerCount = checks.filter((entry) => entry.severity === 'blocker' && !entry.passed).length
  const warningCount = checks.filter((entry) => entry.severity === 'warning' && !entry.passed).length

  return {
    schemaVersion: GAL_PREDICTION_BURST_READINESS_SCHEMA_VERSION,
    requestId: forecast.requestId,
    ready: blockerCount === 0,
    blockerCount,
    warningCount,
    runnableTaskCount,
    blockedTaskCount,
    checks,
  }
}

export function evaluateGalPredictionModelFit(
  forecast: GalExecutionForecast,
  model: GalPredictionModelCapabilityProfile,
): GalPredictionModelFit {
  validateModelCapabilityProfile(model)

  const taskFits = forecast.taskForecasts.map((task): GalPredictionTaskModelFit => {
    const tokensFit = task.expectedTokens <= model.maxTaskTokens && task.expectedTokens <= model.maxContextTokens
    const supportsToolCalling = model.supportsToolCalling ?? model.maxToolCalls > 0
    const toolsFit = task.expectedToolCalls === 0 || (supportsToolCalling && task.expectedToolCalls <= model.maxToolCalls)
    const codeFit = task.kind !== 'coding' || model.supportsCodeEditing
    const ciFit = task.kind !== 'ci_cd' || model.supportsCiDebugging
    const releaseFit = task.kind !== 'release' || model.supportsReleaseWork
    const planningFit = task.kind !== 'planning' || model.supportsLongHorizonPlanning
    const autonomyFit = !task.canRunInParallel || model.supportsAutonomousExecution || model.qualityTier !== 'smoke'
    const canSolve = tokensFit && toolsFit && codeFit && ciFit && releaseFit && planningFit && autonomyFit
    const canSmokeTest =
      task.expectedTokens <= model.maxContextTokens &&
      (task.expectedToolCalls === 0 || (supportsToolCalling && task.expectedToolCalls <= model.maxToolCalls)) &&
      task.blockingProbability < 0.75

    return {
      taskId: task.taskId,
      canSolve,
      canSmokeTest,
      reason: canSolve
        ? 'Model capability profile fits task requirements.'
        : explainModelFitFailure({
            tokensFit,
            toolsFit,
            codeFit,
            ciFit,
            releaseFit,
            planningFit,
            autonomyFit,
          }),
    }
  })

  return {
    schemaVersion: GAL_PREDICTION_MODEL_FIT_SCHEMA_VERSION,
    modelProfileId: model.id,
    modelId: model.modelId,
    totalTasks: taskFits.length,
    solvableTasks: taskFits.filter((task) => task.canSolve).length,
    smokeTestableTasks: taskFits.filter((task) => task.canSmokeTest).length,
    taskFits,
  }
}

export function calibrateGalPredictionFromTraces(
  traces: GalPredictionExecutionTrace[],
  options: GalPredictionCalibrationOptions = {},
): GalPredictionTraceCalibration {
  validateGalPredictionTraces(traces)

  const now = options.now ?? (() => new Date().toISOString())
  const filtered = traces.filter(
    (trace) =>
      (!options.taskKind || trace.taskKind === options.taskKind) &&
      (!options.repository || trace.repository === options.repository),
  )
  const taskKind = options.taskKind ?? filtered[0]?.taskKind ?? 'other'
  const repository = options.repository

  return {
    schemaVersion: GAL_TRACE_CALIBRATION_SCHEMA_VERSION,
    traceCount: filtered.length,
    taskKind,
    repository,
    avgInputTokens: average(filtered.map((trace) => trace.tokenUsage.inputTokens)),
    avgOutputTokens: average(filtered.map((trace) => trace.tokenUsage.outputTokens)),
    avgReasoningTokens: average(filtered.map((trace) => trace.tokenUsage.reasoningTokens)),
    avgBaseExecutionMinutes: average(filtered.map(calculateTraceWallClockMinutes)),
    avgToolCallsByKind: averageToolUsage(filtered, 'calls'),
    avgToolMinutesByKind: averageToolUsage(filtered, 'wallClockMinutes'),
    avgCiRuntimeMinutesByWorkflow: averageCiUsage(filtered, 'runtimeMinutes'),
    avgCiQueueMinutesByWorkflow: averageCiUsage(filtered, 'queueMinutes'),
    ciFailureProbabilityByWorkflow: probabilityByWorkflow(filtered, 'failed'),
    ciRerunProbabilityByWorkflow: rerunProbabilityByWorkflow(filtered),
    blockerProbabilityByKind: blockerProbabilityByKind(filtered),
    generatedAt: now(),
  }
}

export function applyGalPredictionCalibration(
  task: GalPredictionTaskInput,
  calibration: GalPredictionTraceCalibration,
): GalPredictionTaskInput {
  if (calibration.traceCount === 0) return { ...task }

  return {
    ...task,
    expectedInputTokens: round(calibration.avgInputTokens),
    expectedOutputTokens: round(calibration.avgOutputTokens),
    expectedReasoningTokens: round(calibration.avgReasoningTokens),
    baseExecutionMinutes: round(calibration.avgBaseExecutionMinutes, 2),
    toolProfiles: task.toolProfiles.map((tool) => ({
      ...tool,
      expectedCalls: round(calibration.avgToolCallsByKind[tool.toolKind] ?? tool.expectedCalls, 2),
      expectedWallClockMinutes: round(calibration.avgToolMinutesByKind[tool.toolKind] ?? tool.expectedWallClockMinutes, 2),
    })),
    ciProfiles: task.ciProfiles?.map((ci) => ({
      ...ci,
      expectedRuntimeMinutes: round(calibration.avgCiRuntimeMinutesByWorkflow[ci.workflowName] ?? ci.expectedRuntimeMinutes, 2),
      expectedQueueMinutes: round(calibration.avgCiQueueMinutesByWorkflow[ci.workflowName] ?? ci.expectedQueueMinutes, 2),
      failureProbability: round(
        calibration.ciFailureProbabilityByWorkflow[ci.workflowName] ?? ci.failureProbability,
        4,
      ),
      rerunProbability: round(calibration.ciRerunProbabilityByWorkflow[ci.workflowName] ?? ci.rerunProbability, 4),
    })),
  }
}

export function calculateGalPredictionClusterUtilization(
  snapshot: GalPredictionClusterRuntimeSnapshot,
  profile: GalPredictionModelThroughputProfile,
  options: GalPredictionClusterUtilizationOptions = {},
): GalPredictionClusterUtilization {
  validateThroughputProfile(profile)
  validateClusterRuntimeSnapshot(snapshot)
  if (snapshot.profileId !== profile.id) {
    throw new Error(`Runtime snapshot profileId ${snapshot.profileId} does not match throughput profile ${profile.id}.`)
  }

  const decodeCapacity = profile.decodeTokensPerSecond + (profile.reasoningTokensPerSecond ?? profile.decodeTokensPerSecond)
  const observedDecodeTokensPerSecond = snapshot.outputTokensPerSecond + (snapshot.reasoningTokensPerSecond ?? 0)
  const tokenThroughputUtilization = clampRatio(
    Math.max(snapshot.inputTokensPerSecond / profile.prefillTokensPerSecond, observedDecodeTokensPerSecond / decodeCapacity),
  )
  const workerUtilization =
    snapshot.activeWorkers === 0 ? 0 : clampRatio(snapshot.busyWorkers / Math.max(snapshot.activeWorkers, 1))
  const queuePressure = clampRatio(
    snapshot.queuedRequests / Math.max(snapshot.queuedRequests + snapshot.runningRequests + profile.maxConcurrentRequests, 1),
  )
  const gpuUtilization = clampRatio(snapshot.gpuUtilizationRatio)
  const memoryUtilization = clampRatio(snapshot.gpuMemoryUtilizationRatio)
  const effectiveUtilization = clampRatio(
    Math.max(tokenThroughputUtilization, workerUtilization, gpuUtilization, memoryUtilization * 0.9, queuePressure),
  )
  const minScaleUpUtilization = options.minScaleUpUtilization ?? 0.75
  const shutdownUtilizationThreshold = options.shutdownUtilizationThreshold ?? 0.12
  const serverlessSwitchThreshold = options.serverlessFallback?.enabled
    ? options.serverlessFallback.switchBelowUtilization
    : undefined
  const queuePressureScaleUpThreshold = options.queuePressureScaleUpThreshold ?? 0.35
  const memoryPressureScaleUpThreshold = options.memoryPressureScaleUpThreshold ?? 0.92

  if (snapshot.providerStatus === 'error' || snapshot.providerStatus === 'stopped') {
    return {
      profileId: snapshot.profileId,
      observedAt: snapshot.observedAt,
      effectiveUtilization: round(effectiveUtilization, 4),
      tokenThroughputUtilization: round(tokenThroughputUtilization, 4),
      workerUtilization: round(workerUtilization, 4),
      gpuUtilization: round(gpuUtilization, 4),
      memoryUtilization: round(memoryUtilization, 4),
      queuePressure: round(queuePressure, 4),
      queueWaitSeconds: round(snapshot.queueWaitSeconds, 2),
      action: 'shutdown',
      reason: 'Provider reports the cluster is stopped or unhealthy.',
    }
  }

  if (
    effectiveUtilization >= minScaleUpUtilization ||
    queuePressure >= queuePressureScaleUpThreshold ||
    memoryUtilization >= memoryPressureScaleUpThreshold
  ) {
    return {
      profileId: snapshot.profileId,
      observedAt: snapshot.observedAt,
      effectiveUtilization: round(effectiveUtilization, 4),
      tokenThroughputUtilization: round(tokenThroughputUtilization, 4),
      workerUtilization: round(workerUtilization, 4),
      gpuUtilization: round(gpuUtilization, 4),
      memoryUtilization: round(memoryUtilization, 4),
      queuePressure: round(queuePressure, 4),
      queueWaitSeconds: round(snapshot.queueWaitSeconds, 2),
      action: 'scale_up',
      reason: 'Observed token throughput, worker pressure, GPU pressure, or queue pressure is above the scale-up threshold.',
    }
  }

  if (
    effectiveUtilization <= shutdownUtilizationThreshold &&
    snapshot.queuedRequests === 0 &&
    snapshot.runningRequests === 0 &&
    snapshot.providerStatus !== 'starting'
  ) {
    return {
      profileId: snapshot.profileId,
      observedAt: snapshot.observedAt,
      effectiveUtilization: round(effectiveUtilization, 4),
      tokenThroughputUtilization: round(tokenThroughputUtilization, 4),
      workerUtilization: round(workerUtilization, 4),
      gpuUtilization: round(gpuUtilization, 4),
      memoryUtilization: round(memoryUtilization, 4),
      queuePressure: round(queuePressure, 4),
      queueWaitSeconds: round(snapshot.queueWaitSeconds, 2),
      action: 'shutdown',
      reason: 'No queued or running work remains and observed utilization is below the shutdown threshold.',
    }
  }

  if (effectiveUtilization < shutdownUtilizationThreshold * 2 && snapshot.queuedRequests === 0) {
    return {
      profileId: snapshot.profileId,
      observedAt: snapshot.observedAt,
      effectiveUtilization: round(effectiveUtilization, 4),
      tokenThroughputUtilization: round(tokenThroughputUtilization, 4),
      workerUtilization: round(workerUtilization, 4),
      gpuUtilization: round(gpuUtilization, 4),
      memoryUtilization: round(memoryUtilization, 4),
      queuePressure: round(queuePressure, 4),
      queueWaitSeconds: round(snapshot.queueWaitSeconds, 2),
      action: 'drain',
      reason: 'Observed utilization is low and there is no queued work, so the cluster should stop accepting new work.',
    }
  }

  if (
    serverlessSwitchThreshold !== undefined &&
    effectiveUtilization <= serverlessSwitchThreshold &&
    snapshot.providerStatus !== 'starting'
  ) {
    return {
      profileId: snapshot.profileId,
      observedAt: snapshot.observedAt,
      effectiveUtilization: round(effectiveUtilization, 4),
      tokenThroughputUtilization: round(tokenThroughputUtilization, 4),
      workerUtilization: round(workerUtilization, 4),
      gpuUtilization: round(gpuUtilization, 4),
      memoryUtilization: round(memoryUtilization, 4),
      queuePressure: round(queuePressure, 4),
      queueWaitSeconds: round(snapshot.queueWaitSeconds, 2),
      action: 'route_serverless',
      reason: 'Observed self-hosted utilization is below the serverless fallback threshold.',
    }
  }

  return {
    profileId: snapshot.profileId,
    observedAt: snapshot.observedAt,
    effectiveUtilization: round(effectiveUtilization, 4),
    tokenThroughputUtilization: round(tokenThroughputUtilization, 4),
    workerUtilization: round(workerUtilization, 4),
    gpuUtilization: round(gpuUtilization, 4),
    memoryUtilization: round(memoryUtilization, 4),
    queuePressure: round(queuePressure, 4),
    queueWaitSeconds: round(snapshot.queueWaitSeconds, 2),
    action: 'hold',
    reason: 'Observed utilization is inside the hold band.',
  }
}

export function validateGalPredictionRequest(request: GalPredictionRequest): void {
  if (request.schemaVersion !== GAL_PREDICTION_REQUEST_SCHEMA_VERSION) {
    throw new Error(`Unsupported prediction request schema version: ${request.schemaVersion}`)
  }
  if (request.horizonMinutes <= 0) throw new Error('horizonMinutes must be greater than zero.')
  if (request.maxWorkers < 0) throw new Error('maxWorkers must be zero or greater.')
  if (request.workerStartupMinutes < 0) throw new Error('workerStartupMinutes must be zero or greater.')
  if (request.targetUtilization <= 0 || request.targetUtilization > 1) {
    throw new Error('targetUtilization must be greater than zero and at most one.')
  }
  if (request.serverlessFallback?.enabled) {
    if (request.serverlessFallback.endpointId.trim() === '') {
      throw new Error('serverlessFallback endpointId is required when enabled.')
    }
    if (request.serverlessFallback.switchBelowUtilization <= 0 || request.serverlessFallback.switchBelowUtilization >= 1) {
      throw new Error('serverlessFallback switchBelowUtilization must be greater than zero and less than one.')
    }
    if (request.serverlessFallback.minSustainSeconds < 0) {
      throw new Error('serverlessFallback minSustainSeconds must be zero or greater.')
    }
  }
  for (const profile of request.throughputProfiles ?? []) {
    validateThroughputProfile(profile)
  }

  const ids = new Set<string>()
  for (const task of request.tasks) {
    if (!task.id) throw new Error('Every task must include an id.')
    if (ids.has(task.id)) throw new Error(`Duplicate task id: ${task.id}`)
    ids.add(task.id)
    if (task.priority < 0) throw new Error(`Task ${task.id} priority must be zero or greater.`)
    if (task.expectedInputTokens < 0 || task.expectedOutputTokens < 0 || task.expectedReasoningTokens < 0) {
      throw new Error(`Task ${task.id} token estimates must be zero or greater.`)
    }
    if (task.baseExecutionMinutes < 0) throw new Error(`Task ${task.id} baseExecutionMinutes must be zero or greater.`)
    if (task.executionRequirements) validateExecutionRequirements(task.id, task.executionRequirements)
    for (const tool of task.toolProfiles) {
      if (tool.expectedCalls < 0) throw new Error(`Task ${task.id} tool expectedCalls must be zero or greater.`)
      if (tool.expectedWallClockMinutes < 0) {
        throw new Error(`Task ${task.id} tool expectedWallClockMinutes must be zero or greater.`)
      }
      if (tool.blockingProbability < 0 || tool.blockingProbability > 1) {
        throw new Error(`Task ${task.id} tool blockingProbability must be between zero and one.`)
      }
    }
  }

  for (const task of request.tasks) {
    for (const dependency of task.dependsOn) {
      if (!ids.has(dependency)) throw new Error(`Task ${task.id} depends on missing task ${dependency}.`)
    }
  }

  assertAcyclic(request.tasks)
}

function validateThroughputProfile(profile: GalPredictionModelThroughputProfile): void {
  if (!profile.id) throw new Error('Every throughput profile must include an id.')
  if (!profile.modelId) throw new Error(`Throughput profile ${profile.id} must include a modelId.`)
  if (!profile.provider) throw new Error(`Throughput profile ${profile.id} must include a provider.`)
  if (!profile.gpuType) throw new Error(`Throughput profile ${profile.id} must include a gpuType.`)
  if (profile.gpuCount <= 0) throw new Error(`Throughput profile ${profile.id} gpuCount must be greater than zero.`)
  if (profile.maxContextTokens <= 0) {
    throw new Error(`Throughput profile ${profile.id} maxContextTokens must be greater than zero.`)
  }
  if (profile.maxConcurrentRequests <= 0) {
    throw new Error(`Throughput profile ${profile.id} maxConcurrentRequests must be greater than zero.`)
  }
  if (profile.prefillTokensPerSecond <= 0) {
    throw new Error(`Throughput profile ${profile.id} prefillTokensPerSecond must be greater than zero.`)
  }
  if (profile.decodeTokensPerSecond <= 0) {
    throw new Error(`Throughput profile ${profile.id} decodeTokensPerSecond must be greater than zero.`)
  }
  if (profile.reasoningTokensPerSecond !== undefined && profile.reasoningTokensPerSecond <= 0) {
    throw new Error(`Throughput profile ${profile.id} reasoningTokensPerSecond must be greater than zero.`)
  }
  if (profile.coldStartSeconds < 0) throw new Error(`Throughput profile ${profile.id} coldStartSeconds must be zero or greater.`)
  if (profile.drainSeconds < 0) throw new Error(`Throughput profile ${profile.id} drainSeconds must be zero or greater.`)
  if (profile.shutdownSeconds < 0) {
    throw new Error(`Throughput profile ${profile.id} shutdownSeconds must be zero or greater.`)
  }
  if (profile.minBillableSeconds < 0) {
    throw new Error(`Throughput profile ${profile.id} minBillableSeconds must be zero or greater.`)
  }
  if (profile.hourlyCostUsd !== undefined && profile.hourlyCostUsd < 0) {
    throw new Error(`Throughput profile ${profile.id} hourlyCostUsd must be zero or greater.`)
  }
  if (profile.imagePullSeconds !== undefined && profile.imagePullSeconds < 0) {
    throw new Error(`Throughput profile ${profile.id} imagePullSeconds must be zero or greater.`)
  }
  if (profile.modelHydrationSeconds !== undefined && profile.modelHydrationSeconds < 0) {
    throw new Error(`Throughput profile ${profile.id} modelHydrationSeconds must be zero or greater.`)
  }
  if (
    profile.modelCacheHitProbability !== undefined &&
    (profile.modelCacheHitProbability < 0 || profile.modelCacheHitProbability > 1)
  ) {
    throw new Error(`Throughput profile ${profile.id} modelCacheHitProbability must be between zero and one.`)
  }
  if (profile.startupBudgetSeconds !== undefined && profile.startupBudgetSeconds < 0) {
    throw new Error(`Throughput profile ${profile.id} startupBudgetSeconds must be zero or greater.`)
  }
}

function validateModelCapabilityProfile(profile: GalPredictionModelCapabilityProfile): void {
  if (!profile.id) throw new Error('Every model capability profile must include an id.')
  if (!profile.modelId) throw new Error(`Model capability profile ${profile.id} must include a modelId.`)
  if (profile.maxContextTokens <= 0) {
    throw new Error(`Model capability profile ${profile.id} maxContextTokens must be greater than zero.`)
  }
  if (profile.maxTaskTokens <= 0) {
    throw new Error(`Model capability profile ${profile.id} maxTaskTokens must be greater than zero.`)
  }
  if (profile.maxToolCalls < 0) {
    throw new Error(`Model capability profile ${profile.id} maxToolCalls must be zero or greater.`)
  }
}

function explainModelFitFailure(fit: {
  tokensFit: boolean
  toolsFit: boolean
  codeFit: boolean
  ciFit: boolean
  releaseFit: boolean
  planningFit: boolean
  autonomyFit: boolean
}): string {
  const reasons: string[] = []
  if (!fit.tokensFit) reasons.push('token or context requirement exceeds model profile')
  if (!fit.toolsFit) reasons.push('tool-call requirement exceeds model profile')
  if (!fit.codeFit) reasons.push('model profile does not support code editing')
  if (!fit.ciFit) reasons.push('model profile does not support CI debugging')
  if (!fit.releaseFit) reasons.push('model profile does not support release work')
  if (!fit.planningFit) reasons.push('model profile does not support long-horizon planning')
  if (!fit.autonomyFit) reasons.push('model profile does not support required autonomous execution')
  return reasons.join('; ')
}

function validateClusterRuntimeSnapshot(snapshot: GalPredictionClusterRuntimeSnapshot): void {
  if (!snapshot.profileId) throw new Error('Runtime snapshot must include a profileId.')
  if (!snapshot.observedAt) throw new Error(`Runtime snapshot ${snapshot.profileId} must include observedAt.`)
  if (snapshot.activeWorkers < 0) throw new Error(`Runtime snapshot ${snapshot.profileId} activeWorkers must be zero or greater.`)
  if (snapshot.busyWorkers < 0) throw new Error(`Runtime snapshot ${snapshot.profileId} busyWorkers must be zero or greater.`)
  if (snapshot.idleWorkers < 0) throw new Error(`Runtime snapshot ${snapshot.profileId} idleWorkers must be zero or greater.`)
  if (snapshot.busyWorkers > snapshot.activeWorkers) {
    throw new Error(`Runtime snapshot ${snapshot.profileId} busyWorkers cannot exceed activeWorkers.`)
  }
  if (snapshot.idleWorkers > snapshot.activeWorkers) {
    throw new Error(`Runtime snapshot ${snapshot.profileId} idleWorkers cannot exceed activeWorkers.`)
  }
  if (snapshot.queuedRequests < 0) {
    throw new Error(`Runtime snapshot ${snapshot.profileId} queuedRequests must be zero or greater.`)
  }
  if (snapshot.runningRequests < 0) {
    throw new Error(`Runtime snapshot ${snapshot.profileId} runningRequests must be zero or greater.`)
  }
  if (
    snapshot.inputTokensPerSecond < 0 ||
    snapshot.outputTokensPerSecond < 0 ||
    (snapshot.reasoningTokensPerSecond ?? 0) < 0
  ) {
    throw new Error(`Runtime snapshot ${snapshot.profileId} token throughput must be zero or greater.`)
  }
  if (snapshot.gpuUtilizationRatio < 0 || snapshot.gpuUtilizationRatio > 1) {
    throw new Error(`Runtime snapshot ${snapshot.profileId} gpuUtilizationRatio must be between zero and one.`)
  }
  if (snapshot.gpuMemoryUtilizationRatio < 0 || snapshot.gpuMemoryUtilizationRatio > 1) {
    throw new Error(`Runtime snapshot ${snapshot.profileId} gpuMemoryUtilizationRatio must be between zero and one.`)
  }
  if (snapshot.queueWaitSeconds < 0) {
    throw new Error(`Runtime snapshot ${snapshot.profileId} queueWaitSeconds must be zero or greater.`)
  }
}

export function validateGalPredictionTraces(traces: GalPredictionExecutionTrace[]): void {
  const ids = new Set<string>()
  for (const trace of traces) {
    if (trace.schemaVersion !== GAL_EXECUTION_TRACE_SCHEMA_VERSION) {
      throw new Error(`Unsupported execution trace schema version: ${trace.schemaVersion}`)
    }
    if (!trace.traceId) throw new Error('Every execution trace must include a traceId.')
    if (ids.has(trace.traceId)) throw new Error(`Duplicate execution trace id: ${trace.traceId}`)
    ids.add(trace.traceId)
    if (!trace.taskId) throw new Error(`Execution trace ${trace.traceId} must include a taskId.`)
    if (calculateTraceWallClockMinutes(trace) < 0) {
      throw new Error(`Execution trace ${trace.traceId} finishedAt must be after startedAt.`)
    }
    if (
      trace.tokenUsage.inputTokens < 0 ||
      trace.tokenUsage.outputTokens < 0 ||
      trace.tokenUsage.reasoningTokens < 0
    ) {
      throw new Error(`Execution trace ${trace.traceId} token usage must be zero or greater.`)
    }
    for (const tool of trace.toolUsage) {
      if (tool.calls < 0) throw new Error(`Execution trace ${trace.traceId} tool calls must be zero or greater.`)
      if (tool.wallClockMinutes < 0) {
        throw new Error(`Execution trace ${trace.traceId} tool wallClockMinutes must be zero or greater.`)
      }
    }
    for (const ci of trace.ciUsage ?? []) {
      if (ci.runtimeMinutes < 0 || ci.queueMinutes < 0 || ci.reruns < 0) {
        throw new Error(`Execution trace ${trace.traceId} CI usage must be zero or greater.`)
      }
    }
  }
}

export function validateGalPredictionGitHubDependencySource(source: GalPredictionGitHubDependencySource): void {
  if (source.schemaVersion !== GAL_GITHUB_DEPENDENCY_SOURCE_SCHEMA_VERSION) {
    throw new Error(`Unsupported GitHub dependency source schema version: ${source.schemaVersion}`)
  }

  const ids = new Set<string>()
  for (const node of source.nodes) {
    if (!node.id) throw new Error('Every GitHub dependency node must include an id.')
    if (ids.has(node.id)) throw new Error(`Duplicate GitHub dependency node id: ${node.id}`)
    ids.add(node.id)
    if (!node.repository) throw new Error(`GitHub dependency node ${node.id} must include a repository.`)
  }

  for (const node of source.nodes) {
    for (const dependency of node.dependsOn) {
      if (!ids.has(dependency)) throw new Error(`GitHub dependency node ${node.id} depends on missing node ${dependency}.`)
    }
  }

  assertGitHubDependencyAcyclic(source.nodes)
}

function validateExecutionRequirements(taskId: string, requirements: GalPredictionExecutionRequirements): void {
  if (requirements.estimatedConcurrentAgents < 0) {
    throw new Error(`Task ${taskId} estimatedConcurrentAgents must be zero or greater.`)
  }
  if (requirements.maxSubAgents !== undefined && requirements.maxSubAgents < 0) {
    throw new Error(`Task ${taskId} maxSubAgents must be zero or greater.`)
  }
  if (requirements.toolCallBudget !== undefined && requirements.toolCallBudget < 0) {
    throw new Error(`Task ${taskId} toolCallBudget must be zero or greater.`)
  }
  if (requirements.sandbox.minCpuCores !== undefined && requirements.sandbox.minCpuCores < 0) {
    throw new Error(`Task ${taskId} sandbox minCpuCores must be zero or greater.`)
  }
  if (requirements.sandbox.minMemoryGb !== undefined && requirements.sandbox.minMemoryGb < 0) {
    throw new Error(`Task ${taskId} sandbox minMemoryGb must be zero or greater.`)
  }
  if (requirements.sandbox.minDiskGb !== undefined && requirements.sandbox.minDiskGb < 0) {
    throw new Error(`Task ${taskId} sandbox minDiskGb must be zero or greater.`)
  }
  if (
    requirements.backend === 'kimi_k2_6' &&
    requirements.mode === 'model_agent_swarm' &&
    requirements.maxSubAgents !== undefined &&
    requirements.maxSubAgents > 300
  ) {
    throw new Error(`Task ${taskId} Kimi K2.6 Agent Swarm maxSubAgents must be at most 300.`)
  }
  if (
    requirements.backend === 'kimi_k2_6' &&
    requirements.mode === 'model_agent_swarm' &&
    requirements.toolCallBudget !== undefined &&
    requirements.toolCallBudget > 4_000
  ) {
    throw new Error(`Task ${taskId} Kimi K2.6 Agent Swarm toolCallBudget must be at most 4000.`)
  }
}

function buildTaskForecasts(request: GalPredictionRequest): GalPredictionTaskForecast[] {
  const tasks = request.tasks
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const memo = new Map<string, GalPredictionTaskForecast>()

  const visit = (task: GalPredictionTaskInput): GalPredictionTaskForecast => {
    const existing = memo.get(task.id)
    if (existing) return existing

    const expectedTokens = task.expectedInputTokens + task.expectedOutputTokens + task.expectedReasoningTokens
    const expectedToolCalls = sum(task.toolProfiles.map((tool) => tool.expectedCalls))
    const expectedToolMinutes = sum(task.toolProfiles.map((tool) => tool.expectedWallClockMinutes))
    const expectedCiMinutes = sum(
      (task.ciProfiles ?? []).map((ci) => ci.expectedRuntimeMinutes + ci.expectedQueueMinutes * (1 + ci.rerunProbability)),
    )
    const toolBlocking = max(task.toolProfiles.map((tool) => tool.blockingProbability), 0)
    const ciBlocking = max((task.ciProfiles ?? []).map((ci) => ci.failureProbability + ci.rerunProbability), 0)
    const explicitBlocker = task.blockerKind && task.blockerKind !== 'none' ? 0.8 : 0
    const blockingProbability = clampRatio(Math.max(toolBlocking, ciBlocking, explicitBlocker))
    const expectedWallClockMinutes = task.baseExecutionMinutes + expectedToolMinutes + expectedCiMinutes
    const dependencyCriticalPath = max(
      task.dependsOn.map((dependencyId) => {
        const dependency = byId.get(dependencyId)
        if (!dependency) return 0
        return visit(dependency).criticalPathMinutes
      }),
      0,
    )

    const forecast: GalPredictionTaskForecast = {
      taskId: task.id,
      title: task.title,
      kind: task.kind,
      repository: task.repository,
      expectedTokens,
      expectedToolCalls,
      expectedCiMinutes,
      expectedToolMinutes,
      expectedWallClockMinutes,
      blockingProbability,
      criticalPathMinutes: dependencyCriticalPath + expectedWallClockMinutes,
      canRunInParallel: task.canRunInParallel,
      dependsOn: [...task.dependsOn],
      requiredAgentCapabilities: [...task.requiredAgentCapabilities],
      executionRequirements: task.executionRequirements ?? inferExecutionRequirements(task),
    }
    forecast.tokenCapacity = forecastTokenCapacity(task, forecast.executionRequirements, request.throughputProfiles ?? [])
    memo.set(task.id, forecast)
    return forecast
  }

  return tasks.map(visit)
}

function forecastTokenCapacity(
  task: GalPredictionTaskInput,
  requirements: GalPredictionExecutionRequirements,
  throughputProfiles: GalPredictionModelThroughputProfile[],
): GalPredictionTokenCapacityForecast | undefined {
  if (throughputProfiles.length === 0) return undefined

  const profile = selectThroughputProfile(task, requirements, throughputProfiles)
  if (!profile) return undefined

  const expectedPrefillSeconds = task.expectedInputTokens / profile.prefillTokensPerSecond
  const expectedDecodeSeconds = task.expectedOutputTokens / profile.decodeTokensPerSecond
  const reasoningTokensPerSecond = profile.reasoningTokensPerSecond ?? profile.decodeTokensPerSecond
  const expectedReasoningSeconds = task.expectedReasoningTokens / reasoningTokensPerSecond
  const expectedRuntimeMinutes = (expectedPrefillSeconds + expectedDecodeSeconds + expectedReasoningSeconds) / 60
  const maxSingleRequestTokens = task.expectedInputTokens + task.expectedOutputTokens + task.expectedReasoningTokens

  return {
    profileId: profile.id,
    modelId: profile.modelId,
    provider: profile.provider,
    gpuType: profile.gpuType,
    gpuCount: profile.gpuCount,
    expectedPrefillSeconds: round(expectedPrefillSeconds, 2),
    expectedDecodeSeconds: round(expectedDecodeSeconds, 2),
    expectedReasoningSeconds: round(expectedReasoningSeconds, 2),
    expectedRuntimeMinutes: round(expectedRuntimeMinutes, 2),
    maxContextTokens: profile.maxContextTokens,
    maxConcurrentRequests: profile.maxConcurrentRequests,
    contextFits: maxSingleRequestTokens <= profile.maxContextTokens,
  }
}

function selectThroughputProfile(
  task: GalPredictionTaskInput,
  requirements: GalPredictionExecutionRequirements,
  throughputProfiles: GalPredictionModelThroughputProfile[],
): GalPredictionModelThroughputProfile | undefined {
  const modelId = requirements.modelId
  const provider = requirements.provider
  const requiresGpu = requirements.sandbox.requiresGpu

  return (
    throughputProfiles.find((profile) => modelId && profile.modelId === modelId && (!provider || profile.provider === provider)) ??
    throughputProfiles.find((profile) => modelId && profile.modelId === modelId) ??
    throughputProfiles.find((profile) => provider && profile.provider === provider) ??
    throughputProfiles.find((profile) => requiresGpu && profile.gpuCount > 0) ??
    throughputProfiles.find((profile) => task.expectedInputTokens + task.expectedOutputTokens <= profile.maxContextTokens)
  )
}

function buildTaskFromGitHubNode(
  node: GalPredictionGitHubDependencyNode,
  options: GalPredictionGitHubDependencyOptions,
): GalPredictionTaskInput {
  const taskKind = mapGitHubNodeKindToTaskKind(node.kind)
  const blockerKind = inferGitHubNodeBlocker(node)
  const defaultTokenEstimate = options.defaultTokenEstimate ?? 4_000
  const defaultExecutionMinutes = options.defaultExecutionMinutes ?? 10

  return {
    id: node.id,
    title: node.title,
    kind: taskKind,
    priority: inferGitHubNodePriority(node),
    dependsOn: [...node.dependsOn],
    expectedInputTokens: defaultTokenEstimate,
    expectedOutputTokens: Math.ceil(defaultTokenEstimate * 0.25),
    expectedReasoningTokens: Math.ceil(defaultTokenEstimate * 0.5),
    baseExecutionMinutes: inferGitHubNodeExecutionMinutes(node, defaultExecutionMinutes),
    toolProfiles: inferGitHubNodeToolProfiles(node),
    ciProfiles: inferGitHubNodeCiProfiles(node),
    blockerKind,
    canRunInParallel: node.dependsOn.length === 0 || blockerKind !== 'dependency',
    requiredAgentCapabilities: inferGitHubNodeCapabilities(node),
    executionRequirements: inferGitHubNodeExecutionRequirements(node),
    repository: node.repository,
  }
}

function mapGitHubNodeKindToTaskKind(kind: GalPredictionGitHubDependencyNode['kind']): GalPredictionTaskKind {
  switch (kind) {
    case 'pull_request':
      return 'review'
    case 'workflow_check':
      return 'ci_cd'
    case 'release':
    case 'deployment_gate':
      return 'release'
    case 'issue':
      return 'repo_triage'
    case 'external_service':
      return 'other'
  }
}

function inferGitHubNodeBlocker(node: GalPredictionGitHubDependencyNode): GalPredictionBlockerKind {
  if (node.requiredReviewers && node.requiredReviewers > 0) return 'review'
  if ((node.failingChecks?.length ?? 0) > 0 || (node.pendingChecks?.length ?? 0) > 0 || node.kind === 'workflow_check') {
    return 'ci'
  }
  if (node.kind === 'deployment_gate') return 'deployment'
  if (node.kind === 'release') return 'release'
  if (node.kind === 'external_service' || node.externalService) return 'external_service'
  if (node.state === 'blocked' || node.dependsOn.length > 0) return 'dependency'
  return 'none'
}

function inferGitHubNodePriority(node: GalPredictionGitHubDependencyNode): number {
  if (node.labels?.includes('release-critical') || node.kind === 'release') return 10
  if (node.kind === 'deployment_gate') return 9
  if (node.kind === 'workflow_check') return 8
  if (node.kind === 'pull_request') return 7
  return 5
}

function inferGitHubNodeExecutionMinutes(
  node: GalPredictionGitHubDependencyNode,
  defaultExecutionMinutes: number,
): number {
  if (node.kind === 'workflow_check') return defaultExecutionMinutes + 20
  if (node.kind === 'deployment_gate') return defaultExecutionMinutes + 15
  if (node.kind === 'release') return defaultExecutionMinutes + 10
  if (node.requiredReviewers && node.requiredReviewers > 0) return defaultExecutionMinutes + 5
  return defaultExecutionMinutes
}

function inferGitHubNodeToolProfiles(node: GalPredictionGitHubDependencyNode): GalPredictionToolProfile[] {
  const blockerKind = inferGitHubNodeBlocker(node)
  const githubCalls = 2 + node.dependsOn.length + (node.pendingChecks?.length ?? 0) + (node.failingChecks?.length ?? 0)
  const profiles: GalPredictionToolProfile[] = [
    {
      toolKind: 'github',
      expectedCalls: githubCalls,
      expectedWallClockMinutes: Math.max(2, githubCalls),
      blockingProbability: blockerKind === 'none' ? 0.05 : 0.35,
    },
  ]

  if (node.kind === 'deployment_gate') {
    profiles.push({ toolKind: 'deploy', expectedCalls: 2, expectedWallClockMinutes: 10, blockingProbability: 0.4 })
  }
  if (node.kind === 'release') {
    profiles.push({ toolKind: 'release', expectedCalls: 2, expectedWallClockMinutes: 8, blockingProbability: 0.3 })
  }
  if (node.kind === 'external_service') {
    profiles.push({ toolKind: 'network', expectedCalls: 2, expectedWallClockMinutes: 8, blockingProbability: 0.75 })
  }

  return profiles
}

function inferGitHubNodeCiProfiles(node: GalPredictionGitHubDependencyNode): GalPredictionCiProfile[] | undefined {
  const checkNames = [...(node.pendingChecks ?? []), ...(node.failingChecks ?? [])]
  if (node.kind !== 'workflow_check' && checkNames.length === 0) return undefined

  const names = checkNames.length === 0 ? ['CI'] : unique(checkNames)
  return names.map((workflowName) => ({
    workflowName,
    expectedRuntimeMinutes: node.failingChecks?.includes(workflowName) ? 35 : 25,
    expectedQueueMinutes: node.pendingChecks?.includes(workflowName) ? 10 : 5,
    failureProbability: node.failingChecks?.includes(workflowName) ? 0.8 : 0.2,
    rerunProbability: node.failingChecks?.includes(workflowName) ? 0.5 : 0.2,
  }))
}

function inferGitHubNodeCapabilities(node: GalPredictionGitHubDependencyNode): string[] {
  const capabilities = ['github']
  if (node.kind === 'workflow_check') capabilities.push('github-actions')
  if (node.kind === 'deployment_gate') capabilities.push('deploy')
  if (node.kind === 'release') capabilities.push('release')
  if (node.kind === 'pull_request') capabilities.push('review')
  if (node.kind === 'external_service') capabilities.push('network')
  return capabilities
}

function inferGitHubNodeExecutionRequirements(node: GalPredictionGitHubDependencyNode): GalPredictionExecutionRequirements {
  if (node.kind === 'external_service') {
    return buildKimiK26AgentSwarmExecutionRequirements({
      estimatedConcurrentAgents: 4,
      sandbox: {
        isolationLevel: 'hosted_external',
        allowedRepos: [],
        allowedSecrets: [],
        allowedNetworks: [node.externalService ?? 'public_internet'],
        allowedTools: ['kimi-agent-swarm', 'web-search'],
        requiresFilesystem: false,
        requiresNetwork: true,
        requiresGpu: false,
        allowDeployments: false,
      },
    })
  }

  const requiresDeploy = node.kind === 'deployment_gate'
  const requiresCi = node.kind === 'workflow_check' || (node.pendingChecks?.length ?? 0) > 0 || (node.failingChecks?.length ?? 0) > 0
  const allowedTools = ['gh']
  if (requiresCi) allowedTools.push('github-actions')
  if (requiresDeploy) allowedTools.push('deploy')
  if (node.kind === 'release') allowedTools.push('release')

  return {
    backend: 'gal_agents',
    mode: requiresCi || requiresDeploy ? 'gal_managed_swarm' : 'model_agent',
    provider: 'gal',
    estimatedConcurrentAgents: node.dependsOn.length > 1 || requiresCi ? 2 : 1,
    requiresHostedRuntime: false,
    sandbox: {
      isolationLevel: requiresDeploy ? 'microvm' : 'container',
      allowedRepos: [node.repository],
      allowedSecrets: requiresDeploy ? ['deployment-token'] : [],
      allowedNetworks: ['github.com', 'api.github.com'],
      allowedTools,
      requiresFilesystem: node.kind === 'pull_request' || requiresCi,
      requiresNetwork: true,
      requiresGpu: false,
      allowDeployments: requiresDeploy,
      minCpuCores: requiresCi ? 4 : 2,
      minMemoryGb: requiresCi ? 8 : 4,
      minDiskGb: requiresCi ? 20 : 10,
    },
  }
}

function inferExecutionRequirements(task: GalPredictionTaskInput): GalPredictionExecutionRequirements {
  const requiresDeploy = task.requiredAgentCapabilities.includes('deploy')
  const requiresNetwork =
    task.requiredAgentCapabilities.includes('github') ||
    task.requiredAgentCapabilities.includes('github-actions') ||
    task.requiredAgentCapabilities.includes('network')
  const allowedTools = unique([
    ...task.toolProfiles.map((tool) => mapToolKindToSandboxTool(tool.toolKind)),
    ...task.requiredAgentCapabilities,
  ])

  return {
    backend: 'gal_agents',
    mode: task.canRunInParallel ? 'gal_managed_swarm' : 'model_agent',
    provider: 'gal',
    estimatedConcurrentAgents: task.canRunInParallel ? 2 : 1,
    requiresHostedRuntime: false,
    sandbox: {
      isolationLevel: requiresDeploy ? 'microvm' : 'container',
      allowedRepos: task.repository ? [task.repository] : [],
      allowedSecrets: requiresDeploy ? ['deployment-token'] : [],
      allowedNetworks: requiresNetwork ? ['github.com', 'api.github.com'] : [],
      allowedTools,
      requiresFilesystem: task.toolProfiles.some((tool) => tool.toolKind === 'filesystem' || tool.toolKind === 'shell'),
      requiresNetwork,
      requiresGpu: false,
      allowDeployments: requiresDeploy,
      minCpuCores: task.kind === 'ci_cd' ? 4 : 2,
      minMemoryGb: task.kind === 'ci_cd' ? 8 : 4,
      minDiskGb: task.kind === 'ci_cd' ? 20 : 10,
    },
  }
}

function mapToolKindToSandboxTool(toolKind: GalPredictionToolKind): string {
  switch (toolKind) {
    case 'github':
      return 'gh'
    case 'ci':
      return 'github-actions'
    case 'deploy':
      return 'deploy'
    case 'release':
      return 'release'
    case 'filesystem':
      return 'filesystem'
    case 'shell':
      return 'shell'
    case 'browser':
      return 'browser'
    case 'network':
      return 'network'
    case 'human':
      return 'human'
    case 'other':
      return 'other'
  }
}

function recommendCapacity(
  request: GalPredictionRequest,
  taskForecasts: GalPredictionTaskForecast[],
  criticalPathMinutes: number,
  options: GalPredictionOptions,
): GalPredictionCapacityRecommendation {
  const clusterCapacity = buildClusterCapacityForecast(request, taskForecasts)
  const usefulWorkerMinutes = sum(
    taskForecasts
      .filter((task) => task.blockingProbability < 0.75)
      .map((task) => task.expectedWallClockMinutes - task.expectedCiMinutes),
  )
  const recommendedWorkers =
    request.maxWorkers === 0
      ? 0
      : clampInteger(
          Math.ceil(usefulWorkerMinutes / Math.max(request.horizonMinutes, 1)),
          1,
          request.maxWorkers,
        )
  const availableWorkerMinutes = request.horizonMinutes * recommendedWorkers
  const workerUtilization = availableWorkerMinutes === 0 ? 0 : clampRatio(usefulWorkerMinutes / availableWorkerMinutes)
  const expectedUtilization = clusterCapacity
    ? clampRatio(Math.max(workerUtilization, clusterCapacity.expectedTokenUtilization))
    : workerUtilization
  const startupCostMinutes = request.workerStartupMinutes * recommendedWorkers
  const expectedWastedWorkerMinutes = Math.max(availableWorkerMinutes - usefulWorkerMinutes, 0) + startupCostMinutes
  const minScaleUpUtilization = options.minScaleUpUtilization ?? 0.55
  const shutdownUtilizationThreshold = options.shutdownUtilizationThreshold ?? 0.15

  if (taskForecasts.length === 0 || usefulWorkerMinutes <= 0) {
    return {
      action: 'shutdown',
      recommendedWorkers: 0,
      expectedUtilization,
      expectedUsefulWorkerMinutes: usefulWorkerMinutes,
      expectedWastedWorkerMinutes,
      reason: 'No useful pre-execution work is available for burst compute.',
      clusterCapacity,
    }
  }

  if (expectedUtilization <= shutdownUtilizationThreshold) {
    return {
      action: request.serverlessFallback?.enabled ? 'route_serverless' : 'shutdown',
      recommendedWorkers: request.serverlessFallback?.enabled ? recommendedWorkers : 0,
      expectedUtilization,
      expectedUsefulWorkerMinutes: usefulWorkerMinutes,
      expectedWastedWorkerMinutes,
      reason: request.serverlessFallback?.enabled
        ? 'Useful work exists, but forecast utilization is below the self-hosted shutdown threshold; route it to serverless fallback.'
        : 'No useful pre-execution work is available for burst compute.',
      clusterCapacity,
    }
  }

  if (
    criticalPathMinutes > request.horizonMinutes ||
    expectedUtilization >= minScaleUpUtilization ||
    (clusterCapacity && (!clusterCapacity.contextFits || clusterCapacity.plannedClusterMinutes > request.horizonMinutes))
  ) {
    return {
      action: 'scale_up',
      recommendedWorkers,
      expectedUtilization,
      expectedUsefulWorkerMinutes: usefulWorkerMinutes,
      expectedWastedWorkerMinutes,
      reason: clusterCapacity?.contextFits === false
        ? 'Forecasted token demand does not fit the selected model context, so the swarm needs a larger profile or task split.'
        : 'Forecasted useful work justifies a self-hosted burst within the planning horizon.',
      clusterCapacity,
    }
  }

  if (expectedUtilization < request.targetUtilization * 0.5) {
    return {
      action: request.serverlessFallback?.enabled ? 'route_serverless' : 'drain',
      recommendedWorkers,
      expectedUtilization,
      expectedUsefulWorkerMinutes: usefulWorkerMinutes,
      expectedWastedWorkerMinutes,
      reason: request.serverlessFallback?.enabled
        ? 'Useful work exists, but forecast utilization is too low for self-hosted capacity; route it to serverless fallback.'
        : 'Useful work exists, but forecast utilization is too low to keep burst workers warm.',
      clusterCapacity,
    }
  }

  return {
    action: 'hold',
    recommendedWorkers,
    expectedUtilization,
    expectedUsefulWorkerMinutes: usefulWorkerMinutes,
    expectedWastedWorkerMinutes,
    reason: 'Forecasted work can use existing capacity without aggressive scale-up.',
    clusterCapacity,
  }
}

function buildClusterCapacityForecast(
  request: GalPredictionRequest,
  taskForecasts: GalPredictionTaskForecast[],
): GalPredictionClusterCapacityForecast | undefined {
  const profileLookup = new Map((request.throughputProfiles ?? []).map((profile) => [profile.id, profile]))
  const tokenCapacities = taskForecasts
    .map((task) => task.tokenCapacity)
    .filter((capacity): capacity is GalPredictionTokenCapacityForecast => Boolean(capacity))
  if (tokenCapacities.length === 0) return undefined

  const grouped = new Map<string, GalPredictionTokenCapacityForecast[]>()
  for (const capacity of tokenCapacities) {
    grouped.set(capacity.profileId, [...(grouped.get(capacity.profileId) ?? []), capacity])
  }

  const [profileId, capacities] = [...grouped.entries()].sort(
    ([, a], [, b]) =>
      sum(b.map((capacity) => capacity.expectedRuntimeMinutes)) -
      sum(a.map((capacity) => capacity.expectedRuntimeMinutes)),
  )[0]
  const profile = profileLookup.get(profileId)
  if (!profile) return undefined

  const expectedRuntimeMinutes = sum(capacities.map((capacity) => capacity.expectedRuntimeMinutes))
  const expectedStartupSeconds = expectedProfileStartupSeconds(profile)
  const plannedClusterSeconds =
    expectedStartupSeconds + expectedRuntimeMinutes * 60 + profile.drainSeconds + profile.shutdownSeconds
  const billableClusterSeconds = Math.max(plannedClusterSeconds, profile.minBillableSeconds)
  const billableClusterMinutes = billableClusterSeconds / 60
  const projectedCostUsd =
    profile.hourlyCostUsd === undefined ? undefined : round((profile.hourlyCostUsd * billableClusterMinutes) / 60, 4)

  return {
    profileId: profile.id,
    modelId: profile.modelId,
    provider: profile.provider,
    gpuType: profile.gpuType,
    gpuCount: profile.gpuCount,
    expectedRuntimeMinutes: round(expectedRuntimeMinutes, 2),
    plannedClusterMinutes: round(plannedClusterSeconds / 60, 2),
    billableClusterMinutes: round(billableClusterMinutes, 2),
    expectedStartupSeconds: round(expectedStartupSeconds, 2),
    expectedTokenUtilization: round(clampRatio((expectedRuntimeMinutes * 60) / Math.max(billableClusterSeconds, 1)), 4),
    contextFits: capacities.every((capacity) => capacity.contextFits),
    projectedCostUsd,
  }
}

function expectedProfileStartupSeconds(profile: GalPredictionModelThroughputProfile): number {
  const imagePullSeconds = profile.imagePullSeconds ?? 0
  const modelHydrationSeconds = profile.modelHydrationSeconds ?? 0
  const cacheHitProbability =
    profile.modelCacheMode === 'prebaked'
      ? 1
      : profile.modelCacheMode === 'none'
        ? 0
        : (profile.modelCacheHitProbability ?? 0)
  const expectedHydrationSeconds = modelHydrationSeconds * (1 - clampRatio(cacheHitProbability))
  return Math.max(profile.coldStartSeconds, imagePullSeconds + expectedHydrationSeconds)
}

function findCriticalPath(taskForecasts: GalPredictionTaskForecast[]): string[] {
  if (taskForecasts.length === 0) return []
  const byId = new Map(taskForecasts.map((task) => [task.taskId, task]))
  const terminal = [...taskForecasts].sort((a, b) => b.criticalPathMinutes - a.criticalPathMinutes)[0]
  const path: string[] = []
  let current: GalPredictionTaskForecast | undefined = terminal

  while (current) {
    path.unshift(current.taskId)
    current = current.dependsOn
      .map((id) => byId.get(id))
      .filter((task): task is GalPredictionTaskForecast => Boolean(task))
      .sort((a, b) => b.criticalPathMinutes - a.criticalPathMinutes)[0]
  }

  return path
}

function calculateConfidence(taskForecasts: GalPredictionTaskForecast[], options: GalPredictionOptions): number {
  const blockerPenalty = options.confidencePenaltyPerBlocker ?? 0.08
  const variancePenalty = options.confidencePenaltyPerHighVarianceTask ?? 0.04
  const blockedTasks = taskForecasts.filter((task) => task.blockingProbability >= 0.75).length
  const highVarianceTasks = taskForecasts.filter(
    (task) => task.expectedCiMinutes > task.expectedWallClockMinutes * 0.45 || task.expectedToolCalls >= 20,
  ).length
  return clampRatio(0.92 - blockedTasks * blockerPenalty - highVarianceTasks * variancePenalty)
}

function readinessCheck(
  id: string,
  title: string,
  severity: GalPredictionReadinessSeverity,
  passed: boolean,
  reason: string,
): GalPredictionReadinessCheck {
  return { id, title, severity, passed, reason }
}

function assertAcyclic(tasks: GalPredictionTaskInput[]): void {
  const byId = new Map(tasks.map((task) => [task.id, task]))
  const visiting = new Set<string>()
  const visited = new Set<string>()

  const visit = (task: GalPredictionTaskInput): void => {
    if (visited.has(task.id)) return
    if (visiting.has(task.id)) throw new Error(`Cycle detected at task ${task.id}.`)
    visiting.add(task.id)
    for (const dependency of task.dependsOn) {
      const dependencyTask = byId.get(dependency)
      if (dependencyTask) visit(dependencyTask)
    }
    visiting.delete(task.id)
    visited.add(task.id)
  }

  for (const task of tasks) visit(task)
}

function assertGitHubDependencyAcyclic(nodes: GalPredictionGitHubDependencyNode[]): void {
  const byId = new Map(nodes.map((node) => [node.id, node]))
  const visiting = new Set<string>()
  const visited = new Set<string>()

  const visit = (node: GalPredictionGitHubDependencyNode): void => {
    if (visited.has(node.id)) return
    if (visiting.has(node.id)) throw new Error(`Cycle detected at GitHub dependency node ${node.id}.`)
    visiting.add(node.id)
    for (const dependency of node.dependsOn) {
      const dependencyNode = byId.get(dependency)
      if (dependencyNode) visit(dependencyNode)
    }
    visiting.delete(node.id)
    visited.add(node.id)
  }

  for (const node of nodes) visit(node)
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0)
}

function average(values: number[]): number {
  return values.length === 0 ? 0 : sum(values) / values.length
}

function calculateTraceWallClockMinutes(trace: GalPredictionExecutionTrace): number {
  return (new Date(trace.finishedAt).getTime() - new Date(trace.startedAt).getTime()) / 60_000
}

function averageToolUsage(
  traces: GalPredictionExecutionTrace[],
  field: 'calls' | 'wallClockMinutes',
): Partial<Record<GalPredictionToolKind, number>> {
  const kinds = new Set(traces.flatMap((trace) => trace.toolUsage.map((tool) => tool.toolKind)))
  return Object.fromEntries(
    [...kinds].map((kind) => {
      const values = traces.flatMap((trace) =>
        trace.toolUsage.filter((tool) => tool.toolKind === kind).map((tool) => tool[field]),
      )
      return [kind, average(values)]
    }),
  )
}

function averageCiUsage(
  traces: GalPredictionExecutionTrace[],
  field: 'runtimeMinutes' | 'queueMinutes',
): Record<string, number> {
  const workflows = new Set(traces.flatMap((trace) => (trace.ciUsage ?? []).map((ci) => ci.workflowName)))
  return Object.fromEntries(
    [...workflows].map((workflowName) => {
      const values = traces.flatMap((trace) =>
        (trace.ciUsage ?? []).filter((ci) => ci.workflowName === workflowName).map((ci) => ci[field]),
      )
      return [workflowName, average(values)]
    }),
  )
}

function probabilityByWorkflow(
  traces: GalPredictionExecutionTrace[],
  field: 'failed',
): Record<string, number> {
  const workflows = new Set(traces.flatMap((trace) => (trace.ciUsage ?? []).map((ci) => ci.workflowName)))
  return Object.fromEntries(
    [...workflows].map((workflowName) => {
      const values = traces.flatMap((trace) =>
        (trace.ciUsage ?? [])
          .filter((ci) => ci.workflowName === workflowName)
          .map((ci) => (ci[field] ? 1 : 0)),
      )
      return [workflowName, average(values)]
    }),
  )
}

function rerunProbabilityByWorkflow(traces: GalPredictionExecutionTrace[]): Record<string, number> {
  const workflows = new Set(traces.flatMap((trace) => (trace.ciUsage ?? []).map((ci) => ci.workflowName)))
  return Object.fromEntries(
    [...workflows].map((workflowName) => {
      const values = traces.flatMap((trace) =>
        (trace.ciUsage ?? [])
          .filter((ci) => ci.workflowName === workflowName)
          .map((ci) => (ci.reruns > 0 ? 1 : 0)),
      )
      return [workflowName, average(values)]
    }),
  )
}

function blockerProbabilityByKind(
  traces: GalPredictionExecutionTrace[],
): Partial<Record<GalPredictionBlockerKind, number>> {
  const kinds = new Set(traces.map((trace) => trace.blockerKind ?? 'none'))
  return Object.fromEntries(
    [...kinds].map((kind) => {
      const blocked = traces.filter((trace) => (trace.blockerKind ?? 'none') === kind).length
      return [kind, traces.length === 0 ? 0 : blocked / traces.length]
    }),
  )
}

function max(values: number[], fallback: number): number {
  return values.length === 0 ? fallback : Math.max(...values)
}

function clampRatio(value: number): number {
  if (!Number.isFinite(value)) return 1
  return Math.max(0, Math.min(1, value))
}

function clampInteger(value: number, min: number, maxValue: number): number {
  return Math.max(min, Math.min(maxValue, Math.ceil(value)))
}

function round(value: number, precision = 0): number {
  const factor = 10 ** precision
  return Math.round(value * factor) / factor
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)]
}
