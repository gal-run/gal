import {
  GAL_SWARM_DECISION_SCHEMA_VERSION,
  type GalSwarmComputeProfile,
  type GalSwarmCostSnapshot,
  type GalSwarmDecision,
  type GalSwarmExecutionForecastInput,
  type GalSwarmForecastAdapterOptions,
  type GalSwarmLoadSnapshot,
  type GalSwarmPlan,
  type GalSwarmPolicyOptions,
  type GalSwarmPriorityClass,
  type GalSwarmProviderCandidate,
  type GalSwarmProviderKind,
  type GalSwarmProviderSelection,
  type GalSwarmProviderSelectionInput,
  type GalSwarmRankedProviderCandidate,
  type GalSwarmServerlessEndpointProfile,
} from '../contracts.js'
import { clampInteger, clampRatio, round } from '../shared/math.js'
import { validateGalSwarmPlan } from './validation.js'

export function calculateGalSwarmEffectiveUtilization(load: GalSwarmLoadSnapshot): number {
  if (load.activeWorkers <= 0) return 0
  return clampRatio(load.busyWorkers / load.activeWorkers)
}

export function calculateGalSwarmPressure(load: GalSwarmLoadSnapshot): number {
  if (load.targetCompletionWindowMinutes <= 0) return Number.POSITIVE_INFINITY
  return load.expectedRuntimeMinutes / load.targetCompletionWindowMinutes
}

export function highestRunnablePriority(
  plan: Pick<GalSwarmPlan, 'priorityOrder'>,
  load: Pick<GalSwarmLoadSnapshot, 'priorityMix'>,
): GalSwarmPriorityClass | undefined {
  return plan.priorityOrder.find((priorityClass) =>
    load.priorityMix.some((entry) => entry.priorityClass === priorityClass && entry.runnableWorkUnits > 0),
  )
}

export function estimateGalSwarmProviderCost(
  candidate: GalSwarmProviderCandidate,
  expectedRuntimeMinutes: number,
  desiredWorkers: number,
): { estimatedCostUsd: number; billableSeconds: number } {
  if (candidate.hourlyCostUsd < 0) throw new Error('Provider candidate hourlyCostUsd must be non-negative.')
  if (expectedRuntimeMinutes < 0) throw new Error('expectedRuntimeMinutes must be non-negative.')
  if (desiredWorkers < 0) throw new Error('desiredWorkers must be non-negative.')

  const lifecycleSeconds = (candidate.estimatedStartupSeconds ?? 0) + expectedRuntimeMinutes * 60 + (candidate.estimatedShutdownSeconds ?? 0)
  const billableSeconds = Math.max(lifecycleSeconds, candidate.minBillableSeconds ?? 0)
  return {
    estimatedCostUsd: round((candidate.hourlyCostUsd * desiredWorkers * billableSeconds) / 3600, 4),
    billableSeconds,
  }
}

export function rankGalSwarmProviders(input: GalSwarmProviderSelectionInput): GalSwarmRankedProviderCandidate[] {
  const allowedProviders = new Set(input.plan.providers)
  const computeProfileIds = new Set(input.plan.computeProfiles.map((profile) => profile.id))
  const desiredComputeUnits = input.desiredComputeUnits ?? input.desiredWorkers

  // Ranking is deterministic and side-effect free. It compares only declared
  // candidates so the SDK never probes provider APIs or leaks credentials.
  return input.candidates
    .filter((candidate) => allowedProviders.has(candidate.provider))
    .filter((candidate) => computeProfileIds.has(candidate.computeProfileId))
    .map((candidate) => {
      const cost = estimateGalSwarmProviderCost(candidate, input.expectedRuntimeMinutes, desiredComputeUnits)
      const spendPressure = input.plan.maxSpendUsd <= 0 ? 1 : clampRatio(cost.estimatedCostUsd / input.plan.maxSpendUsd)
      const reliability = clampRatio(candidate.reliabilityScore)
      const locality = clampRatio(candidate.localityScore ?? 0.5)
      const availabilityPenalty = candidate.available ? 0 : 2
      const reservationPenalty = candidate.requiresReservation ? 0.35 : 0
      const score = round(cost.estimatedCostUsd * (1 + spendPressure) + (1 - reliability) * 10 + (1 - locality) * 2 + availabilityPenalty * 100 + reservationPenalty * 10, 4)

      return {
        ...candidate,
        estimatedCostUsd: cost.estimatedCostUsd,
        billableSeconds: cost.billableSeconds,
        score,
        reason: candidate.available
          ? `Estimated burst cost is $${cost.estimatedCostUsd} with reliability score ${reliability}.`
          : 'Provider candidate is currently unavailable.',
      }
    })
    .sort((a, b) => a.score - b.score)
}

