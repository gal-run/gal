import {
  GAL_SWARM_LANE_ROLES,
  GAL_SWARM_MAX_WAVE_SANDBOXES,
  GAL_SWARM_RISK_LEVELS,
  GAL_SWARM_WAVE_EVIDENCE_LEDGER_SCHEMA_VERSION,
  GAL_SWARM_WAVE_LEDGER_EVENT_SCHEMA_VERSION,
  GAL_SWARM_WAVE_LEDGER_EVENT_TYPES,
  type GalSwarmWaveConflict,
  type GalSwarmWaveEvidenceLedger,
  type GalSwarmWaveLedgerEnvelope,
  type GalSwarmWaveLedgerEventType,
  type GalSwarmWaveLedgerTaskMetadata,
  type GalSwarmWaveEvidenceSummary,
  type GalSwarmWaveLeaseConflict,
  type GalSwarmWaveMissingEvidence,
  type GalSwarmWaveProofArtifact,
  type GalSwarmWaveReconcilerDecision,
  type GalSwarmWaveRuntimeEvidence,
  type GalSwarmWaveTestEvidence,
  type GalSwarmWaveWorkerEvidence,
} from '../contracts.js'
import { uniqueStrings } from '../shared/collections.js'
import { highestGalSwarmRiskLevel, riskRank } from '../shared/risk.js'

export function createGalSwarmWaveEvidenceLedger(
  input: Omit<GalSwarmWaveEvidenceLedger, 'schemaVersion' | 'maxSandboxes' | 'createdAt' | 'reconcilerDecisions'> & {
    schemaVersion?: typeof GAL_SWARM_WAVE_EVIDENCE_LEDGER_SCHEMA_VERSION
    maxSandboxes?: number
    createdAt?: string
    reconcilerDecisions?: GalSwarmWaveReconcilerDecision[]
  },
): GalSwarmWaveEvidenceLedger {
  const ledger: GalSwarmWaveEvidenceLedger = {
    schemaVersion: GAL_SWARM_WAVE_EVIDENCE_LEDGER_SCHEMA_VERSION,
    ...input,
    waveId: input.waveId.trim(),
    swarmId: input.swarmId.trim(),
    objective: input.objective.trim(),
    maxSandboxes: input.maxSandboxes ?? GAL_SWARM_MAX_WAVE_SANDBOXES,
    createdAt: input.createdAt ?? new Date().toISOString(),
    workers: input.workers.map(normalizeGalSwarmWaveWorkerEvidence),
    reconcilerDecisions: (input.reconcilerDecisions ?? []).map(normalizeGalSwarmReconcilerDecision),
  }
  validateGalSwarmWaveEvidenceLedger(ledger)
  return ledger
}

export function summarizeGalSwarmWaveEvidence(
  ledger: GalSwarmWaveEvidenceLedger,
): GalSwarmWaveEvidenceSummary {
  validateGalSwarmWaveEvidenceLedger(ledger)

  const missingEvidence = findGalSwarmWaveMissingEvidence(ledger)
  const conflictingLeases = detectGalSwarmWaveLeaseConflicts(ledger)
  const explicitConflicts = ledger.workers.flatMap((worker) => worker.conflicts ?? [])
  const resolvedConflictIds = new Set(ledger.reconcilerDecisions.flatMap((decision) => decision.resolvedConflictIds ?? []))
  const unresolvedConflicts = explicitConflicts.filter((conflict) =>
    conflict.severity === 'blocker' &&
    conflict.status === 'open' &&
    !resolvedConflictIds.has(conflict.id),
  )
  const effectiveRiskLevel = highestGalSwarmRiskLevel([
    ledger.riskLevel,
    ...ledger.workers.map((worker) => worker.riskLevel),
    ...ledger.reconcilerDecisions.map((decision) => decision.riskLevel),
  ])
  const reconcilerProofRequired = riskRank(effectiveRiskLevel) >= riskRank('high')
  const hasReconcilerProof = ledger.reconcilerDecisions.some((decision) =>
    decision.readyForCloseout &&
    decision.proofArtifacts.length > 0 &&
    hasPassingEvidence(decision.testEvidence ?? []) &&
    hasPassingEvidence(decision.runtimeEvidence ?? []),
  )
  const closeoutCriteriaMissing = (ledger.closeoutCriteria ?? []).filter((criterion) => !criterion.satisfied)
  const readyForReconciliation =
    ledger.workers.length > 0 &&
    missingEvidence.length === 0 &&
    conflictingLeases.length === 0 &&
    unresolvedConflicts.length === 0
  const readyForCloseout =
    readyForReconciliation &&
    closeoutCriteriaMissing.length === 0 &&
    (!reconcilerProofRequired || hasReconcilerProof) &&
    (ledger.reconcilerDecisions.length === 0 || ledger.reconcilerDecisions.some((decision) => decision.readyForCloseout))

  const blockers = [
    ...missingEvidence.map((entry) =>
      `${entry.workerId}/${entry.laneId} missing ${entry.missing.join(', ')}`,
    ),
    ...conflictingLeases.map((entry) =>
      `conflicting lease ${entry.repository}:${entry.path} held by ${entry.workerIds.join(', ')}`,
    ),
    ...unresolvedConflicts.map((entry) => `unresolved conflict ${entry.id}: ${entry.summary}`),
    ...closeoutCriteriaMissing.map((entry) => `closeout criterion ${entry.id} is unsatisfied`),
  ]

  if (reconcilerProofRequired && !hasReconcilerProof) {
    blockers.push('high/critical risk wave requires reconciler proof artifacts plus passing test and runtime evidence')
  }

  return {
    schemaVersion: GAL_SWARM_WAVE_EVIDENCE_LEDGER_SCHEMA_VERSION,
    waveId: ledger.waveId,
    workerCount: ledger.workers.length,
    maxSandboxes: ledger.maxSandboxes,
    riskLevel: effectiveRiskLevel,
    readyForReconciliation,
    readyForCloseout,
    missingEvidence,
    conflictingLeases,
    unresolvedConflicts,
    reconcilerProofRequired,
    hasReconcilerProof,
    blockers,
  }
}

