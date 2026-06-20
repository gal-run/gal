#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { emailRulesAdapter } from '../email/email-rules-adapter.js'
import {
  PredictionFileAdapter,
  assertPredictionFileMatchesSuite,
} from '../core/prediction-file-adapter.js'
import { formatEvaluationReport, runEvaluationSuite } from '../core/runner.js'
import { submitEvaluationReport } from '../core/report-submitter.js'
import type { GalEvalAdapter, GalEvalPredictionFile, GalEvalSuite } from '../core/types.js'

const adapters: Record<string, GalEvalAdapter> = {
  [emailRulesAdapter.id]: emailRulesAdapter,
}

const args = parseArgs(process.argv.slice(2))
const suitePath = args['suite']
const adapterId = args['adapter'] ?? 'email-rules'
const outputPath = args['output']
const predictionsPath = args['predictions']
const submitApiUrl = args['submit-api-url']

if (!suitePath) {
  throw new Error('Missing --suite <path>')
}

const suite = JSON.parse(await readFile(resolve(suitePath), 'utf8')) as GalEvalSuite
const adapter = await resolveAdapter(adapterId, suite, predictionsPath)

if (!adapter) {
  throw new Error(`Unknown adapter ${adapterId}. Available adapters: ${Object.keys(adapters).join(', ')}`)
}

const report = await runEvaluationSuite(suite, adapter)
console.log(formatEvaluationReport(report))

if (outputPath) {
  await writeFile(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`)
}

if (submitApiUrl) {
  const evalRun = await submitEvaluationReport(report, {
    apiBaseUrl: submitApiUrl,
    orgName: requireArg(args, 'submit-org'),
    agentId: requireArg(args, 'submit-agent'),
    version: requireArg(args, 'submit-version'),
    runId: requireArg(args, 'submit-run-id'),
    bearerToken: resolveSubmitToken(args),
  })
  console.log(`Submitted report to eval run ${evalRun.runId}: ${evalRun.status} / ${evalRun.gateStatus}`)
}

process.exitCode = report.passed ? 0 : 1

function parseArgs(argv: string[]): Record<string, string | undefined> {
  const parsed: Record<string, string | undefined> = {}

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (!arg.startsWith('--')) {
      continue
    }

    const key = arg.slice(2)
    const next = argv[index + 1]
    if (!next || next.startsWith('--')) {
      parsed[key] = 'true'
      continue
    }

    parsed[key] = next
    index += 1
  }

  return parsed
}

function requireArg(args: Record<string, string | undefined>, key: string): string {
  const value = args[key]?.trim()
  if (!value) {
    throw new Error(`Missing --${key} <value>`)
  }
  return value
}

function resolveSubmitToken(args: Record<string, string | undefined>): string | undefined {
  const envName = args['submit-token-env']?.trim()
  if (envName) {
    return process.env[envName]
  }
  return process.env['GAL_EVAL_SUBMIT_TOKEN']
}

async function resolveAdapter(
  adapterId: string,
  suite: GalEvalSuite,
  predictionsPath: string | undefined,
): Promise<GalEvalAdapter> {
  if (adapterId === 'prediction-file') {
    if (!predictionsPath) {
      throw new Error('Missing --predictions <path> for prediction-file adapter')
    }

    const predictionFile = JSON.parse(
      await readFile(resolve(predictionsPath), 'utf8'),
    ) as GalEvalPredictionFile

    assertPredictionFileMatchesSuite(predictionFile, suite)
    return new PredictionFileAdapter(predictionFile)
  }

  const adapter = adapters[adapterId]

  if (!adapter) {
    throw new Error(`Unknown adapter ${adapterId}. Available adapters: ${Object.keys(adapters).concat('prediction-file').join(', ')}`)
  }

  return adapter
}
