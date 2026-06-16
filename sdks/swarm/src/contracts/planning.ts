import {
  GAL_SWARM_DECISION_SCHEMA_VERSION,
  GAL_SWARM_LEASE_SCHEMA_VERSION,
  GAL_SWARM_PLAN_SCHEMA_VERSION,
  GAL_SWARM_PREFLIGHT_SCHEMA_VERSION,
} from './schema.js'
import type { GalSwarmProviderKind } from './providers.js'
import type { GalSwarmOrchestrationMode } from './topology.js'

/**
 * Capacity planning contracts used before gal-api asks infrastructure to act.
 *
 * These types model load, cost, provider ranking, permissions, leases, and
 * preflight gates. They intentionally stop before any concrete provider SDK
 * call; provider execution belongs to gal-api/Stratus integration code.
 */

export const GAL_SWARM_PRIORITY_CLASSES = [
  'release-critical',
  'user-facing',
  'scheduled',
  'speculative',
] as const

export type GalSwarmPriorityClass = (typeof GAL_SWARM_PRIORITY_CLASSES)[number]

export const GAL_SWARM_DECISION_ACTIONS = ['scale_up', 'hold', 'drain', 'route_serverless', 'shutdown'] as const

export type GalSwarmDecisionAction = (typeof GAL_SWARM_DECISION_ACTIONS)[number]

export const GAL_SWARM_ROUTING_TARGETS = ['self_hosted', 'serverless'] as const

export type GalSwarmRoutingTarget = (typeof GAL_SWARM_ROUTING_TARGETS)[number]

export const GAL_SWARM_BILLING_GRANULARITIES = [
  'second',
  'minute',
  'hour',
  'capacity_block',
  'reservation',
  'unknown',
] as const

export type GalSwarmBillingGranularity = (typeof GAL_SWARM_BILLING_GRANULARITIES)[number]

export const GAL_SWARM_LIFECYCLE_SURFACES = [
  'pod',
  'vm',
  'managed_kubernetes',
  'capacity_block',
  'local',
  'other',
] as const

export type GalSwarmLifecycleSurface = (typeof GAL_SWARM_LIFECYCLE_SURFACES)[number]

export const GAL_SWARM_METRICS_SURFACES = [
  'runtime_api',
  'cloud_monitoring',
  'prometheus',
  'dcgm_agent',
  'container_metrics',
  'none',
] as const

export type GalSwarmMetricsSurface = (typeof GAL_SWARM_METRICS_SURFACES)[number]

export interface GalSwarmPriorityMix {
  priorityClass: GalSwarmPriorityClass
  runnableWorkUnits: number
  expectedRuntimeMinutes: number
}

export interface GalSwarmLoadSnapshot {
  queuedWorkUnits: number
  runnableWorkUnits: number
  activeWorkers: number
  busyWorkers: number
  idleWorkers: number
  avgQueueWaitSeconds: number
  p95QueueWaitSeconds: number
  expectedRuntimeMinutes: number
  targetCompletionWindowMinutes: number
  priorityMix: GalSwarmPriorityMix[]
}

export interface GalSwarmCostSnapshot {
  provider: GalSwarmProviderKind
  hourlyCostUsd: number
  startupLatencySeconds: number
  shutdownLatencySeconds: number
  minimumBillableSeconds: number
  currentSpendUsd: number
  projectedSpendUsd: number
}

export interface GalSwarmProviderIntegrationProfile {
  provider: GalSwarmProviderKind
  lifecycleSurface: GalSwarmLifecycleSurface
  billingGranularity: GalSwarmBillingGranularity
  canScaleToZero: boolean
  supportsStop: boolean
  supportsTerminate: boolean
  supportsSpot: boolean
  supportsReservations: boolean
  supportsServerless: boolean
  minBillableSeconds: number
  typicalStartupSeconds: number
  typicalShutdownSeconds: number
  metricsSurfaces: GalSwarmMetricsSurface[]
  adapterPackage?: string
  sdkPackages: string[]
  authSecretNames: string[]
  notes: string
}

