import {
  GAL_AGENT_CARD_SCHEMA_VERSION,
  type GalAgentCard,
  type GalAgentEvidenceRequirement,
} from './agents.js'

export const GAL_SWARM_WORKER_AGENT_ID = 'gal.swarm.worker' as const
export const GAL_SWARM_VERIFIER_AGENT_ID = 'gal.swarm.verifier' as const
export const GAL_SWARM_RECONCILER_AGENT_ID = 'gal.swarm.reconciler' as const

export const GAL_SWARM_TASK_TYPES = [
  'swarm.worker.execute',
  'swarm.verifier.verify',
  'swarm.reconciler.reconcile',
] as const

export type GalSwarmTaskType = (typeof GAL_SWARM_TASK_TYPES)[number]

export const GAL_SWARM_LEDGER_CORRELATION = {
  requiresParentWaveId: true,
  requiresParentTaskId: true,
  waveIdField: 'parentWaveId',
  taskIdField: 'parentTaskId',
  ledgerIdField: 'ledgerEntryId',
  statusEventFields: ['correlationId', 'parentWaveId', 'parentTaskId', 'ledgerEntryId'],
} as const

const swarmRuntime = {
  defaultRuntime: 'gal_code_background_session',
  supportedRuntimes: ['queue_worker', 'gal_code_background_session', 'kata_background_session'],
  backgroundSessionRequired: true,
  backgroundSessionSuitable: true,
  maxSessionDurationMs: 6 * 60 * 60 * 1000,
  resumable: true,
} satisfies GalAgentCard['runtime']

const swarmEndpoint = {
  transport: 'cli',
  command: 'gal code',
  authMethods: ['github_app', 'service_token'],
  description:
    'Background-session entrypoint for governed swarm waves; runtime adapters bind the card to queued work.',
} satisfies GalAgentCard['endpoints'][number]

const swarmAuth = {
  methods: ['github_app', 'service_token'],
  requiredScopes: ['repo:read', 'checks:read', 'contents:read'],
  supportsDelegatedUserIdentity: true,
  supportsServiceIdentity: true,
} satisfies GalAgentCard['auth']

const swarmEvidence = {
  required: true,
  acceptedArtifactKinds: ['json', 'markdown', 'diff', 'log', 'url'],
  requiredArtifactNames: ['status.md', 'evidence.json'],
  notes: [
    'Every terminal ledger update must cite the command, test, workflow, review, or runtime probe that supports it.',
    'Evidence must be attached to the child task and correlated back to the parent wave before completion.',
  ],
} satisfies GalAgentEvidenceRequirement

const taskInputSchema = {
  type: 'object',
  required: ['parentWaveId', 'parentTaskId', 'ledgerEntryId', 'repo', 'allowedPathGlobs'],
  additionalProperties: true,
  properties: {
    parentWaveId: { type: 'string' },
    parentTaskId: { type: 'string' },
    ledgerEntryId: { type: 'string' },
    repo: { type: 'string' },
    allowedPathGlobs: { type: 'array', items: { type: 'string' } },
    instructions: { type: 'string' },
  },
}

const taskOutputSchema = {
  type: 'object',
  required: ['summary', 'evidence'],
  additionalProperties: true,
  properties: {
    summary: { type: 'string' },
    evidence: {
      type: 'array',
      items: {
        type: 'object',
        required: ['kind', 'name'],
        additionalProperties: true,
        properties: {
          kind: { type: 'string' },
          name: { type: 'string' },
          url: { type: 'string' },
        },
      },
    },
  },
}

