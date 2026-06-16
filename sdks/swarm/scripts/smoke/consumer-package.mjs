import { mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFileSync } from 'node:child_process'

const packageDir = process.cwd()
const packDir = mkdtempSync(join(tmpdir(), 'gal-swarm-pack-'))
const consumerDir = mkdtempSync(join(tmpdir(), 'gal-swarm-consumer-'))

try {
  const packed = execFileSync('npm', ['pack', '--silent', '--pack-destination', packDir], {
    cwd: packageDir,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .at(-1)
  const tarball = join(packDir, packed)

  writeFileSync(
    join(consumerDir, 'package.json'),
    JSON.stringify({ type: 'module', dependencies: { '@gal/swarm': tarball } }, null, 2),
  )
  execFileSync('npm', ['install', '--silent'], { cwd: consumerDir, stdio: 'inherit' })
  execFileSync(
    'node',
    [
      '--input-type=module',
      '-e',
      "import { GAL_SWARM_PLAN_SCHEMA_VERSION, planGalSwarmDecision } from '@gal/swarm'; if (GAL_SWARM_PLAN_SCHEMA_VERSION !== 'gal.swarm-plan.v1' || typeof planGalSwarmDecision !== 'function') process.exit(1)",
    ],
    { cwd: consumerDir, stdio: 'inherit' },
  )
} finally {
  rmSync(packDir, { recursive: true, force: true })
  rmSync(consumerDir, { recursive: true, force: true })
}
