import {
  GAL_SWARM_HOT_START_SLO_SCHEMA_VERSION,
  type GalSwarmHotStartObservation,
  type GalSwarmHotStartSloContract,
  type GalSwarmHotStartSloDecision,
} from '../contracts.js'
import { uniqueStrings } from '../shared/collections.js'

export function createGalSwarmHotStartSloContract(
  input: Omit<GalSwarmHotStartSloContract, 'schemaVersion' | 'note'> & { note?: string },
): GalSwarmHotStartSloContract {
  const contract: GalSwarmHotStartSloContract = {
    schemaVersion: GAL_SWARM_HOT_START_SLO_SCHEMA_VERSION,
    ...input,
    runnerLabels: uniqueStrings(input.runnerLabels),
    note: input.note ?? 'Millisecond dispatch is queue admission to already pre-warmed workers; cold VM or pod provisioning is outside the millisecond SLO.',
  }
  validateGalSwarmHotStartSloContract(contract)
  return contract
}

export function decideGalSwarmHotStartSlo(
  contract: GalSwarmHotStartSloContract,
  observation: GalSwarmHotStartObservation,
): GalSwarmHotStartSloDecision {
  validateGalSwarmHotStartSloContract(contract)
  validateGalSwarmHotStartObservation(observation)

  const warmCapacityAvailable = observation.warmIdleWorkers + observation.warmAllocatableWorkers
  const waveSize = Math.max(contract.desiredConcurrentSandboxes, contract.targetConcurrentSandboxes)
  const warmCapacityAfterAdmission = warmCapacityAvailable - waveSize
  const observedDispatchLatencyMs = observation.observedDispatchLatencyMs
  const latencyMeetsTarget =
    observedDispatchLatencyMs === undefined || observedDispatchLatencyMs <= contract.targetDispatchLatencyMs
  const canAbsorbWave = warmCapacityAvailable >= waveSize
  const desiredWarmPool = Math.min(contract.maxWarmWorkers, Math.max(contract.warmIdleTarget, waveSize))

  if (canAbsorbWave && warmCapacityAfterAdmission >= contract.warmIdleTarget && latencyMeetsTarget) {
    return hotStartDecision(contract, {
      action: 'dispatch_hot',
      warmCapacityAvailable,
      warmCapacityAfterAdmission,
      observedDispatchLatencyMs,
      confidence: observedDispatchLatencyMs === undefined ? 'medium' : 'high',
      reason: `Pre-warmed capacity can admit ${waveSize} sandboxes and preserve ${contract.warmIdleTarget} idle warm workers within the dispatch SLO.`,
    })
  }

  if (canAbsorbWave && desiredWarmPool <= contract.maxWarmWorkers && latencyMeetsTarget) {
    return hotStartDecision(contract, {
      action: 'scale_warm_pool',
      warmCapacityAvailable,
      warmCapacityAfterAdmission,
      observedDispatchLatencyMs,
      confidence: observedDispatchLatencyMs === undefined ? 'medium' : 'high',
      reason: `Pre-warmed capacity can admit ${waveSize} sandboxes, but warm spare capacity falls below target; scale the warm pool back toward ${desiredWarmPool}.`,
    })
  }

  return hotStartDecision(contract, {
    action: 'cold_provision',
    warmCapacityAvailable,
    warmCapacityAfterAdmission,
    observedDispatchLatencyMs,
    confidence: 'low',
    reason: canAbsorbWave
      ? `Observed dispatch latency does not meet the ${contract.targetDispatchLatencyMs}ms SLO; do not claim millisecond startup without fresh warm-runner evidence.`
      : `Only ${warmCapacityAvailable} warm workers are idle or allocatable for a ${waveSize}-sandbox wave; cold VM or pod provisioning is required and is outside the millisecond dispatch SLO.`,
  })
}

