#!/usr/bin/env node
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { emailRulesAdapter } from '../email/email-rules-adapter.js'
import { formatEvaluationReport, runEvaluationSuite } from '../core/runner.js'
import type { GalEvalAdapter, GalEvalSuite } from '../core/types.js'

const adapters: Record<string, GalEvalAdapter> = {
  [emailRulesAdapter.id]: emailRulesAdapter,
}

const args = parseArgs(process.argv.slice(2))
const suitePath = args['suite']
const adapterId = args['adapter'] ?? 'email-rules'
const outputPath = args['output']

if (!suitePath) {
  throw new Error('Missing --suite <path>')
}

const suite = JSON.parse(await readFile(resolve(suitePath), 'utf8')) as GalEvalSuite
const adapter = adapters[adapterId]

if (!adapter) {
  throw new Error(`Unknown adapter ${adapterId}. Available adapters: ${Object.keys(adapters).join(', ')}`)
}

const report = await runEvaluationSuite(suite, adapter)
console.log(formatEvaluationReport(report))

if (outputPath) {
  await writeFile(resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`)
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
