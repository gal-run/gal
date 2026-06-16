import { describe, expect, it } from 'vitest'
import { execFileSync } from 'node:child_process'

import {
  GAL_SWARM_DECISION_SCHEMA_VERSION,
  GAL_SWARM_HOT_START_SLO_SCHEMA_VERSION,
  GAL_SWARM_ORCHESTRATION_MODES,
  GAL_SWARM_PLAN_SCHEMA_VERSION,
  GAL_SWARM_PUBLIC_TOPOLOGY_MODES,
  GAL_SWARM_TOPOLOGY_SCHEMA_VERSION,
  GAL_SWARM_TOPOLOGY_MODE_MAPPINGS,
  GAL_SWARM_WAVE_EVIDENCE_LEDGER_SCHEMA_VERSION,
  buildGalSwarmLoadFromForecast,
  calculateGalSwarmEffectiveUtilization,
  calculateGalSwarmPressure,
  createGalSwarmHotStartSloContract,
  createGalSwarmCalibrationSummary,
  createGalSwarmProviderActionPlan,
  createGalSwarmRunPlan,
  createGalSwarmTopologyPlan,
  createGalSwarmWaveEvidenceLedger,
  defaultGalSwarmPreflightComputeProfiles,
  defaultGalSwarmProviderIntegrationProfiles,
  decideGalSwarmHotStartSlo,
  decideGalSwarmCapacity,
  detectGalSwarmWaveLeaseConflicts,
  evaluateGalSwarmBurstPreflight,
  formatGalSwarmTopologyAliasHelp,
  highestRunnablePriority,
  listGalSwarmTopologyAliases,
  normalizeGalSwarmTopologyMode,
  orderGalSwarmTopologyTasks,
  planGalSwarmDecision,
  planGalSwarmDecisionFromForecast,
  rankGalSwarmProviders,
  routeGalSwarmTopology,
  scoreGalSwarmFleetPlacement,
  selectGalSwarmProvider,
  summarizeGalSwarmWaveEvidence,
  validateGalSwarmPlan,
  type GalSwarmCostSnapshot,
  type GalSwarmExecutionForecastInput,
  type GalSwarmFleetNode,
  type GalSwarmLoadSnapshot,
  type GalSwarmPlan,
  type GalSwarmProviderCandidate,
  type GalSwarmTopologyRequest,
  type GalSwarmWaveWorkerEvidence,
} from './swarm.js'
import {
  baseCost,
  baseForecast,
  baseLoad,
  basePlan,
  hotStartContract,
  h200Candidates,
  h200Plan,
  planWithServerlessFallback,
  topologyFleet,
  topologyRequest,
  topologyTask,
  waveWorker,
} from './test-support/swarm-fixtures.js'

describe('GAL swarm hot-start SLO contracts', () => {
  it('dispatches a 300-sandbox wave through already warm capacity', () => {
    const decision = decideGalSwarmHotStartSlo(hotStartContract(), {
      warmIdleWorkers: 340,
      warmAllocatableWorkers: 20,
      queuedSandboxes: 300,
      observedDispatchLatencyMs: 180,
    })

    expect(decision).toEqual(expect.objectContaining({
      schemaVersion: GAL_SWARM_HOT_START_SLO_SCHEMA_VERSION,
      action: 'dispatch_hot',
      desiredConcurrentSandboxes: 300,
      targetConcurrentSandboxes: 300,
      targetDispatchLatencyMs: 500,
      warmCapacityAvailable: 360,
      warmCapacityAfterAdmission: 60,
      confidence: 'high',
    }))
    expect(decision.reason).toContain('Pre-warmed capacity can admit 300 sandboxes')
  })

  it('scales the warm pool when a 300-sandbox wave consumes spare capacity', () => {
    const decision = decideGalSwarmHotStartSlo(hotStartContract(), {
      warmIdleWorkers: 260,
      warmAllocatableWorkers: 60,
      queuedSandboxes: 300,
      observedDispatchLatencyMs: 220,
    })

    expect(decision).toEqual(expect.objectContaining({
      action: 'scale_warm_pool',
      warmCapacityAvailable: 320,
      warmCapacityAfterAdmission: 20,
      confidence: 'high',
    }))
    expect(decision.reason).toContain('warm spare capacity falls below target')
  })

  it('falls back to cold provisioning when hot capacity cannot absorb a 300-sandbox wave', () => {
    const decision = decideGalSwarmHotStartSlo(hotStartContract(), {
      warmIdleWorkers: 120,
      warmAllocatableWorkers: 80,
      queuedSandboxes: 300,
      observedDispatchLatencyMs: 450,
    })

    expect(decision).toEqual(expect.objectContaining({
      action: 'cold_provision',
      warmCapacityAvailable: 200,
      warmCapacityAfterAdmission: -100,
      confidence: 'low',
    }))
    expect(decision.reason).toContain('cold VM or pod provisioning is required')
    expect(decision.reason).toContain('outside the millisecond dispatch SLO')
  })

  it('rejects invalid hot-start SLO configuration that cannot make millisecond dispatch true', () => {
    expect(() => createGalSwarmHotStartSloContract({
      ...hotStartContract(),
      maxWarmWorkers: 300,
    })).toThrow('maxWarmWorkers must cover targetConcurrentSandboxes plus warmIdleTarget')

    expect(() => decideGalSwarmHotStartSlo(hotStartContract(), {
      warmIdleWorkers: -1,
      warmAllocatableWorkers: 0,
      queuedSandboxes: 300,
    })).toThrow('warmIdleWorkers must be non-negative')
  })
})
