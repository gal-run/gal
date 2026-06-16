/**
 * Portable wave-ledger event contract.
 *
 * This is the self-contained, in-repo definition of the swarm wave-ledger
 * event envelope: the schema-version constant, the event-type catalog, the
 * envelope/metadata types, and the small set of zero-dependency builder,
 * validator, and type-guard helpers used to move wave-ledger events across
 * transports.
 *
 * The wave-ledger event shape originates with GAL Swarm wave/ledger semantics;
 * `@gal-run/agent-network` transports and persists this envelope. The contract
 * is reproduced here (plain TypeScript, near-zero runtime) so the public
 * package builds and tests standalone without an external swarm dependency.
 */

export const GAL_SWARM_WAVE_LEDGER_EVENT_SCHEMA_VERSION = 'gal.swarm-wave-ledger-event.v1'

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

export interface GalSwarmWaveLedgerTaskSource {
  id?: string
  state?: string
  agentId?: string
  correlationId: string
  parentTaskId?: string
}

export interface GalSwarmWaveLedgerEnvelopeInput {
  id: string
  eventType: GalSwarmWaveLedgerEventType
  occurredAt?: string
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

const GAL_SWARM_WAVE_LEDGER_EVENT_TYPE_VALUES = new Set<string>(GAL_SWARM_WAVE_LEDGER_EVENT_TYPES)

export function isGalSwarmWaveLedgerEventType(value: unknown): value is GalSwarmWaveLedgerEventType {
  return typeof value === 'string' && GAL_SWARM_WAVE_LEDGER_EVENT_TYPE_VALUES.has(value)
}

export function buildGalSwarmWaveLedgerTaskMetadata(
  task: GalSwarmWaveLedgerTaskSource,
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
  input: GalSwarmWaveLedgerEnvelopeInput,
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
    throw new Error(
      `Wave ledger event schemaVersion must be ${GAL_SWARM_WAVE_LEDGER_EVENT_SCHEMA_VERSION}`,
    )
  }
  if (!envelope.id.trim()) throw new Error('Wave ledger event id is required.')
  if (!isGalSwarmWaveLedgerEventType(envelope.eventType)) {
    throw new Error(`Invalid wave ledger event type: ${envelope.eventType}`)
  }
  if (!envelope.occurredAt.trim()) throw new Error('Wave ledger event occurredAt is required.')
  if (!envelope.waveId.trim()) throw new Error('Wave ledger event waveId is required.')
  if (!envelope.task.correlationId.trim()) {
    throw new Error('Wave ledger event task.correlationId is required.')
  }
}