export const GAL_SWARM_WORKER_AGENT_CARD = {
  schemaVersion: GAL_AGENT_CARD_SCHEMA_VERSION,
  agentId: GAL_SWARM_WORKER_AGENT_ID,
  displayName: 'GAL Swarm Worker',
  description:
    'Executes bounded implementation slices for a governed swarm wave and writes evidence-linked status back to the parent ledger.',
  ownerOrg: 'gal-run',
  repo: 'gal-run/gal-agents',
  environments: ['development', 'staging', 'production'],
  endpoints: [swarmEndpoint],
  capabilities: [
    {
      id: 'swarm.worker.execute',
      name: 'Execute swarm work item',
      description:
        'Implement or operate on the repo/file slice assigned by a parent wave without crossing ownership bounds.',
      taskTypes: ['swarm.worker.execute'],
      inputModes: ['application/json', 'text/markdown'],
      outputModes: ['application/json', 'text/markdown'],
      requiredScopes: ['repo:read', 'contents:read'],
      schemaRefs: ['swarm-worker-task-v1'],
    },
  ],
  auth: swarmAuth,
  taskSchemas: [
    {
      id: 'swarm-worker-task-v1',
      version: '1.0.0',
      taskType: 'swarm.worker.execute',
      inputSchema: taskInputSchema,
      outputSchema: taskOutputSchema,
    },
  ],
  audit: {
    logName: 'gal-swarm-agent-tasks',
    correlationIdHeader: 'x-gal-correlation-id',
    artifactRetentionDays: 180,
    evidenceRequired: true,
  },
  runtime: swarmRuntime,
  governance: {
    evidence: swarmEvidence,
    ownership: {
      allowedRepos: ['example-org/*'],
      allowedPathGlobs: ['**'],
      deniedPathGlobs: ['.git/**', '**/.env*', '**/secrets/**', '**/node_modules/**'],
      requiresCleanWorktree: true,
      mayCreateBranches: true,
      mayCommit: true,
      mayPush: false,
      destructiveActionsAllowed: false,
      notes: [
        'The parent wave must narrow allowedRepos and allowedPathGlobs for each child task.',
        'Workers must stop instead of editing when unrelated dirty state is present.',
      ],
    },
    correlation: GAL_SWARM_LEDGER_CORRELATION,
  },
  metadata: {
    ledgerRole: 'worker',
    intendedWaveSize: 300,
    terminalStatesRequireEvidence: true,
  },
} satisfies GalAgentCard

export const GAL_SWARM_VERIFIER_AGENT_CARD = {
  schemaVersion: GAL_AGENT_CARD_SCHEMA_VERSION,
  agentId: GAL_SWARM_VERIFIER_AGENT_ID,
  displayName: 'GAL Swarm Verifier',
  description:
    'Independently verifies a swarm worker result, checks evidence quality, and records pass, fail, or blocked status for the parent ledger.',
  ownerOrg: 'gal-run',
  repo: 'gal-run/gal-agents',
  environments: ['development', 'staging', 'production'],
  endpoints: [swarmEndpoint],
  capabilities: [
    {
      id: 'swarm.verifier.verify',
      name: 'Verify swarm work item',
      description:
        'Run focused tests, type checks, build checks, review evidence, and confirm the worker stayed inside ownership bounds.',
      taskTypes: ['swarm.verifier.verify'],
      inputModes: ['application/json', 'text/markdown'],
      outputModes: ['application/json', 'text/markdown'],
      requiredScopes: ['repo:read', 'checks:read', 'contents:read'],
      schemaRefs: ['swarm-verifier-task-v1'],
    },
  ],
  auth: swarmAuth,
  taskSchemas: [
    {
      id: 'swarm-verifier-task-v1',
      version: '1.0.0',
      taskType: 'swarm.verifier.verify',
      inputSchema: taskInputSchema,
      outputSchema: taskOutputSchema,
    },
  ],
  audit: {
    logName: 'gal-swarm-agent-tasks',
    correlationIdHeader: 'x-gal-correlation-id',
    artifactRetentionDays: 180,
    evidenceRequired: true,
  },
  runtime: swarmRuntime,
  governance: {
    evidence: {
      ...swarmEvidence,
      requiredArtifactNames: ['verification.md', 'evidence.json'],
      minimumReviewers: 1,
    },
    ownership: {
      allowedRepos: ['example-org/*'],
      allowedPathGlobs: ['**'],
      deniedPathGlobs: ['.git/**', '**/.env*', '**/secrets/**', '**/node_modules/**'],
      requiresCleanWorktree: true,
      mayCreateBranches: false,
      mayCommit: false,
      mayPush: false,
      destructiveActionsAllowed: false,
      notes: [
        'Verifiers may inspect and run checks but must not modify implementation files.',
        'Verification must include the parent worker task id and its evidence artifact ids.',
      ],
    },
    correlation: GAL_SWARM_LEDGER_CORRELATION,
  },
  metadata: {
    ledgerRole: 'verifier',
    intendedWaveSize: 300,
    terminalStatesRequireEvidence: true,
  },
} satisfies GalAgentCard

