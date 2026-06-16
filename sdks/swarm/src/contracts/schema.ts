/**
 * Stable schema and compatibility identifiers shared across GAL Swarm contracts.
 *
 * These values are deliberately versioned at the document boundary rather than
 * the package boundary so gal-api can persist older run records while newer
 * package versions continue to evolve implementation details.
 */

export const GAL_SWARM_PLAN_SCHEMA_VERSION = 'gal.swarm-plan.v1' as const
export const GAL_SWARM_LEASE_SCHEMA_VERSION = 'gal.swarm-worker-lease.v1' as const
export const GAL_SWARM_DECISION_SCHEMA_VERSION = 'gal.swarm-decision.v1' as const
export const GAL_SWARM_PREFLIGHT_SCHEMA_VERSION = 'gal.swarm-preflight.v1' as const
export const GAL_SWARM_HOT_START_SLO_SCHEMA_VERSION = 'gal.swarm-hot-start-slo.v1' as const
export const GAL_SWARM_WAVE_EVIDENCE_LEDGER_SCHEMA_VERSION = 'gal.swarm-wave-evidence-ledger.v1' as const
export const GAL_SWARM_WAVE_LEDGER_EVENT_SCHEMA_VERSION = 'gal.swarm-wave-ledger-event.v1' as const
export const GAL_SWARM_TOPOLOGY_SCHEMA_VERSION = 'gal.swarm-topology.v1' as const
export const GAL_SWARM_MAX_WAVE_SANDBOXES = 300 as const