export function selectGalSwarmProvider(input: GalSwarmProviderSelectionInput): GalSwarmProviderSelection {
  const rankedCandidates = rankGalSwarmProviders(input)
  return {
    selected: rankedCandidates.find((candidate) => candidate.available && candidate.estimatedCostUsd <= input.plan.maxSpendUsd),
    rankedCandidates,
  }
}

export function buildGalSwarmLoadFromForecast(
  plan: Pick<GalSwarmPlan, 'priorityOrder'>,
  forecast: GalSwarmExecutionForecastInput,
  options: GalSwarmForecastAdapterOptions = {},
): GalSwarmLoadSnapshot {
  const priorityClass = options.priorityClass ?? plan.priorityOrder[0]
  const activeWorkers = options.activeWorkers ?? 0
  const runnableWorkUnits = forecast.taskForecasts.filter((task) => task.blockingProbability < 0.75).length
  const busyWorkers =
    options.busyWorkers ??
    Math.min(activeWorkers, Math.ceil(activeWorkers * clampRatio(forecast.capacity.expectedUtilization)))
  const idleWorkers = Math.max(activeWorkers - busyWorkers, 0)

  return {
    queuedWorkUnits: forecast.taskForecasts.length,
    runnableWorkUnits,
    activeWorkers,
    busyWorkers,
    idleWorkers,
    avgQueueWaitSeconds: options.avgQueueWaitSeconds ?? 0,
    p95QueueWaitSeconds: options.p95QueueWaitSeconds ?? 0,
    expectedRuntimeMinutes: Math.max(forecast.capacity.expectedUsefulWorkerMinutes, forecast.criticalPathMinutes),
    targetCompletionWindowMinutes: forecast.horizonMinutes,
    priorityMix: priorityClass
      ? [
          {
            priorityClass,
            runnableWorkUnits,
            expectedRuntimeMinutes: forecast.capacity.expectedUsefulWorkerMinutes,
          },
        ]
      : [],
  }
}


