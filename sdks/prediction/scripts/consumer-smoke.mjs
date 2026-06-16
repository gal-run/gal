import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)
const root = new URL('..', import.meta.url).pathname
const tempDir = await mkdtemp(join(tmpdir(), 'gal-prediction-consumer-'))

try {
  await execFileAsync('npm', ['pack', '--pack-destination', tempDir], { cwd: root })
  const [tarball] = (await execFileAsync('sh', ['-c', 'ls *.tgz'], { cwd: tempDir })).stdout.trim().split('\n')
  await writeFile(
    join(tempDir, 'package.json'),
    JSON.stringify({ type: 'module', dependencies: { '@gal-run/gal-prediction': `file:${tarball}` } }, null, 2),
  )
  await writeFile(
    join(tempDir, 'index.mjs'),
    [
      "import { forecastGalExecution, GAL_PREDICTION_REQUEST_SCHEMA_VERSION } from '@gal-run/gal-prediction'",
      'const forecast = forecastGalExecution({',
      '  schemaVersion: GAL_PREDICTION_REQUEST_SCHEMA_VERSION,',
      "  requestId: 'smoke', horizonMinutes: 60, maxWorkers: 2, workerStartupMinutes: 1, targetUtilization: 0.7, tasks: []",
      '})',
      "if (forecast.capacity.action !== 'shutdown') throw new Error('Unexpected forecast action')",
    ].join('\n'),
  )
  await execFileAsync('npm', ['install', '--ignore-scripts'], { cwd: tempDir })
  await execFileAsync('node', ['index.mjs'], { cwd: tempDir })
} finally {
  await rm(tempDir, { recursive: true, force: true })
}
