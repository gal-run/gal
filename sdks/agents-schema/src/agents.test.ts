import { describe, expect, it } from 'vitest'

import {
  GAL_AGENT_CARD_SCHEMA_VERSION,
  GAL_AGENT_COMPONENT_STATES,
  GAL_AGENT_HEALTH_STATES,
  GAL_AGENT_TASK_SCHEMA_VERSION,
  GAL_AGENT_TASK_STATES,
  GAL_AGENT_TERMINAL_TASK_STATES,
  isGalAgentComponentState,
  isGalAgentHealthState,
  isGalAgentTaskState,
  isGalAgentTerminalTaskState,
  validateGalAgentCard,
  type GalAgentCard,
  type GalAgentTask,
} from './agents.js'
import {
  GAL_SWARM_AGENT_CARDS,
  GAL_SWARM_LEDGER_CORRELATION,
  GAL_SWARM_RECONCILER_AGENT_CARD,
  GAL_SWARM_TASK_TYPES,
  GAL_SWARM_VERIFIER_AGENT_CARD,
  GAL_SWARM_WORKER_AGENT_CARD,
} from './swarm-roles.js'

describe('GAL agent definitions', () => {
  it('defines the shared task state machine in lifecycle order', () => {
    expect(GAL_AGENT_TASK_STATES).toEqual([
      'submitted',
      'accepted',
      'working',
      'blocked',
      'completed',
      'failed',
      'canceled',
    ])
  })

  it('identifies terminal task states', () => {
    expect(GAL_AGENT_TERMINAL_TASK_STATES).toEqual(['completed', 'failed', 'canceled'])
    expect(isGalAgentTerminalTaskState('completed')).toBe(true)
    expect(isGalAgentTerminalTaskState('working')).toBe(false)
    expect(isGalAgentTerminalTaskState('unknown')).toBe(false)
  })

  it('guards task, health, and component state values at runtime', () => {
    expect(isGalAgentTaskState('submitted')).toBe(true)
    expect(isGalAgentTaskState('done')).toBe(false)
    expect(isGalAgentHealthState('degraded')).toBe(true)
    expect(isGalAgentHealthState('maintenance')).toBe(false)
    expect(isGalAgentComponentState('maintenance')).toBe(true)
    expect(isGalAgentComponentState('ok')).toBe(false)
    expect(GAL_AGENT_HEALTH_STATES).toEqual(['ok', 'degraded', 'unavailable'])
    expect(GAL_AGENT_COMPONENT_STATES).toContain('monitor_pending')
  })

  it('accepts a minimal GAL Agent Card profile', () => {
    const card = minimalPolicyAgentCard()

    validateGalAgentCard(card)

    expect(card.schemaVersion).toBe('gal.agent-card.v1')
    expect(card.capabilities[0].taskTypes).toContain('policy.status.report')
    expect(card.runtime.defaultRuntime).toBe('direct_api')
  })

  it('accepts an auditable agent task with delegated identity', () => {
    const caller = {
      type: 'service',
      id: 'business-ops-admin',
      serviceId: 'business-ops-admin.lifecycle',
    } as const
    const callee = {
      type: 'agent',
      id: 'gal-policy',
      agentId: 'gal.policy',
    } as const

    const task = {
      schemaVersion: GAL_AGENT_TASK_SCHEMA_VERSION,
      id: 'task_6904_policy_status',
      correlationId: 'corr_6904_policy_status',
      agentId: 'gal.policy',
      state: 'submitted',
      caller,
      callee,
      authorization: {
        methods: ['service_token'],
        scopes: ['policy:read'],
        policyDecisionId: 'decision_123',
        approvedConfigId: 'approved_config_456',
        reason: 'Business Ops Admin product lifecycle status report',
      },
      audit: {
        correlationId: 'corr_6904_policy_status',
        requestedBy: {
          type: 'user',
          id: 'github:1',
          githubActor: 'octocat',
        },
        callerService: caller,
        calleeAgent: callee,
        source: {
          repo: 'gal-run/gal-agents',
          issueNumber: 6904,
          url: 'https://github.com/gal-run/gal-agents/issues/6904',
        },
      },
      input: {
        taskType: 'policy.status.report',
        payload: { includeBackgroundAgents: true },
        schemaRef: 'policy-status-v1',
        priority: 'high',
      },
      artifacts: [],
      history: [
        {
          state: 'submitted',
          at: '2026-05-02T10:00:00.000Z',
          actor: caller,
          reason: 'delegated_status_request',
        },
      ],
      createdAt: '2026-05-02T10:00:00.000Z',
      updatedAt: '2026-05-02T10:00:00.000Z',
    } satisfies GalAgentTask

    expect(task.audit.correlationId).toBe(task.correlationId)
    expect(task.authorization.scopes).toEqual(['policy:read'])
    expect(task.history[0].state).toBe('submitted')
  })

  it('validates runtime defaults before publishing an Agent Card', () => {
    const card = {
      ...minimalPolicyAgentCard(),
      runtime: {
        defaultRuntime: 'queue_worker',
        supportedRuntimes: ['direct_api'],
        backgroundSessionRequired: false,
      },
    } satisfies GalAgentCard

    expect(() => validateGalAgentCard(card)).toThrow(
      'Default runtime queue_worker must be in supportedRuntimes',
    )
  })

  it('validates governed card ownership and correlation requirements', () => {
    const card = {
      ...minimalPolicyAgentCard(),
      governance: {
        evidence: {
          required: true,
          acceptedArtifactKinds: [],
          requiredArtifactNames: ['evidence.json'],
        },
        ownership: {
          allowedRepos: [],
          allowedPathGlobs: ['src/**'],
          requiresCleanWorktree: true,
          mayCreateBranches: false,
          mayCommit: false,
          destructiveActionsAllowed: false,
        },
        correlation: {
          requiresParentWaveId: true,
          requiresParentTaskId: true,
          waveIdField: '',
          taskIdField: 'parentTaskId',
          statusEventFields: ['correlationId'],
        },
      },
    } satisfies GalAgentCard

    expect(() => validateGalAgentCard(card)).toThrow(
      'Governed Agent Card evidence must declare acceptedArtifactKinds',
    )
  })

  it('defines governed swarm worker, verifier, and reconciler identities', () => {
    for (const card of GAL_SWARM_AGENT_CARDS) {
      validateGalAgentCard(card)

      expect(card.audit.evidenceRequired).toBe(true)
      expect(card.runtime.backgroundSessionRequired).toBe(true)
      expect(card.runtime.backgroundSessionSuitable).toBe(true)
      expect(card.runtime.supportedRuntimes).toContain('gal_code_background_session')
      expect(card.governance?.correlation).toEqual(GAL_SWARM_LEDGER_CORRELATION)
      expect(card.governance?.ownership.requiresCleanWorktree).toBe(true)
      expect(card.governance?.ownership.destructiveActionsAllowed).toBe(false)
      expect(card.governance?.evidence.requiredArtifactNames).toContain('evidence.json')
      expect(card.metadata?.intendedWaveSize).toBe(300)
    }

    expect(GAL_SWARM_WORKER_AGENT_CARD.agentId).toBe('gal.swarm.worker')
    expect(GAL_SWARM_VERIFIER_AGENT_CARD.agentId).toBe('gal.swarm.verifier')
    expect(GAL_SWARM_RECONCILER_AGENT_CARD.agentId).toBe('gal.swarm.reconciler')
    expect(GAL_SWARM_TASK_TYPES).toEqual([
      'swarm.worker.execute',
      'swarm.verifier.verify',
      'swarm.reconciler.reconcile',
    ])
  })

  it('keeps swarm verifier read-only and reconciler ledger-bounded', () => {
    expect(GAL_SWARM_VERIFIER_AGENT_CARD.governance?.ownership.mayCommit).toBe(false)
    expect(GAL_SWARM_VERIFIER_AGENT_CARD.governance?.ownership.mayCreateBranches).toBe(false)
    expect(GAL_SWARM_RECONCILER_AGENT_CARD.governance?.ownership.allowedRepos).toEqual([
      'gal-run/*',
    ])
    expect(GAL_SWARM_RECONCILER_AGENT_CARD.governance?.ownership.allowedPathGlobs).toEqual([
      '**/ledger/**',
      '**/swarm/**',
      '**/waves/**',
      '**/docs/**',
    ])
  })
})