export function planGalSwarmDecision(
  plan: GalSwarmPlan,
  load: GalSwarmLoadSnapshot,
  cost: GalSwarmCostSnapshot,
  options: GalSwarmPolicyOptions = {},
): GalSwarmDecision {
  validateGalSwarmPlan(plan)

  const now = options.now ?? (() => new Date().toISOString())
  const scaleUpPressureThreshold = options.scaleUpPressureThreshold ?? 1.2
  const holdUtilizationThreshold = options.holdUtilizationThreshold ?? plan.minEffectiveUtilization
  const drainUtilizationThreshold = options.drainUtilizationThreshold ?? 0.35
  const shutdownUtilizationThreshold = options.shutdownUtilizationThreshold ?? 0.2
  const capacityMinutesPerWorker = options.capacityMinutesPerWorker ?? 60
  const effectiveUtilization = calculateGalSwarmEffectiveUtilization(load)
  const pressure = calculateGalSwarmPressure(load)
  const priorityClass = highestRunnablePriority(plan, load)
  const canSpend = cost.projectedSpendUsd <= plan.maxSpendUsd
  const serverlessEndpoint = selectServerlessFallbackEndpoint(plan)

  if (load.runnableWorkUnits === 0 && effectiveUtilization <= shutdownUtilizationThreshold) {
    return buildDecision(plan, {
      action: 'shutdown',
      desiredWorkers: 0,
      routingTarget: 'serverless',
      serverlessEndpointId: serverlessEndpoint?.id,
      reason: 'No runnable work and utilization is below shutdown threshold.',
      pressure,
      effectiveUtilization,
      projectedSpendUsd: cost.projectedSpendUsd,
      priorityClass,
      evaluatedAt: now(),
    })
  }

  if (
    serverlessEndpoint &&
    load.runnableWorkUnits > 0 &&
    effectiveUtilization <= plan.serverlessFallback!.switchBelowUtilization &&
    pressure < scaleUpPressureThreshold
  ) {
    return buildDecision(plan, {
      action: 'route_serverless',
      desiredWorkers: plan.serverlessFallback!.drainSelfHosted
        ? Math.max(plan.minWorkers, Math.min(load.busyWorkers, load.activeWorkers))
        : clampInteger(load.activeWorkers, plan.minWorkers, plan.maxWorkers),
      routingTarget: 'serverless',
      serverlessEndpointId: serverlessEndpoint.id,
      provider: serverlessEndpoint.provider,
      reason: 'Self-hosted utilization is below the serverless switch threshold; route new work to the serverless endpoint and drain burst capacity.',
      pressure,
      effectiveUtilization,
      projectedSpendUsd: cost.projectedSpendUsd,
      priorityClass,
      evaluatedAt: now(),
    })
  }

  if (pressure >= scaleUpPressureThreshold && canSpend && priorityClass) {
    const workersForWindow = Math.ceil(load.expectedRuntimeMinutes / capacityMinutesPerWorker)
    const desiredWorkers = clampInteger(workersForWindow, plan.minWorkers, plan.maxWorkers)
    const logicalWorkersPerComputeUnit = Math.max(options.logicalWorkersPerComputeUnit ?? 1, 1)
    const desiredComputeUnits = Math.max(Math.ceil(desiredWorkers / logicalWorkersPerComputeUnit), desiredWorkers > 0 ? 1 : 0)
    const providerSelection =
      options.providerCandidates && options.providerCandidates.length > 0
        ? selectGalSwarmProvider({
            plan,
            expectedRuntimeMinutes: load.expectedRuntimeMinutes,
            desiredWorkers,
            desiredComputeUnits,
            candidates: options.providerCandidates,
          }).selected
        : undefined
    const computeProfile = providerSelection
      ? plan.computeProfiles.find((profile) => profile.id === providerSelection.computeProfileId)
      : selectComputeProfile(plan, cost.provider)

    if (desiredWorkers > load.activeWorkers) {
      return buildDecision(plan, {
        action: 'scale_up',
        desiredWorkers,
        desiredComputeUnits,
        routingTarget: 'self_hosted',
        provider: providerSelection?.provider ?? computeProfile?.provider ?? cost.provider,
        computeProfileId: providerSelection?.computeProfileId ?? computeProfile?.id,
        reason: 'Runnable work pressure exceeds scale-up threshold and projected spend is within budget.',
        pressure,
        effectiveUtilization,
        projectedSpendUsd: cost.projectedSpendUsd,
        priorityClass,
        evaluatedAt: now(),
      })
    }
  }

  if (effectiveUtilization >= holdUtilizationThreshold || (priorityClass && pressure >= 1)) {
    return buildDecision(plan, {
      action: 'hold',
      desiredWorkers: clampInteger(load.activeWorkers, plan.minWorkers, plan.maxWorkers),
      routingTarget: 'self_hosted',
      reason: 'Current capacity is justified by utilization or deadline pressure.',
      pressure,
      effectiveUtilization,
      projectedSpendUsd: cost.projectedSpendUsd,
      priorityClass,
      evaluatedAt: now(),
    })
  }

  if (effectiveUtilization <= drainUtilizationThreshold) {
    return buildDecision(plan, {
      action: 'drain',
      desiredWorkers: Math.max(plan.minWorkers, Math.min(load.busyWorkers, load.activeWorkers)),
      routingTarget: serverlessEndpoint ? 'serverless' : 'self_hosted',
      serverlessEndpointId: serverlessEndpoint?.id,
      reason: 'Utilization is below drain threshold; stop accepting new work and let active workers finish.',
      pressure,
      effectiveUtilization,
      projectedSpendUsd: cost.projectedSpendUsd,
      priorityClass,
      evaluatedAt: now(),
    })
  }

  return buildDecision(plan, {
    action: 'hold',
    desiredWorkers: clampInteger(load.activeWorkers, plan.minWorkers, plan.maxWorkers),
    routingTarget: 'self_hosted',
    reason: 'No scale-up, drain, or shutdown threshold was crossed.',
    pressure,
    effectiveUtilization,
    projectedSpendUsd: cost.projectedSpendUsd,
    priorityClass,
    evaluatedAt: now(),
  })
}