export function detectGalSwarmWaveLeaseConflicts(
  ledger: Pick<GalSwarmWaveEvidenceLedger, 'workers'>,
): GalSwarmWaveLeaseConflict[] {
  const claims: Array<{
    repository: string
    path: string
    laneId: string
    workerId: string
    leaseIndex: number
  }> = []

  ledger.workers.forEach((worker) => {
    worker.fileLeases.forEach((lease) => {
      if (lease.exclusive === false) return
      for (const rawPath of lease.paths) {
        const path = normalizeGalSwarmLeasePath(rawPath)
        if (!lease.repository.trim() || !path) continue
        claims.push({
          repository: lease.repository.trim(),
          path,
          laneId: worker.laneId,
          workerId: worker.workerId,
          leaseIndex: claims.length,
        })
      }
    })
  })

  const conflicts = new Map<string, GalSwarmWaveLeaseConflict>()
  for (let index = 0; index < claims.length; index += 1) {
    const left = claims[index]
    for (let peerIndex = index + 1; peerIndex < claims.length; peerIndex += 1) {
      const right = claims[peerIndex]
      if (left.workerId === right.workerId) continue
      if (left.repository !== right.repository) continue
      const overlappingPath = overlappingGalSwarmLeasePath(left.path, right.path)
      if (!overlappingPath) continue

      const key = `${left.repository}:${overlappingPath}`
      const existing = conflicts.get(key)
      conflicts.set(key, {
        repository: left.repository,
        path: overlappingPath,
        laneIds: uniqueStrings([...(existing?.laneIds ?? []), left.laneId, right.laneId]),
        workerIds: uniqueStrings([...(existing?.workerIds ?? []), left.workerId, right.workerId]),
        leaseIndexes: [...new Set([...(existing?.leaseIndexes ?? []), left.leaseIndex, right.leaseIndex])],
      })
    }
  }

  return [...conflicts.values()].sort((a, b) =>
    a.repository.localeCompare(b.repository) || a.path.localeCompare(b.path),
  )
}

export function isGalSwarmWaveLedgerEventType(value: unknown): value is GalSwarmWaveLedgerEventType {
  return (
    typeof value === 'string' &&
    GAL_SWARM_WAVE_LEDGER_EVENT_TYPES.includes(value as GalSwarmWaveLedgerEventType)
  )
}

export function buildGalSwarmWaveLedgerTaskMetadata(
  task: {
    id?: string
    state?: string
    agentId?: string
    correlationId: string
    parentTaskId?: string
  },
): GalSwarmWaveLedgerTaskMetadata {
  return {
    taskId: task.id?.trim() || undefined,
    taskState: task.state?.trim() || undefined,
    agentId: task.agentId?.trim() || undefined,
    correlationId: task.correlationId.trim(),
    parentTaskId: task.parentTaskId?.trim() || undefined,
  }
}

