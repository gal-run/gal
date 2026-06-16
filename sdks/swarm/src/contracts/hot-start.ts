import { GAL_SWARM_HOT_START_SLO_SCHEMA_VERSION } from './schema.js'

/**
 * Hot-start SLO contracts describe already-warm sandbox capacity.
 *
 * They do not prove cold VM or pod startup. The SLO only holds when the warm
 * pool has enough idle or allocatable workers to absorb the requested wave.
 */

export const GAL_SWARM_HOT_START_ACTIONS = [
  'dispatch_hot',
  'scale_warm_pool',
  'cold_provision',
] as const

export type GalSwarmHotStartAction = (typeof GAL_SWARM_HOT_START_ACTIONS)[number]

export const GAL_SWARM_HOT_START_CONFIDENCE_LEVELS = ['low', 'medium', 'high'] as const

export type GalSwarmHotStartConfidence = (typeof GAL_SWARM_HOT_START_CONFIDENCE_LEVELS)[number]

export interface GalSwarmHotStartOwnership {
  githubRepository: string
  stratusService: string
  gitopsPath: string
  owner: string
}

export interface GalSwarmHotStartSloContract {
  schemaVersion: typeof GAL_SWARM_HOT_START_SLO_SCHEMA_VERSION
  sloId: string
  targetDispatchLatencyMs: number
  desiredConcurrentSandboxes: number
  targetConcurrentSandboxes: number
  warmIdleTarget: number
  minWarmWorkers: number
  maxWarmWorkers: number
  runnerLabels: string[]
  ownership: GalSwarmHotStartOwnership
  note: string
}

export interface GalSwarmHotStartObservation {
  warmIdleWorkers: number
  warmAllocatableWorkers: number
  queuedSandboxes: number
  observedDispatchLatencyMs?: number
}

export interface GalSwarmHotStartSloDecision {
  schemaVersion: typeof GAL_SWARM_HOT_START_SLO_SCHEMA_VERSION
  sloId: string
  action: GalSwarmHotStartAction
  targetDispatchLatencyMs: number
  desiredConcurrentSandboxes: number
  targetConcurrentSandboxes: number
  warmIdleTarget: number
  minWarmWorkers: number
  maxWarmWorkers: number
  runnerLabels: string[]
  ownership: GalSwarmHotStartOwnership
  warmCapacityAvailable: number
  warmCapacityAfterAdmission: number
  observedDispatchLatencyMs?: number
  confidence: GalSwarmHotStartConfidence
  reason: string
}
