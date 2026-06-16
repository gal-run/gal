import {
  GAL_SWARM_MAX_WAVE_SANDBOXES,
  GAL_SWARM_WAVE_EVIDENCE_LEDGER_SCHEMA_VERSION,
  GAL_SWARM_WAVE_LEDGER_EVENT_SCHEMA_VERSION,
} from './schema.js'
import type { GalSwarmLaneRole, GalSwarmRiskLevel } from './topology.js'

/**
 * Evidence ledger contracts for large governed waves.
 *
 * Worker evidence alone is not enough for closeout on risky work. Reconciler
 * decisions, proof artifacts, tests, runtime evidence, and conflict state stay
 * explicit so gal-api can gate run status without reading worker prose.
 */

export type GalSwarmWaveArtifactKind =
  | 'diff'
  | 'commit'
  | 'pull_request'
  | 'issue_comment'
  | 'log'
  | 'screenshot'
  | 'trace'
  | 'note'
  | 'other'

export type GalSwarmWaveEvidenceStatus = 'passed' | 'failed' | 'skipped' | 'blocked'
export type GalSwarmWaveConflictSeverity = 'warning' | 'blocker'
export type GalSwarmWaveConflictStatus = 'open' | 'resolved' | 'accepted'

export const GAL_SWARM_WAVE_LEDGER_EVENT_TYPES = [
  'wave.started',
  'wave.completed',
  'wave.canceled',
  'lease.requested',
  'lease.acquired',
  'lease.renewed',
  'lease.released',
  'worker.assigned',
  'task.dispatched',
  'task.transitioned',
  'artifact.recorded',
  'evidence.recorded',
] as const

export type GalSwarmWaveLedgerEventType = (typeof GAL_SWARM_WAVE_LEDGER_EVENT_TYPES)[number]

export interface GalSwarmWaveFileLease {
  repository: string
  paths: string[]
  exclusive?: boolean
  reason?: string
}

export interface GalSwarmWaveProofArtifact {
  id: string
  kind: GalSwarmWaveArtifactKind
  title: string
  uri?: string
  sha?: string
  metadata?: Record<string, unknown>
}

export interface GalSwarmWaveTestEvidence {
  id: string
  command: string
  status: GalSwarmWaveEvidenceStatus
  artifactIds?: string[]
  summary?: string
}

export interface GalSwarmWaveRuntimeEvidence {
  id: string
  target: string
  status: GalSwarmWaveEvidenceStatus
  artifactIds?: string[]
  summary?: string
}

export interface GalSwarmWaveConflict {
  id: string
  severity: GalSwarmWaveConflictSeverity
  status: GalSwarmWaveConflictStatus
  laneIds: string[]
  workerIds: string[]
  repository?: string
  path?: string
  summary: string
}

export interface GalSwarmWaveWorkerEvidence {
  laneId: string
  workerId: string
  role: GalSwarmLaneRole
  riskLevel?: GalSwarmRiskLevel
  taskIds: string[]
  assignedRepositories: string[]
  fileLeases: GalSwarmWaveFileLease[]
  proofArtifacts: GalSwarmWaveProofArtifact[]
  testEvidence: GalSwarmWaveTestEvidence[]
  runtimeEvidence: GalSwarmWaveRuntimeEvidence[]
  conflicts?: GalSwarmWaveConflict[]
  readyForReconciliation?: boolean
  closeoutNotes?: string
}

export interface GalSwarmWaveReconcilerDecision {
  id: string
  reconcilerLaneId: string
  riskLevel?: GalSwarmRiskLevel
  acceptedWorkerIds: string[]
  rejectedWorkerIds?: string[]
  resolvedConflictIds?: string[]
  proofArtifacts: GalSwarmWaveProofArtifact[]
  testEvidence?: GalSwarmWaveTestEvidence[]
  runtimeEvidence?: GalSwarmWaveRuntimeEvidence[]
  readyForCloseout: boolean
  summary: string
}