export interface GalSwarmProviderCandidate {
  provider: GalSwarmProviderKind
  computeProfileId: string
  hourlyCostUsd: number
  estimatedStartupSeconds?: number
  estimatedShutdownSeconds?: number
  minBillableSeconds?: number
  available: boolean
  reliabilityScore: number
  localityScore?: number
  requiresReservation?: boolean
  notes?: string
}

export interface GalSwarmRankedProviderCandidate extends GalSwarmProviderCandidate {
  estimatedCostUsd: number
  billableSeconds: number
  score: number
  reason: string
}

export interface GalSwarmProviderSelectionInput {
  plan: Pick<GalSwarmPlan, 'providers' | 'computeProfiles' | 'maxSpendUsd'>
  expectedRuntimeMinutes: number
  desiredWorkers: number
  desiredComputeUnits?: number
  candidates: GalSwarmProviderCandidate[]
}

export interface GalSwarmProviderSelection {
  selected?: GalSwarmRankedProviderCandidate
  rankedCandidates: GalSwarmRankedProviderCandidate[]
}

export interface GalSwarmComputeProfile {
  id: string
  provider: GalSwarmProviderKind
  label: string
  region?: string
  zone?: string
  spot?: boolean
  modelId?: string
  purpose?: 'provider_startup_smoke' | 'tool_calling_smoke' | 'coding_smoke' | 'agent_quality' | 'release_execution'
  maxDurationMinutes?: number
  maxSpendUsd?: number
  cpuCores?: number
  memoryGb?: number
  gpuType?: string
  gpuCount?: number
  diskGb?: number
  image?: string
  imageRef?: string
  modelCache?: GalSwarmModelCacheProfile
  startupBudgetSeconds?: number
  readinessProbe?: GalSwarmReadinessProbe
  shutdownPolicy?: GalSwarmShutdownPolicy
  tools: string[]
}

export type GalSwarmModelCacheMode = 'none' | 'prebaked' | 'hydrate_on_startup' | 'pull_through'

export interface GalSwarmModelCacheProfile {
  uri?: string
  mode: GalSwarmModelCacheMode
  mountPath: string
  expectedHitRate: number
  hydrateTimeoutSeconds: number
}

export interface GalSwarmReadinessProbe {
  type: 'http'
  path: string
  port: number
  timeoutSeconds: number
  intervalSeconds: number
}

export interface GalSwarmShutdownPolicy {
  maxDurationSeconds: number
  deleteInstance: boolean
  deleteBootDisk: boolean
  cleanupNetwork: boolean
}

export interface GalSwarmServerlessEndpointProfile {
  id: string
  provider: GalSwarmProviderKind
  label: string
  endpointRef: string
  modelId?: string
  maxQueueWaitSeconds: number
  maxCostUsdPer1kTokens?: number
  tools: string[]
}

export interface GalSwarmServerlessFallbackPolicy {
  enabled: boolean
  endpointId: string
  switchBelowUtilization: number
  minSustainSeconds: number
  drainSelfHosted: boolean
}

export interface GalSwarmPermissionProfile {
  allowedRepos: string[]
  allowedSecrets: string[]
  allowedNetworks: string[]
  allowedTools: string[]
  allowDeployments: boolean
  maxPrivilegeReason: string
}

export interface GalSwarmPlan {
  schemaVersion: typeof GAL_SWARM_PLAN_SCHEMA_VERSION
  swarmId: string
  objective: string
  orchestrationMode: GalSwarmOrchestrationMode
  maxDurationMinutes: number
  maxSpendUsd: number
  targetQueueWaitSeconds: number
  minEffectiveUtilization: number
  drainBelowUtilizationForSeconds: number
  shutdownBelowUtilizationForSeconds: number
  minWorkers: number
  maxWorkers: number
  priorityOrder: GalSwarmPriorityClass[]
  providers: GalSwarmProviderKind[]
  computeProfiles: GalSwarmComputeProfile[]
  serverlessEndpoints?: GalSwarmServerlessEndpointProfile[]
  serverlessFallback?: GalSwarmServerlessFallbackPolicy
  permissions: GalSwarmPermissionProfile
}

