/**
 * Compatibility export for network consumers.
 *
 * The portable wave-ledger event contract lives in
 * `./gal-swarm-wave-ledger-contract.js`; agent-network keeps this path as a
 * transport-facing adapter so existing imports do not fork the event schema.
 */

export {
  GAL_SWARM_WAVE_LEDGER_EVENT_SCHEMA_VERSION,
  GAL_SWARM_WAVE_LEDGER_EVENT_TYPES,
  buildGalSwarmWaveLedgerTaskMetadata,
  createGalSwarmWaveLedgerEnvelope,
  isGalSwarmWaveLedgerEventType,
  validateGalSwarmWaveLedgerEnvelope,
} from './gal-swarm-wave-ledger-contract.js'

export type {
  GalSwarmWaveLedgerActorIdentity,
  GalSwarmWaveLedgerArtifact,
  GalSwarmWaveLedgerEnvelope,
  GalSwarmWaveLedgerEventMetadata,
  GalSwarmWaveLedgerEventType,
  GalSwarmWaveLedgerEvidenceRef,
  GalSwarmWaveLedgerTaskMetadata,
  GalSwarmWaveLedgerTaskSnapshot,
} from './gal-swarm-wave-ledger-contract.js'