function minimalPolicyAgentCard(): GalAgentCard {
  return {
    schemaVersion: GAL_AGENT_CARD_SCHEMA_VERSION,
    agentId: 'gal.policy',
    displayName: 'GAL Policy Agent',
    description: 'Evaluates approved configuration and enforcement decisions.',
    ownerOrg: 'gal-run',
    repo: 'gal-run/gal-agents',
    environments: ['production'],
    endpoints: [
      {
        transport: 'http_json',
        url: 'https://agent.example.com/service-tasks',
        authMethods: ['service_token'],
      },
    ],
    capabilities: [
      {
        id: 'policy.status',
        name: 'Policy status',
        description: 'Reports policy enforcement readiness and approved config status.',
        taskTypes: ['policy.status.report'],
        inputModes: ['application/json'],
        outputModes: ['application/json'],
        requiredScopes: ['policy:read'],
        schemaRefs: ['policy-status-v1'],
      },
    ],
    auth: {
      methods: ['service_token'],
      requiredScopes: ['policy:read'],
      supportsDelegatedUserIdentity: true,
      supportsServiceIdentity: true,
    },
    taskSchemas: [
      {
        id: 'policy-status-v1',
        version: '1.0.0',
        taskType: 'policy.status.report',
        inputSchema: { type: 'object' },
        outputSchema: { type: 'object' },
      },
    ],
    audit: {
      logName: 'gal-agent-tasks',
      correlationIdHeader: 'x-gal-correlation-id',
      evidenceRequired: true,
    },
    runtime: {
      defaultRuntime: 'direct_api',
      supportedRuntimes: ['direct_api', 'queue_worker', 'gal_code_background_session'],
      backgroundSessionRequired: false,
    },
  }
}