export function createGalSwarmWaveLedgerEnvelope(
  input: Omit<GalSwarmWaveLedgerEnvelope, 'schemaVersion' | 'occurredAt'> & {
    schemaVersion?: typeof GAL_SWARM_WAVE_LEDGER_EVENT_SCHEMA_VERSION
    occurredAt?: string
  },
): GalSwarmWaveLedgerEnvelope {
  const envelope: GalSwarmWaveLedgerEnvelope = {
    schemaVersion: GAL_SWARM_WAVE_LEDGER_EVENT_SCHEMA_VERSION,
    ...input,
    id: input.id.trim(),
    waveId: input.waveId.trim(),
    leaseId: input.leaseId?.trim() || undefined,
    workerId: input.workerId?.trim() || undefined,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    task: {
      ...input.task,
      taskId: input.task.taskId?.trim() || undefined,
      taskState: input.task.taskState?.trim() || undefined,
      agentId: input.task.agentId?.trim() || undefined,
      correlationId: input.task.correlationId.trim(),
      parentTaskId: input.task.parentTaskId?.trim() || undefined,
    },
  }
  validateGalSwarmWaveLedgerEnvelope(envelope)
  return envelope
}

export function validateGalSwarmWaveLedgerEnvelope(envelope: GalSwarmWaveLedgerEnvelope): void {
  if (envelope.schemaVersion !== GAL_SWARM_WAVE_LEDGER_EVENT_SCHEMA_VERSION) {
    throw new Error(`Wave ledger event schemaVersion must be ${GAL_SWARM_WAVE_LEDGER_EVENT_SCHEMA_VERSION}`)
  }
  if (!envelope.id.trim()) throw new Error('Wave ledger event id is required.')
  if (!isGalSwarmWaveLedgerEventType(envelope.eventType)) {
    throw new Error(`Invalid wave ledger event type: ${envelope.eventType}`)
  }
  if (!envelope.occurredAt.trim()) throw new Error('Wave ledger event occurredAt is required.')
  if (!envelope.waveId.trim()) throw new Error('Wave ledger event waveId is required.')
  if (!envelope.task.correlationId.trim()) throw new Error('Wave ledger event task.correlationId is required.')
}

export function validateGalSwarmWaveEvidenceLedger(ledger: GalSwarmWaveEvidenceLedger): void {
  if (ledger.schemaVersion !== GAL_SWARM_WAVE_EVIDENCE_LEDGER_SCHEMA_VERSION) {
    throw new Error(`Wave evidence ledger schemaVersion must be ${GAL_SWARM_WAVE_EVIDENCE_LEDGER_SCHEMA_VERSION}`)
  }
  if (!ledger.waveId.trim()) throw new Error('Wave evidence ledger waveId is required.')
  if (!ledger.swarmId.trim()) throw new Error('Wave evidence ledger swarmId is required.')
  if (!ledger.objective.trim()) throw new Error('Wave evidence ledger objective is required.')
  if (!GAL_SWARM_RISK_LEVELS.includes(ledger.riskLevel)) {
    throw new Error(`Invalid wave evidence ledger risk level: ${ledger.riskLevel}`)
  }
  if (!Number.isInteger(ledger.maxSandboxes) || ledger.maxSandboxes <= 0) {
    throw new Error('Wave evidence ledger maxSandboxes must be a positive integer.')
  }
  if (ledger.maxSandboxes > GAL_SWARM_MAX_WAVE_SANDBOXES) {
    throw new Error(`Wave evidence ledger maxSandboxes cannot exceed ${GAL_SWARM_MAX_WAVE_SANDBOXES}.`)
  }
  if (ledger.workers.length > ledger.maxSandboxes) {
    throw new Error(`Wave evidence ledger cannot include more than ${ledger.maxSandboxes} workers.`)
  }
  const seenWorkers = new Set<string>()
  for (const worker of ledger.workers) {
    if (!worker.laneId.trim()) throw new Error('Wave evidence worker laneId is required.')
    if (!worker.workerId.trim()) throw new Error('Wave evidence worker workerId is required.')
    if (seenWorkers.has(worker.workerId)) throw new Error(`Duplicate wave evidence workerId: ${worker.workerId}`)
    seenWorkers.add(worker.workerId)
    if (!GAL_SWARM_LANE_ROLES.includes(worker.role)) throw new Error(`Invalid wave evidence worker role: ${worker.role}`)
    if (worker.riskLevel && !GAL_SWARM_RISK_LEVELS.includes(worker.riskLevel)) {
      throw new Error(`Invalid wave evidence worker risk level: ${worker.riskLevel}`)
    }
    for (const lease of worker.fileLeases) {
      if (!lease.repository.trim()) throw new Error(`Wave evidence worker ${worker.workerId} has a blank file lease repository.`)
      if (lease.paths.length === 0) throw new Error(`Wave evidence worker ${worker.workerId} has an empty file lease.`)
    }
  }
}