export const GAL_SWARM_RECONCILER_AGENT_CARD = {
  schemaVersion: GAL_AGENT_CARD_SCHEMA_VERSION,
  agentId: GAL_SWARM_RECONCILER_AGENT_ID,
  displayName: 'GAL Swarm Reconciler',
  description:
    'Compares worker and verifier results, resolves ledger status drift, and prepares bounded follow-up tasks for the parent wave.',
  ownerOrg: 'gal-run',
  repo: 'gal-run/gal-agents',
  environments: ['development', 'staging', 'production'],
  endpoints: [swarmEndpoint],
  capabilities: [
    {
      id: 'swarm.reconciler.reconcile',
      name: 'Reconcile swarm ledger entry',
      description:
        'Merge worker/verifier evidence into a final ledger disposition and emit bounded remediation tasks when results disagree.',
      taskTypes: ['swarm.reconciler.reconcile'],
      inputModes: ['application/json', 'text/markdown'],
      outputModes: ['application/json', 'text/markdown'],
      requiredScopes: ['repo:read', 'checks:read', 'contents:read'],
      schemaRefs: ['swarm-reconciler-task-v1'],
    },
  ],
  auth: swarmAuth,
  taskSchemas: [
    {
      id: 'swarm-reconciler-task-v1',
      version: '1.0.0',
      taskType: 'swarm.reconciler.reconcile',
      inputSchema: taskInputSchema,
      outputSchema: taskOutputSchema,
    },
  ],
  audit: {
    logName: 'gal-swarm-agent-tasks',
    correlationIdHeader: 'x-gal-correlation-id',
    artifactRetentionDays: 180,
    evidenceRequired: true,
  },
  runtime: swarmRuntime,
  governance: {
    evidence: {
      ...swarmEvidence,
      requiredArtifactNames: ['reconciliation.md', 'evidence.json'],
      minimumReviewers: 1,
    },
    ownership: {
      allowedRepos: ['gal-run/*'],
      allowedPathGlobs: ['**/ledger/**', '**/swarm/**', '**/waves/**', '**/docs/**'],
      deniedPathGlobs: ['.git/**', '**/.env*', '**/secrets/**', '**/node_modules/**'],
      requiresCleanWorktree: true,
      mayCreateBranches: true,
      mayCommit: true,
      mayPush: false,
      destructiveActionsAllowed: false,
      notes: [
        'Reconcilers may update ledger or follow-up task records, not arbitrary implementation files.',
        'Disagreements must become explicit blocked or remediation entries instead of silent completion.',
      ],
    },
    correlation: GAL_SWARM_LEDGER_CORRELATION,
  },
  metadata: {
    ledgerRole: 'reconciler',
    intendedWaveSize: 300,
    terminalStatesRequireEvidence: true,
  },
} satisfies GalAgentCard

export const GAL_SWARM_AGENT_CARDS = [
  GAL_SWARM_WORKER_AGENT_CARD,
  GAL_SWARM_VERIFIER_AGENT_CARD,
  GAL_SWARM_RECONCILER_AGENT_CARD,
] as const
