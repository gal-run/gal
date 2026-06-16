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

describe('GAL swarm wave evidence ledger contracts', () => {
  it('summarizes a complete 300-worker wave as ready for reconciliation and closeout', () => {
    const workers = Array.from({ length: 300 }, (_, index) => waveWorker(index + 1))
    const ledger = createGalSwarmWaveEvidenceLedger({
      waveId: 'wave-300',
      swarmId: 'swarm-ferrari',
      objective: 'Run 300 governed coding sandboxes.',
      riskLevel: 'medium',
      workers,
      closeoutCriteria: [
        {
          id: 'issue-proof',
          title: 'Issue proof is attached.',
          satisfied: true,
          artifactIds: ['proof-1'],
        },
      ],
    })
    const summary = summarizeGalSwarmWaveEvidence(ledger)

    expect(ledger.schemaVersion).toBe(GAL_SWARM_WAVE_EVIDENCE_LEDGER_SCHEMA_VERSION)
    expect(summary.workerCount).toBe(300)
    expect(summary.readyForReconciliation).toBe(true)
    expect(summary.readyForCloseout).toBe(true)
    expect(summary.blockers).toEqual([])
  })

  it('blocks closeout when worker evidence is missing', () => {
    const ledger = createGalSwarmWaveEvidenceLedger({
      waveId: 'wave-missing-proof',
      swarmId: 'swarm-ferrari',
      objective: 'Detect missing worker evidence.',
      riskLevel: 'medium',
      workers: [
        {
          ...waveWorker(1),
          proofArtifacts: [],
          runtimeEvidence: [],
        },
      ],
    })
    const summary = summarizeGalSwarmWaveEvidence(ledger)

    expect(summary.readyForReconciliation).toBe(false)
    expect(summary.readyForCloseout).toBe(false)
    expect(summary.missingEvidence).toEqual([
      {
        laneId: 'lane-worker-1',
        workerId: 'worker-1',
        missing: ['proof_artifact', 'runtime_evidence'],
      },
    ])
  })

  it('detects overlapping exclusive file leases across workers', () => {
    const ledger = createGalSwarmWaveEvidenceLedger({
      waveId: 'wave-lease-conflict',
      swarmId: 'swarm-ferrari',
      objective: 'Detect lease overlap.',
      riskLevel: 'medium',
      workers: [
        waveWorker(1, { repository: 'gal-run/gal-swarm', paths: ['src/swarm.ts'] }),
        waveWorker(2, { repository: 'gal-run/gal-swarm', paths: ['src'] }),
      ],
    })
    const conflicts = detectGalSwarmWaveLeaseConflicts(ledger)
    const summary = summarizeGalSwarmWaveEvidence(ledger)

    expect(conflicts).toEqual([
      {
        repository: 'gal-run/gal-swarm',
        path: 'src',
        laneIds: ['lane-worker-1', 'lane-worker-2'],
        workerIds: ['worker-1', 'worker-2'],
        leaseIndexes: [0, 1],
      },
    ])
    expect(summary.readyForCloseout).toBe(false)
    expect(summary.blockers[0]).toContain('conflicting lease gal-run/gal-swarm:src')
  })

  it('requires reconciler proof for high and critical risk waves', () => {
    const highRiskLedger = createGalSwarmWaveEvidenceLedger({
      waveId: 'wave-high-risk',
      swarmId: 'swarm-ferrari',
      objective: 'Require reconciler proof.',
      riskLevel: 'high',
      workers: [waveWorker(1)],
      reconcilerDecisions: [
        {
          id: 'reconcile-1',
          reconcilerLaneId: 'lane-reconciler',
          acceptedWorkerIds: ['worker-1'],
          proofArtifacts: [],
          readyForCloseout: true,
          summary: 'Accepted worker output without proof.',
        },
      ],
    })
    const blocked = summarizeGalSwarmWaveEvidence(highRiskLedger)

    expect(blocked.reconcilerProofRequired).toBe(true)
    expect(blocked.readyForCloseout).toBe(false)
    expect(blocked.blockers).toContain(
      'high/critical risk wave requires reconciler proof artifacts plus passing test and runtime evidence',
    )

    const criticalRiskLedger = createGalSwarmWaveEvidenceLedger({
      ...highRiskLedger,
      waveId: 'wave-critical-risk',
      riskLevel: 'critical',
      reconcilerDecisions: [
        {
          id: 'reconcile-1',
          reconcilerLaneId: 'lane-reconciler',
          acceptedWorkerIds: ['worker-1'],
          proofArtifacts: [
            {
              id: 'reconciler-proof',
              kind: 'pull_request',
              title: 'Merged reconciliation PR',
              uri: 'https://github.com/gal-run/gal-swarm/pull/1',
            },
          ],
          testEvidence: [
            {
              id: 'reconciler-test',
              command: 'npm test -- src/swarm.test.ts',
              status: 'passed',
            },
          ],
          runtimeEvidence: [
            {
              id: 'reconciler-runtime',
              target: 'dist/index.js',
              status: 'passed',
            },
          ],
          readyForCloseout: true,
          summary: 'Reconciled and verified.',
        },
      ],
    })

    expect(summarizeGalSwarmWaveEvidence(criticalRiskLedger)).toMatchObject({
      reconcilerProofRequired: true,
      hasReconcilerProof: true,
      readyForCloseout: true,
    })
  })
})