export interface GalSwarmWaveCloseoutCriterion {
  id: string
  title: string
  satisfied: boolean
  artifactIds?: string[]
  summary?: string
}

export interface GalSwarmWaveEvidenceLedger {
  schemaVersion: typeof GAL_SWARM_WAVE_EVIDENCE_LEDGER_SCHEMA_VERSION
  waveId: string
  swarmId: string
  objective: string
  riskLevel: GalSwarmRiskLevel
  maxSandboxes: number
  createdAt: string
  workers: GalSwarmWaveWorkerEvidence[]
  reconcilerDecisions: GalSwarmWaveReconcilerDecision[]
  closeoutCriteria?: GalSwarmWaveCloseoutCriterion[]
  metadata?: Record<string, unknown>
}

export interface GalSwarmWaveMissingEvidence {
  laneId: string
  workerId: string
  missing: Array<'proof_artifact' | 'test_evidence' | 'runtime_evidence' | 'ready_for_reconciliation'>
}

export interface GalSwarmWaveLeaseConflict {
  repository: string
  path: string
  laneIds: string[]
  workerIds: string[]
  leaseIndexes: number[]
}

export interface GalSwarmWaveEvidenceSummary {
  schemaVersion: typeof GAL_SWARM_WAVE_EVIDENCE_LEDGER_SCHEMA_VERSION
  waveId: string
  workerCount: number
  maxSandboxes: number
  riskLevel: GalSwarmRiskLevel
  readyForReconciliation: boolean
  readyForCloseout: boolean
  missingEvidence: GalSwarmWaveMissingEvidence[]
  conflictingLeases: GalSwarmWaveLeaseConflict[]
  unresolvedConflicts: GalSwarmWaveConflict[]
  reconcilerProofRequired: boolean
  hasReconcilerProof: boolean
  blockers: string[]
}

/**
 * Portable event envelope for moving wave ledger events across products.
 *
 * gal-swarm owns the event shape because it owns wave/ledger semantics.
 * agent-network, gal-api, and runtime adapters should transport or persist
 * this envelope instead of redefining a parallel swarm event contract.
 */

export interface GalSwarmWaveLedgerEvidenceRef {
  id?: string
  url: string
  label?: string
  mediaType?: string
  sha256?: string
  metadata?: Record<string, unknown>
}

export interface GalSwarmWaveLedgerTaskMetadata {
  taskId?: string
  taskState?: string
  agentId?: string
  correlationId: string
  parentTaskId?: string
}

export interface GalSwarmWaveLedgerEventMetadata extends GalSwarmWaveLedgerTaskMetadata {
  waveId: string
  leaseId?: string
  workerId?: string
  eventType: GalSwarmWaveLedgerEventType
}

export interface GalSwarmWaveLedgerActorIdentity {
  id: string
  type?: string
  displayName?: string
  metadata?: Record<string, unknown>
}

export interface GalSwarmWaveLedgerArtifact {
  id: string
  name?: string
  kind?: string
  url?: string
  mediaType?: string
  sizeBytes?: number
  sha256?: string
  metadata?: Record<string, unknown>
}

export interface GalSwarmWaveLedgerTaskSnapshot {
  id?: string
  state?: string
  agentId?: string
  correlationId?: string
  parentTaskId?: string
  metadata?: Record<string, unknown>
}

export interface GalSwarmWaveLedgerEnvelope {
  schemaVersion: typeof GAL_SWARM_WAVE_LEDGER_EVENT_SCHEMA_VERSION
  id: string
  eventType: GalSwarmWaveLedgerEventType
  occurredAt: string
  waveId: string
  leaseId?: string
  workerId?: string
  task: GalSwarmWaveLedgerTaskMetadata
  actor?: GalSwarmWaveLedgerActorIdentity
  artifacts?: GalSwarmWaveLedgerArtifact[]
  evidence?: GalSwarmWaveLedgerEvidenceRef[]
  taskSnapshot?: GalSwarmWaveLedgerTaskSnapshot
  metadata?: Record<string, unknown>
}
