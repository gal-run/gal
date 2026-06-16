#!/usr/bin/env node
import {
  createGalSwarmProviderActionPlan,
  createGalSwarmRunPlan,
  decideGalSwarmCapacity,
} from '../../dist/index.js'

const TOPOLOGY_ALIASES = new Map([
  ['300-wave', 'wave-300-control-plane'],
  ['wave-300', 'wave-300-control-plane'],
  ['gal-swarm-300-wave', 'wave-300-control-plane'],
])

function acceptTopologyAlias(alias) {
  const topologyId = TOPOLOGY_ALIASES.get(alias)
  if (!topologyId) {
    throw new Error(`Unknown topology alias: ${alias}`)
  }
  return {
    accepted: true,
    alias,
    topologyId,
    workerWaves: 300,
    verifiers: ['dispatch-plan', 'evidence-ledger', 'closeout-gate'],
    reconciler: 'wave-status-reconciler',
  }
}

function createDispatchPlan(topology) {
  const runPlan = createGalSwarmRunPlan({
    orgName: 'gal-run',
    objective: 'Dry-run proof for the 300-wave GAL swarm control plane',
    source: 'gal-code',
    mode: 'dry-run',
    target: {
      provider: 'stratus',
      computeProfileId: 'runpod-h200-8x-dry-run',
      capacityPolicyProfile: 'large-burst',
      desiredWorkers: topology.workerWaves,
      desiredComputeUnits: 1,
      ttlHours: 1,
      maxHourlyUsd: 0.01,
      serverlessEndpointId: 'serverless-gal-code-fallback',
    },
    workload: {
      tasks: topology.workerWaves,
      promptTokens: 1_500_000,
      completionTokens: 600_000,
      toolCalls: 900,
      workflowWaitSeconds: 3_600,
      sandboxCount: topology.workerWaves,
    },
    questionnaire: {
      highLevelPrompt: 'Prove the 300-wave control plane in dry-run mode only.',
      successCriteria: [
        'Topology alias is accepted.',
        'Dispatch plan is generated without provider apply.',
        'Evidence ledger expects workers, verifiers, and reconciler entries.',
        'Closeout remains blocked when evidence is absent.',
      ],
      constraints: [
        'dry-run only',
        'no API route implementation',
        'no live cluster changes',
      ],
    },
    correlationId: `${topology.topologyId}-dry-run-proof`,
  })

  const capacityDecision = decideGalSwarmCapacity(runPlan, {
    activeWorkers: 0,
    queuedTokenSeconds: 60_000,
    tokensPerSecond: 0,
    latencyP95Ms: 120_000,
    gpuUtilizationPercent: 0,
    memoryUtilizationPercent: 0,
    activeTasks: 0,
    queuedTasks: topology.workerWaves,
    errorRatePercent: 0,
    providerHealthy: true,
    elapsedSeconds: 0,
    spendUsd: 0,
    idleSeconds: 0,
    serverlessFallbackHealthy: true,
  })

  return {
    runPlan,
    capacityDecision,
    providerActionPlan: createGalSwarmProviderActionPlan(runPlan, capacityDecision, 'noop-dry-run'),
    dispatch: {
      dryRun: true,
      topologyId: topology.topologyId,
      plannedWorkers: topology.workerWaves,
      plannedVerifiers: topology.verifiers,
      plannedReconciler: topology.reconciler,
    },
  }
}

function createEvidenceLedgerExpectation(topology, dispatchPlan) {
  return {
    ledgerId: `${topology.topologyId}-evidence`,
    dryRun: true,
    expected: {
      workers: dispatchPlan.dispatch.plannedWorkers,
      verifiers: dispatchPlan.dispatch.plannedVerifiers,
      reconciler: dispatchPlan.dispatch.plannedReconciler,
    },
    received: {
      workers: 0,
      verifiers: [],
      reconciler: null,
    },
  }
}

function evaluateCloseout(ledger) {
  const missing = []
  if (ledger.received.workers < ledger.expected.workers) {
    missing.push(`workers:${ledger.expected.workers - ledger.received.workers}`)
  }
  for (const verifier of ledger.expected.verifiers) {
    if (!ledger.received.verifiers.includes(verifier)) {
      missing.push(`verifier:${verifier}`)
    }
  }
  if (ledger.received.reconciler !== ledger.expected.reconciler) {
    missing.push(`reconciler:${ledger.expected.reconciler}`)
  }

  return {
    status: missing.length === 0 ? 'closeout-ready' : 'blocked',
    reason: missing.length === 0 ? 'all expected evidence is present' : 'missing expected dry-run evidence',
    missing,
  }
}

const alias = process.argv[2] ?? '300-wave'
const topology = acceptTopologyAlias(alias)
const dispatchPlan = createDispatchPlan(topology)
const ledger = createEvidenceLedgerExpectation(topology, dispatchPlan)
const closeout = evaluateCloseout(ledger)

const proof = {
  topology,
  dispatchPlan: {
    runId: dispatchPlan.runPlan.runId,
    mode: dispatchPlan.runPlan.mode,
    status: dispatchPlan.runPlan.status,
    plannedWorkers: dispatchPlan.dispatch.plannedWorkers,
    providerExecutorMode: dispatchPlan.providerActionPlan.executorMode,
    providerOperationDryRun: dispatchPlan.providerActionPlan.operation.dryRun,
    canApply: dispatchPlan.providerActionPlan.canApply,
    command: dispatchPlan.providerActionPlan.operation.command,
  },
  evidenceLedger: ledger,
  closeout,
}

if (!proof.topology.accepted) throw new Error('Topology alias was not accepted.')
if (proof.dispatchPlan.mode !== 'dry-run') throw new Error('Dispatch plan is not dry-run.')
if (proof.dispatchPlan.canApply) throw new Error('Dry-run dispatch plan became apply-capable.')
if (!proof.dispatchPlan.providerOperationDryRun) throw new Error('Provider operation is not marked dry-run.')
if (proof.evidenceLedger.expected.workers !== 300) throw new Error('Evidence ledger does not expect 300 workers.')
if (proof.closeout.status !== 'blocked') throw new Error('Closeout should remain blocked without evidence.')

console.log(JSON.stringify(proof, null, 2))
