#!/usr/bin/env node
import { spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { performance } from 'node:perf_hooks'

const scriptPath = fileURLToPath(import.meta.url)
const repoRoot = resolve(dirname(scriptPath), '../..')
const distEntry = resolve(repoRoot, 'dist/index.js')

const args = new Set(process.argv.slice(2))

if (!existsSync(distEntry)) {
  console.error('dist/index.js is missing. Run `npm run build` before startup-latency proof.')
  process.exit(1)
}

if (args.has('--child-sample')) {
  const startedAt = performance.now()
  const mod = await import(pathToFileURL(distEntry).href)
  const importMs = performance.now() - startedAt
  const bootstrap = measureBootstrap(mod)
  process.stdout.write(JSON.stringify({ importMs, bootstrapMs: bootstrap.durationMs, planRunId: bootstrap.planRunId }))
  process.exit(0)
}

const coldSamples = readIntegerEnv('GAL_SWARM_STARTUP_COLD_SAMPLES', 7)
const warmSamples = readIntegerEnv('GAL_SWARM_STARTUP_WARM_SAMPLES', 500)
const coldP95BudgetMs = readNumberEnv('GAL_SWARM_STARTUP_COLD_P95_MS', 500)
const warmP95BudgetMs = readNumberEnv('GAL_SWARM_STARTUP_WARM_P95_MS', 5)

const cold = []
for (let index = 0; index < coldSamples; index += 1) {
  const startedAt = performance.now()
  const child = spawnSync(process.execPath, [scriptPath, '--child-sample'], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: process.env,
  })
  const processMs = performance.now() - startedAt

  if (child.status !== 0) {
    process.stderr.write(child.stderr)
    process.stderr.write(child.stdout)
    process.exit(child.status ?? 1)
  }

  const childSample = JSON.parse(child.stdout)
  cold.push({
    processMs: roundMs(processMs),
    importMs: roundMs(childSample.importMs),
    bootstrapMs: roundMs(childSample.bootstrapMs),
  })
}

const mod = await import(pathToFileURL(distEntry).href)
const warm = []
for (let index = 0; index < warmSamples; index += 1) {
  warm.push(measureBootstrap(mod).durationMs)
}

const summary = {
  proof: 'gal-swarm-startup-latency',
  scope: 'local provider-neutral contract bootstrap only; no live provider capacity is started or claimed',
  budgetsMs: {
    coldProcessP95: coldP95BudgetMs,
    warmBootstrapP95: warmP95BudgetMs,
  },
  samples: {
    coldProcess: summarize(cold.map((sample) => sample.processMs)),
    coldImport: summarize(cold.map((sample) => sample.importMs)),
    coldBootstrap: summarize(cold.map((sample) => sample.bootstrapMs)),
    warmBootstrap: summarize(warm),
  },
  sampleCounts: {
    cold: coldSamples,
    warm: warmSamples,
  },
}

console.log(JSON.stringify(summary, null, 2))

const failures = []
if (summary.samples.coldProcess.p95 > coldP95BudgetMs) {
  failures.push(`cold process p95 ${summary.samples.coldProcess.p95}ms exceeds ${coldP95BudgetMs}ms`)
}
if (summary.samples.warmBootstrap.p95 > warmP95BudgetMs) {
  failures.push(`warm bootstrap p95 ${summary.samples.warmBootstrap.p95}ms exceeds ${warmP95BudgetMs}ms`)
}

if (failures.length > 0) {
  console.error(`Startup latency proof failed: ${failures.join('; ')}.`)
  process.exit(1)
}

function measureBootstrap(mod) {
  const startedAt = performance.now()
  const profiles = mod.defaultGalSwarmPreflightComputeProfiles()
  if (profiles.length === 0) {
    throw new Error('No preflight compute profiles are declared.')
  }
  const plan = mod.createGalSwarmRunPlan({
    orgName: 'example-org',
    objective: 'Measure provider-neutral swarm startup contract path',
    source: 'gal-code',
    mode: 'dry-run',
    target: {
      sandboxProvider: 'stratus',
      computeProfileId: 'startup-latency-local-contract-proof',
      capacityPolicyProfile: 'dev-smoke',
      desiredWorkers: 1,
      desiredComputeUnits: 1,
      ttlHours: 0.25,
      maxHourlyUsd: 1,
      serverlessEndpointId: 'startup-latency-proof-serverless-fallback',
    },
    workload: {
      tasks: 1,
      promptTokens: 1_000,
      completionTokens: 250,
      toolCalls: 3,
      workflowWaitSeconds: 0,
      sandboxCount: 1,
    },
    correlationId: 'startup-latency-proof',
  })

  mod.createDefaultCapacityPolicy(plan)
  return {
    durationMs: roundMs(performance.now() - startedAt),
    planRunId: plan.runId,
  }
}

function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    min: roundMs(sorted[0]),
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: roundMs(sorted[sorted.length - 1]),
  }
}

function percentile(sortedValues, ratio) {
  const index = Math.min(sortedValues.length - 1, Math.ceil(sortedValues.length * ratio) - 1)
  return roundMs(sortedValues[index])
}

function readIntegerEnv(name, fallback) {
  const value = readNumberEnv(name, fallback)
  return Math.max(1, Math.floor(value))
}

function readNumberEnv(name, fallback) {
  const raw = process.env[name]
  if (!raw) return fallback
  const value = Number(raw)
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number.`)
  }
  return value
}

function roundMs(value) {
  return Number(value.toFixed(3))
}