export function planGalSwarmDecisionFromForecast(
  plan: GalSwarmPlan,
  forecast: GalSwarmExecutionForecastInput,
  cost: GalSwarmCostSnapshot,
  options: GalSwarmForecastAdapterOptions = {},
): GalSwarmDecision {
  validateGalSwarmPlan(plan)

  const now = options.now ?? (() => new Date().toISOString())
  const load = buildGalSwarmLoadFromForecast(plan, forecast, options)
  const priorityClass = highestRunnablePriority(plan, load)
  const effectiveUtilization = calculateGalSwarmEffectiveUtilization(load)
  const pressure = calculateGalSwarmPressure(load)
  const canSpend = cost.projectedSpendUsd <= plan.maxSpendUsd

  if (forecast.capacity.action === 'shutdown' && load.runnableWorkUnits === 0) {
    const serverlessEndpoint = selectServerlessFallbackEndpoint(plan)
    return buildDecision(plan, {
      action: 'shutdown',
      desiredWorkers: 0,
      routingTarget: 'serverless',
      serverlessEndpointId: serverlessEndpoint?.id,
      reason: `Prediction forecast recommends shutdown: ${forecast.capacity.reason}`,
      pressure,
      effectiveUtilization,
      projectedSpendUsd: cost.projectedSpendUsd,
      priorityClass,
      evaluatedAt: now(),
    })
  }

  if (forecast.capacity.action === 'drain') {
    const serverlessEndpoint = selectServerlessFallbackEndpoint(plan)
    return buildDecision(plan, {
      action: 'drain',
      desiredWorkers: Math.max(plan.minWorkers, Math.min(load.busyWorkers, load.activeWorkers)),
      routingTarget: serverlessEndpoint ? 'serverless' : 'self_hosted',
      serverlessEndpointId: serverlessEndpoint?.id,
      reason: `Prediction forecast recommends drain: ${forecast.capacity.reason}`,
      pressure,
      effectiveUtilization,
      projectedSpendUsd: cost.projectedSpendUsd,
      priorityClass,
      evaluatedAt: now(),
    })
  }

  if (forecast.capacity.action === 'route_serverless') {
    const serverlessEndpoint = selectServerlessFallbackEndpoint(plan)
    return buildDecision(plan, {
      action: 'route_serverless',
      desiredWorkers: serverlessEndpoint && plan.serverlessFallback?.drainSelfHosted
        ? Math.max(plan.minWorkers, Math.min(load.busyWorkers, load.activeWorkers))
        : clampInteger(load.activeWorkers, plan.minWorkers, plan.maxWorkers),
      routingTarget: 'serverless',
      serverlessEndpointId: serverlessEndpoint?.id,
      provider: serverlessEndpoint?.provider,
      reason: `Prediction forecast recommends serverless fallback: ${forecast.capacity.reason}`,
      pressure,
      effectiveUtilization,
      projectedSpendUsd: cost.projectedSpendUsd,
      priorityClass,
      evaluatedAt: now(),
    })
  }

  if (forecast.capacity.action === 'scale_up' && canSpend && priorityClass) {
    const desiredWorkers = clampInteger(forecast.capacity.recommendedWorkers, plan.minWorkers, plan.maxWorkers)
    const logicalWorkersPerComputeUnit = Math.max(options.logicalWorkersPerComputeUnit ?? 1, 1)
    const desiredComputeUnits = Math.max(Math.ceil(desiredWorkers / logicalWorkersPerComputeUnit), desiredWorkers > 0 ? 1 : 0)

    if (desiredWorkers > load.activeWorkers) {
      const providerSelection =
        options.providerCandidates && options.providerCandidates.length > 0
          ? selectGalSwarmProvider({
              plan,
              expectedRuntimeMinutes: forecast.horizonMinutes,
              desiredWorkers,
              desiredComputeUnits,
              candidates: options.providerCandidates,
            }).selected
          : undefined
      const computeProfile = providerSelection
        ? plan.computeProfiles.find((profile) => profile.id === providerSelection.computeProfileId)
        : selectComputeProfile(plan, cost.provider)

      return buildDecision(plan, {
        action: 'scale_up',
        desiredWorkers,
        desiredComputeUnits,
        routingTarget: 'self_hosted',
        provider: providerSelection?.provider ?? computeProfile?.provider ?? cost.provider,
        computeProfileId: providerSelection?.computeProfileId ?? computeProfile?.id,
        reason: `Prediction forecast recommends scale-up: ${forecast.capacity.reason}`,
        pressure,
        effectiveUtilization,
        projectedSpendUsd: providerSelection?.estimatedCostUsd ?? cost.projectedSpendUsd,
        priorityClass,
        evaluatedAt: now(),
      })
    }
  }

  return planGalSwarmDecision(plan, load, cost, {
    ...options,
    capacityMinutesPerWorker: forecast.horizonMinutes,
  })
}


function buildDecision(
  plan: GalSwarmPlan,
  decision: Omit<GalSwarmDecision, 'schemaVersion' | 'swarmId'>,
): GalSwarmDecision {
  return {
    schemaVersion: GAL_SWARM_DECISION_SCHEMA_VERSION,
    swarmId: plan.swarmId,
    ...decision,
  }
}

function selectServerlessFallbackEndpoint(plan: GalSwarmPlan): GalSwarmServerlessEndpointProfile | undefined {
  if (!plan.serverlessFallback?.enabled) return undefined
  return plan.serverlessEndpoints?.find((endpoint) => endpoint.id === plan.serverlessFallback?.endpointId)
}

function selectComputeProfile(
  plan: GalSwarmPlan,
  preferredProvider: GalSwarmProviderKind,
): GalSwarmComputeProfile | undefined {
  return (
    plan.computeProfiles.find((profile) => profile.provider === preferredProvider) ??
    plan.computeProfiles.find((profile) => plan.providers.includes(profile.provider))
  )
}