export interface GalSwarmWorkerLease {
  schemaVersion: typeof GAL_SWARM_LEASE_SCHEMA_VERSION
  leaseId: string
  swarmId: string
  workerId: string
  provider: GalSwarmProviderKind
  computeProfileId: string
  priorityClass: GalSwarmPriorityClass
  leaseStartedAt: string
  leaseExpiresAt: string
  maxCostUsd: number
  allowedRepos: string[]
  allowedTools: string[]
  drainAfterIdleSeconds: number
  metadata?: Record<string, unknown>
}

export interface GalSwarmDecision {
  schemaVersion: typeof GAL_SWARM_DECISION_SCHEMA_VERSION
  swarmId: string
  action: GalSwarmDecisionAction
  desiredWorkers: number
  desiredComputeUnits?: number
  provider?: GalSwarmProviderKind
  computeProfileId?: string
  routingTarget?: GalSwarmRoutingTarget
  serverlessEndpointId?: string
  reason: string
  pressure: number
  effectiveUtilization: number
  projectedSpendUsd: number
  priorityClass?: GalSwarmPriorityClass
  evaluatedAt: string
}

export interface GalSwarmForecastTaskInput {
  taskId: string
  expectedWallClockMinutes: number
  expectedCiMinutes: number
  blockingProbability: number
  canRunInParallel: boolean
}

export interface GalSwarmForecastCapacityInput {
  action: GalSwarmDecisionAction
  recommendedWorkers: number
  expectedUtilization: number
  expectedUsefulWorkerMinutes: number
  expectedWastedWorkerMinutes: number
  reason: string
}

export interface GalSwarmExecutionForecastInput {
  requestId: string
  horizonMinutes: number
  criticalPathMinutes: number
  parallelizableTaskIds: string[]
  ciBoundTaskIds: string[]
  blockedTaskIds: string[]
  taskForecasts: GalSwarmForecastTaskInput[]
  capacity: GalSwarmForecastCapacityInput
}

export interface GalSwarmPolicyOptions {
  now?: () => string
  scaleUpPressureThreshold?: number
  holdUtilizationThreshold?: number
  drainUtilizationThreshold?: number
  shutdownUtilizationThreshold?: number
  capacityMinutesPerWorker?: number
  logicalWorkersPerComputeUnit?: number
  providerCandidates?: GalSwarmProviderCandidate[]
}

export interface GalSwarmForecastAdapterOptions extends GalSwarmPolicyOptions {
  activeWorkers?: number
  busyWorkers?: number
  avgQueueWaitSeconds?: number
  p95QueueWaitSeconds?: number
  priorityClass?: GalSwarmPriorityClass
}

export type GalSwarmPreflightSeverity = 'blocker' | 'warning'

export interface GalSwarmPreflightCheck {
  id: string
  title: string
  severity: GalSwarmPreflightSeverity
  passed: boolean
  reason: string
}

export interface GalSwarmBurstPreflightInput {
  plan: GalSwarmPlan
  decision: GalSwarmDecision
  cost: GalSwarmCostSnapshot
  selectedProvider?: GalSwarmRankedProviderCandidate
  runnableTaskCount: number
  blockedTaskCount: number
  maxAllowedSpendUsd: number
  maxAllowedComputeUnits: number
  runtimeTelemetryConfigured: boolean
  providerCredentialsConfigured: boolean
  requireNoDeployments?: boolean
}

export interface GalSwarmBurstPreflightResult {
  schemaVersion: typeof GAL_SWARM_PREFLIGHT_SCHEMA_VERSION
  swarmId: string
  passed: boolean
  blockerCount: number
  warningCount: number
  checks: GalSwarmPreflightCheck[]
}
