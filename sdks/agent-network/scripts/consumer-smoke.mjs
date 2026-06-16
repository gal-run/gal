import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const root = new URL('..', import.meta.url)
const workspace = mkdtempSync(join(tmpdir(), 'gal-agent-network-consumer-'))
const smoke = [
  "import {",
  "  GAL_SERVICE_AGENT_CARD_SCHEMA_VERSION,",
  "  GAL_SERVICE_TASK_SCHEMA_VERSION,",
  "  GAL_SWARM_WAVE_LEDGER_EVENT_SCHEMA_VERSION,",
  "  createGalServiceSdk,",
  "  createGalSwarmWaveLedgerEnvelope,",
  "} from '@gal-run/agent-network'",
  '',
  "if (GAL_SERVICE_AGENT_CARD_SCHEMA_VERSION !== 'gal.agent-card.v1') {",
  "  throw new Error('unexpected Agent Card schema version')",
  '}',
  '',
  "if (GAL_SERVICE_TASK_SCHEMA_VERSION !== 'gal.agent-task.v1') {",
  "  throw new Error('unexpected task schema version')",
  '}',
  '',
  "if (typeof createGalServiceSdk !== 'function') {",
  "  throw new Error('missing Service SDK export')",
  '}',
  '',
  "if (GAL_SWARM_WAVE_LEDGER_EVENT_SCHEMA_VERSION !== 'gal.swarm-wave-ledger-event.v1') {",
  "  throw new Error('unexpected swarm wave ledger schema version')",
  '}',
  '',
  "if (typeof createGalSwarmWaveLedgerEnvelope !== 'function') {",
  "  throw new Error('missing swarm wave ledger envelope export')",
  '}',
  '',
].join('\n')

function runImportSmoke(cwd) {
  execFileSync('node', ['--input-type=module', '--eval', smoke], {
    cwd,
    stdio: 'inherit',
  })
}

try {
  const tarballConsumer = join(workspace, 'tarball-consumer')
  const gitConsumer = join(workspace, 'git-consumer')
  mkdirSync(tarballConsumer)
  mkdirSync(gitConsumer)
  const packOutput = execFileSync(
    'npm',
    ['pack', root.pathname, '--pack-destination', workspace, '--silent'],
    { encoding: 'utf8' },
  ).trim()
  const tarball = join(workspace, packOutput.split('\n').at(-1))

  writeFileSync(
    join(tarballConsumer, 'package.json'),
    JSON.stringify({ type: 'module', private: true }, null, 2),
  )

  execFileSync('npm', ['install', '--silent', tarball], {
    cwd: tarballConsumer,
    stdio: 'inherit',
  })
  runImportSmoke(tarballConsumer)

  writeFileSync(
    join(gitConsumer, 'package.json'),
    JSON.stringify(
      {
        type: 'module',
        private: true,
        dependencies: {
          '@gal-run/agent-network': `git+${root.href}`,
        },
      },
      null,
      2,
    ),
  )

  execFileSync('npm', ['install', '--silent'], {
    cwd: gitConsumer,
    stdio: 'inherit',
  })
  runImportSmoke(gitConsumer)
} finally {
  rmSync(workspace, { recursive: true, force: true })
}