function normalizeGalSwarmWaveWorkerEvidence(worker: GalSwarmWaveWorkerEvidence): GalSwarmWaveWorkerEvidence {
  return {
    ...worker,
    laneId: worker.laneId.trim(),
    workerId: worker.workerId.trim(),
    taskIds: uniqueStrings(worker.taskIds),
    assignedRepositories: uniqueStrings(worker.assignedRepositories),
    fileLeases: worker.fileLeases.map((lease) => ({
      ...lease,
      repository: lease.repository.trim(),
      paths: uniqueStrings(lease.paths.map(normalizeGalSwarmLeasePath)),
      exclusive: lease.exclusive ?? true,
      reason: lease.reason?.trim() || undefined,
    })),
    proofArtifacts: worker.proofArtifacts.map(normalizeGalSwarmProofArtifact),
    testEvidence: worker.testEvidence.map(normalizeGalSwarmEvidenceRecord),
    runtimeEvidence: worker.runtimeEvidence.map(normalizeGalSwarmEvidenceRecord),
    conflicts: worker.conflicts?.map(normalizeGalSwarmConflict),
    closeoutNotes: worker.closeoutNotes?.trim() || undefined,
  }
}

function normalizeGalSwarmReconcilerDecision(
  decision: GalSwarmWaveReconcilerDecision,
): GalSwarmWaveReconcilerDecision {
  return {
    ...decision,
    id: decision.id.trim(),
    reconcilerLaneId: decision.reconcilerLaneId.trim(),
    acceptedWorkerIds: uniqueStrings(decision.acceptedWorkerIds),
    rejectedWorkerIds: uniqueStrings(decision.rejectedWorkerIds ?? []),
    resolvedConflictIds: uniqueStrings(decision.resolvedConflictIds ?? []),
    proofArtifacts: decision.proofArtifacts.map(normalizeGalSwarmProofArtifact),
    testEvidence: decision.testEvidence?.map(normalizeGalSwarmEvidenceRecord),
    runtimeEvidence: decision.runtimeEvidence?.map(normalizeGalSwarmEvidenceRecord),
    summary: decision.summary.trim(),
  }
}

function normalizeGalSwarmProofArtifact(artifact: GalSwarmWaveProofArtifact): GalSwarmWaveProofArtifact {
  return {
    ...artifact,
    id: artifact.id.trim(),
    title: artifact.title.trim(),
    uri: artifact.uri?.trim() || undefined,
    sha: artifact.sha?.trim() || undefined,
  }
}

function normalizeGalSwarmEvidenceRecord<T extends GalSwarmWaveTestEvidence | GalSwarmWaveRuntimeEvidence>(
  evidence: T,
): T {
  return {
    ...evidence,
    id: evidence.id.trim(),
    artifactIds: uniqueStrings(evidence.artifactIds ?? []),
    summary: evidence.summary?.trim() || undefined,
  }
}

function normalizeGalSwarmConflict(conflict: GalSwarmWaveConflict): GalSwarmWaveConflict {
  return {
    ...conflict,
    id: conflict.id.trim(),
    laneIds: uniqueStrings(conflict.laneIds),
    workerIds: uniqueStrings(conflict.workerIds),
    repository: conflict.repository?.trim() || undefined,
    path: conflict.path ? normalizeGalSwarmLeasePath(conflict.path) : undefined,
    summary: conflict.summary.trim(),
  }
}

function findGalSwarmWaveMissingEvidence(ledger: GalSwarmWaveEvidenceLedger): GalSwarmWaveMissingEvidence[] {
  return ledger.workers
    .map((worker) => {
      const missing: GalSwarmWaveMissingEvidence['missing'] = []
      if (worker.proofArtifacts.length === 0) missing.push('proof_artifact')
      if (!hasPassingEvidence(worker.testEvidence)) missing.push('test_evidence')
      if (!hasPassingEvidence(worker.runtimeEvidence)) missing.push('runtime_evidence')
      if (worker.readyForReconciliation === false) missing.push('ready_for_reconciliation')
      return {
        laneId: worker.laneId,
        workerId: worker.workerId,
        missing,
      }
    })
    .filter((entry) => entry.missing.length > 0)
}

function hasPassingEvidence(evidence: Array<GalSwarmWaveTestEvidence | GalSwarmWaveRuntimeEvidence>): boolean {
  return evidence.some((entry) => entry.status === 'passed')
}

function normalizeGalSwarmLeasePath(path: string): string {
  return path.trim().replace(/\\/g, '/').replace(/^\.\/+/, '').replace(/\/+/g, '/')
}

function overlappingGalSwarmLeasePath(left: string, right: string): string | undefined {
  if (left === right) return left
  const leftPrefix = left.endsWith('/') ? left : `${left}/`
  const rightPrefix = right.endsWith('/') ? right : `${right}/`
  if (right.startsWith(leftPrefix)) return left
  if (left.startsWith(rightPrefix)) return right
  return undefined
}