export function validateGalSwarmHotStartSloContract(contract: GalSwarmHotStartSloContract): void {
  if (contract.schemaVersion !== GAL_SWARM_HOT_START_SLO_SCHEMA_VERSION) {
    throw new Error(`Hot-start SLO schemaVersion must be ${GAL_SWARM_HOT_START_SLO_SCHEMA_VERSION}`)
  }
  if (!contract.sloId.trim()) throw new Error('Hot-start SLO sloId is required.')
  if (!Number.isFinite(contract.targetDispatchLatencyMs) || contract.targetDispatchLatencyMs <= 0) {
    throw new Error('Hot-start SLO targetDispatchLatencyMs must be positive.')
  }
  if (!Number.isFinite(contract.desiredConcurrentSandboxes) || contract.desiredConcurrentSandboxes <= 0) {
    throw new Error('Hot-start SLO desiredConcurrentSandboxes must be positive.')
  }
  if (!Number.isFinite(contract.targetConcurrentSandboxes) || contract.targetConcurrentSandboxes <= 0) {
    throw new Error('Hot-start SLO targetConcurrentSandboxes must be positive.')
  }
  if (contract.targetConcurrentSandboxes < contract.desiredConcurrentSandboxes) {
    throw new Error('Hot-start SLO targetConcurrentSandboxes must be greater than or equal to desiredConcurrentSandboxes.')
  }
  if (!Number.isFinite(contract.warmIdleTarget) || contract.warmIdleTarget < 0) {
    throw new Error('Hot-start SLO warmIdleTarget must be non-negative.')
  }
  if (!Number.isFinite(contract.minWarmWorkers) || contract.minWarmWorkers < 0) {
    throw new Error('Hot-start SLO minWarmWorkers must be non-negative.')
  }
  if (!Number.isFinite(contract.maxWarmWorkers) || contract.maxWarmWorkers < contract.minWarmWorkers) {
    throw new Error('Hot-start SLO maxWarmWorkers must be at least minWarmWorkers.')
  }
  if (contract.maxWarmWorkers < contract.targetConcurrentSandboxes + contract.warmIdleTarget) {
    throw new Error('Hot-start SLO maxWarmWorkers must cover targetConcurrentSandboxes plus warmIdleTarget for millisecond dispatch.')
  }
  if (contract.runnerLabels.length === 0 || contract.runnerLabels.some((label) => !label.trim())) {
    throw new Error('Hot-start SLO runnerLabels must include at least one non-empty runner label.')
  }
  if (!contract.ownership.githubRepository.trim()) throw new Error('Hot-start SLO ownership.githubRepository is required.')
  if (!contract.ownership.stratusService.trim()) throw new Error('Hot-start SLO ownership.stratusService is required.')
  if (!contract.ownership.gitopsPath.trim()) throw new Error('Hot-start SLO ownership.gitopsPath is required.')
  if (!contract.ownership.owner.trim()) throw new Error('Hot-start SLO ownership.owner is required.')
}

export function validateGalSwarmHotStartObservation(observation: GalSwarmHotStartObservation): void {
  const nonNegativeFields: Array<keyof GalSwarmHotStartObservation> = [
    'warmIdleWorkers',
    'warmAllocatableWorkers',
    'queuedSandboxes',
  ]
  for (const field of nonNegativeFields) {
    const value = observation[field]
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
      throw new Error(`Hot-start observation ${field} must be non-negative.`)
    }
  }
  if (
    observation.observedDispatchLatencyMs !== undefined &&
    (!Number.isFinite(observation.observedDispatchLatencyMs) || observation.observedDispatchLatencyMs < 0)
  ) {
    throw new Error('Hot-start observation observedDispatchLatencyMs must be non-negative.')
  }
}


function hotStartDecision(
  contract: GalSwarmHotStartSloContract,
  decision: Pick<
    GalSwarmHotStartSloDecision,
    | 'action'
    | 'warmCapacityAvailable'
    | 'warmCapacityAfterAdmission'
    | 'observedDispatchLatencyMs'
    | 'confidence'
    | 'reason'
  >,
): GalSwarmHotStartSloDecision {
  const withObservedLatency = decision.observedDispatchLatencyMs === undefined
    ? {}
    : { observedDispatchLatencyMs: decision.observedDispatchLatencyMs }

  return {
    schemaVersion: GAL_SWARM_HOT_START_SLO_SCHEMA_VERSION,
    sloId: contract.sloId,
    action: decision.action,
    targetDispatchLatencyMs: contract.targetDispatchLatencyMs,
    desiredConcurrentSandboxes: contract.desiredConcurrentSandboxes,
    targetConcurrentSandboxes: contract.targetConcurrentSandboxes,
    warmIdleTarget: contract.warmIdleTarget,
    minWarmWorkers: contract.minWarmWorkers,
    maxWarmWorkers: contract.maxWarmWorkers,
    runnerLabels: contract.runnerLabels,
    ownership: contract.ownership,
    warmCapacityAvailable: decision.warmCapacityAvailable,
    warmCapacityAfterAdmission: decision.warmCapacityAfterAdmission,
    ...withObservedLatency,
    confidence: decision.confidence,
    reason: decision.reason,
  }
}
