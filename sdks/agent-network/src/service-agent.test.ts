import { describe, expect, it } from 'vitest'

import {
  GAL_SERVICE_AGENT_CARD_SCHEMA_VERSION,
  GAL_SERVICE_COMPONENT_STATES,
  GAL_SERVICE_HEALTH_SCHEMA_VERSION,
  GAL_SERVICE_HEALTH_STATES,
  GAL_SERVICE_TASK_SCHEMA_VERSION,
  GAL_SERVICE_TASK_STATES,
  GAL_SERVICE_TERMINAL_TASK_STATES,
  GAL_SERVICE_STATUS_SCHEMA_VERSION,
  isGalServiceComponentState,
  isGalServiceHealthState,
  isGalServiceTaskState,
  isGalServiceTerminalTaskState,
  type GalServiceAgentCard,
  type GalServiceHealthResponse,
  type GalServiceStatusResponse,
  type GalServiceTask,
} from './service-agent.js'
import {
  GalHttpJsonAgentClientError,
  createGalHttpJsonAgentClient,
} from './http-json-client.js'
import { createGalServiceSdk, validateGalServiceAgentCard } from './service-sdk.js'
import {
  GAL_SWARM_WAVE_LEDGER_EVENT_SCHEMA_VERSION,
  GAL_SWARM_WAVE_LEDGER_EVENT_TYPES,
  buildGalSwarmWaveLedgerTaskMetadata,
  isGalSwarmWaveLedgerEventType,
  type GalSwarmWaveLedgerEnvelope,
  type GalSwarmWaveLedgerEventMetadata,
} from './swarm-wave-ledger.js'

describe('service-agent contracts', () => {
  it('defines the shared task state machine in lifecycle order', () => {
    expect(GAL_SERVICE_TASK_STATES).toEqual([
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
    expect(GAL_SERVICE_TERMINAL_TASK_STATES).toEqual(['completed', 'failed', 'canceled'])
    expect(isGalServiceTerminalTaskState('completed')).toBe(true)
    expect(isGalServiceTerminalTaskState('working')).toBe(false)
    expect(isGalServiceTerminalTaskState('unknown')).toBe(false)
  })

  it('guards task state values at runtime', () => {
    expect(isGalServiceTaskState('submitted')).toBe(true)
    expect(isGalServiceTaskState('blocked')).toBe(true)
    expect(isGalServiceTaskState('done')).toBe(false)
    expect(isGalServiceTaskState(null)).toBe(false)
  })

  it('defines health and public component states for status pages', () => {
    expect(GAL_SERVICE_HEALTH_STATES).toEqual(['ok', 'degraded', 'unavailable'])
    expect(GAL_SERVICE_COMPONENT_STATES).toEqual([
      'operational',
      'degraded',
      'unavailable',
      'maintenance',
      'monitor_pending',
    ])
    expect(isGalServiceHealthState('degraded')).toBe(true)
    expect(isGalServiceHealthState('maintenance')).toBe(false)
    expect(isGalServiceComponentState('maintenance')).toBe(true)
    expect(isGalServiceComponentState('ok')).toBe(false)
  })

  it('accepts a minimal enterprise Agent Card profile', () => {
    const card = {
      schemaVersion: GAL_SERVICE_AGENT_CARD_SCHEMA_VERSION,
      agentId: 'gal.policy',
      displayName: 'GAL Policy Agent',
      description: 'Evaluates approved configuration and enforcement decisions.',
      ownerOrg: 'gal-run',
      repo: 'gal-run/agent-network',
      sourceUrl: 'https://github.com/gal-run/agent-network',
      environments: ['production'],
      endpoints: [
        {
          transport: 'a2a',
          url: 'https://agent.example.com/a2a/gal.policy',
          authMethods: ['github_app', 'service_token'],
        },
      ],
      capabilities: [
        {
          id: 'policy.status',
          name: 'Policy status',
          description: 'Reports policy enforcement readiness and approved config status.',
          taskTypes: ['policy.status.report'],
          inputModes: ['application/json'],
          outputModes: ['application/json', 'text/markdown'],
          requiredScopes: ['policy:read'],
          schemaRefs: ['policy-status-v1'],
        },
      ],
      auth: {
        methods: ['github_app', 'service_token'],
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
        logName: 'gal-service-tasks',
        correlationIdHeader: 'x-gal-correlation-id',
        evidenceRequired: true,
      },
      runtime: {
        defaultRuntime: 'direct_api',
        supportedRuntimes: ['direct_api', 'gal_code_background_session'],
        backgroundSessionRequired: false,
      },
    } satisfies GalServiceAgentCard

    expect(card.schemaVersion).toBe('gal.agent-card.v1')
    expect(card.capabilities[0].taskTypes).toContain('policy.status.report')
    expect(card.runtime.defaultRuntime).toBe('direct_api')
  })

  it('accepts an auditable service task with delegated identity', () => {
    const caller = {
      type: 'service',
      id: 'example-private',
      serviceId: 'example-private.lifecycle',
    } as const
    const callee = {
      type: 'service',
      id: 'gal-policy',
      agentId: 'gal.policy',
    } as const

    const task = {
      schemaVersion: GAL_SERVICE_TASK_SCHEMA_VERSION,
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
          id: 'github:103112957',
          githubActor: 'example-user',
        },
        callerService: caller,
        calleeAgent: callee,
        source: {
          repo: 'gal-run/agent-network',
          issueNumber: 6904,
          url: 'https://github.com/gal-run/agent-network/issues/6904',
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
    } satisfies GalServiceTask

    expect(task.audit.correlationId).toBe(task.correlationId)
    expect(task.authorization.scopes).toEqual(['policy:read'])
    expect(task.history[0].state).toBe('submitted')
  })

  it('accepts public health and status responses with safe dependency metadata', () => {
    const health = {
      schemaVersion: GAL_SERVICE_HEALTH_SCHEMA_VERSION,
      agentId: 'agent-network',
      status: 'degraded',
      checkedAt: '2026-05-02T14:00:00.000Z',
      requestId: 'req_agent_network_503',
      version: '0.0.0',
    } satisfies GalServiceHealthResponse

    const status = {
      schemaVersion: GAL_SERVICE_STATUS_SCHEMA_VERSION,
      agentId: 'agent-network',
      displayName: 'Agent Network',
      status: 'degraded',
      statusPageUrl: 'https://status.example.com',
      generatedAt: '2026-05-02T14:00:00.000Z',
      requestId: health.requestId,
      dependencies: [
        {
          id: 'gal-api',
          name: 'GAL API',
          kind: 'api',
          status: 'degraded',
          public: true,
          statusCode: 503,
          retryAfter: '49',
          requestId: 'req_gal_api_503',
          message: 'GAL API is returning retryable upstream errors.',
        },
      ],
      syntheticProbes: [
        {
          id: 'agent-network-healthz',
          name: 'Agent Network health',
          componentId: 'agent-network',
          method: 'GET',
          path: '/healthz',
          expectedStatuses: [200],
          timeoutMs: 5000,
          safeForPublicStatus: true,
        },
      ],
    } satisfies GalServiceStatusResponse

    expect(status.dependencies[0].requestId).toBe('req_gal_api_503')
    expect(status.syntheticProbes?.[0].path).toBe('/healthz')
  })

  it('creates and transitions service tasks through the SDK surface', () => {
    const card = minimalPolicyAgentCard()
    const sdk = createGalServiceSdk({
      agentCard: card,
      now: () => '2026-05-02T19:15:00.000Z',
      ids: {
        taskId: () => 'task_sdk_6906',
        correlationId: () => 'corr_sdk_6906',
      },
    })

    const caller = {
      type: 'service',
      id: 'example-private',
      serviceId: 'example-private.lifecycle',
    } as const

    const task = sdk.createTask({
      caller,
      calleeAgentId: card.agentId,
      authorization: {
        methods: ['service_token'],
        scopes: ['policy:read'],
        approvedConfigId: 'approved_config_6906',
      },
      input: {
        taskType: 'policy.status.report',
        payload: { includeBackgroundAgents: true },
      },
      audit: {
        requestedBy: {
          type: 'user',
          id: 'github:48866801',
          githubActor: 'example-user',
        },
        source: {
          repo: 'gal-run/agent-network',
          issueNumber: 6906,
        },
      },
    })

    expect(task.id).toBe('task_sdk_6906')
    expect(task.correlationId).toBe('corr_sdk_6906')
    expect(task.audit.calleeAgent.agentId).toBe('gal.policy')
    expect(task.state).toBe('submitted')
    expect(sdk.selectRuntime(task)).toBe('direct_api')

    const completed = sdk.completeTask(
      task,
      task.callee,
      {
        payload: { ready: true },
        summary: 'Policy service status is available.',
      },
      'status_report_complete',
      [
        {
          id: 'artifact_policy_status',
          name: 'policy-status.json',
          kind: 'json',
        },
      ],
    )

    expect(completed.state).toBe('completed')
    expect(completed.output?.payload).toEqual({ ready: true })
    expect(completed.history.map((entry) => entry.state)).toEqual(['submitted', 'completed'])
    expect(completed.artifacts[0].id).toBe('artifact_policy_status')
  })

  it('derives MCP and A2A adapter descriptors without provider SDK dependencies', () => {
    const sdk = createGalServiceSdk({ agentCard: minimalPolicyAgentCard() })

    expect(sdk.mcpTools()).toEqual([
      expect.objectContaining({
        name: 'gal.policy.policy.status.report',
        taskType: 'policy.status.report',
        requiredScopes: ['policy:read'],
      }),
    ])
    expect(sdk.a2aAdapter().taskTypes).toEqual(['policy.status.report'])
  })

  it('blocks missing delegated scopes before task creation', () => {
    const sdk = createGalServiceSdk({ agentCard: minimalPolicyAgentCard() })

    expect(() =>
      sdk.createTask({
        caller: {
          type: 'service',
          id: 'example-private',
          serviceId: 'example-private.lifecycle',
        },
        calleeAgentId: 'gal.policy',
        authorization: {
          methods: ['service_token'],
          scopes: [],
        },
        input: {
          taskType: 'policy.status.report',
          payload: {},
        },
      }),
    ).toThrow('Missing service task scopes: policy:read')
  })

  it('blocks tasks addressed to a different service', () => {
    const sdk = createGalServiceSdk({ agentCard: minimalPolicyAgentCard() })

    expect(() =>
      sdk.createTask({
        caller: {
          type: 'service',
          id: 'example-private',
          serviceId: 'example-private.lifecycle',
        },
        calleeAgentId: 'stratus.status',
        authorization: {
          methods: ['service_token'],
          scopes: ['policy:read'],
        },
        input: {
          taskType: 'policy.status.report',
          payload: {},
        },
      }),
    ).toThrow('Task callee stratus.status does not match Agent Card agent gal.policy')
  })

  it('validates runtime defaults before publishing an Agent Card', () => {
    const card = {
      ...minimalPolicyAgentCard(),
      runtime: {
        defaultRuntime: 'queue_worker',
        supportedRuntimes: ['direct_api'],
        backgroundSessionRequired: false,
      },
    } satisfies GalServiceAgentCard

    expect(() => validateGalServiceAgentCard(card)).toThrow(
      'Default runtime queue_worker must be in supportedRuntimes',
    )
  })

  it('creates HTTP/JSON delegated tasks with auth and trace headers', async () => {
    const requests: Array<{ url: string; init?: { method?: string; headers?: Record<string, string>; body?: string } }> = []
    const card = minimalPolicyAgentCard()
    const delegatedTask = minimalTask(card)
    const client = createGalHttpJsonAgentClient({
      baseUrl: 'https://agent.example.test/',
      authToken: async () => 'service-token',
      fetch: async (url, init) => {
        requests.push({ url, init })

        if (url.endsWith('/agent-card')) {
          return jsonResponse({ agentCard: card })
        }

        return jsonResponse({ task: delegatedTask, agentCard: card }, 201)
      },
    })

    await expect(client.getAgentCard({ requestId: 'req-card' })).resolves.toEqual(card)
    const response = await client.createTask(
      {
        caller: delegatedTask.caller,
        calleeAgentId: card.agentId,
        authorization: delegatedTask.authorization,
        input: delegatedTask.input,
        correlationId: delegatedTask.correlationId,
      },
      {
        requestId: 'req-task',
        correlationId: delegatedTask.correlationId,
      },
    )

    expect(response.task.id).toBe('task_http_json_1')
    expect(response.agentCard?.agentId).toBe('gal.policy')
    expect(requests.map((request) => request.url)).toEqual([
      'https://agent.example.test/api/agent-network/agent-card',
      'https://agent.example.test/api/agent-network/tasks',
    ])
    expect(requests[1].init?.headers).toEqual(expect.objectContaining({
      Authorization: 'Bearer service-token',
      'X-Request-ID': 'req-task',
      'X-Correlation-ID': delegatedTask.correlationId,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    }))
    expect(JSON.parse(requests[1].init?.body ?? '{}')).toEqual(expect.objectContaining({
      calleeAgentId: 'gal.policy',
      correlationId: delegatedTask.correlationId,
    }))
  })

  it('surfaces structured HTTP/JSON agent failures without losing retry metadata', async () => {
    const client = createGalHttpJsonAgentClient({
      baseUrl: 'https://agent.example.test',
      authToken: 'service-token',
      fetch: async () =>
        jsonResponse(
          {
            code: 'MISSING_SERVICE_TASK_SCOPE',
            error: 'Missing service task scopes: policy:read',
          },
          403,
          'Forbidden',
          { 'retry-after': '30' },
        ),
    })

    await expect(
      client.createTask({
        caller: {
          type: 'service',
          id: 'example-private',
          serviceId: 'example-private.lifecycle',
        },
        calleeAgentId: 'gal.policy',
        authorization: {
          methods: ['service_token'],
          scopes: [],
        },
        input: {
          taskType: 'policy.status.report',
          payload: {},
        },
      }),
    ).rejects.toMatchObject<Partial<GalHttpJsonAgentClientError>>({
      name: 'GalHttpJsonAgentClientError',
      status: 403,
      code: 'MISSING_SERVICE_TASK_SCOPE',
      retryAfter: '30',
    })
  })

  it('defines portable swarm wave ledger event metadata over existing task contracts', () => {
    const task = {
      ...minimalTask(minimalPolicyAgentCard()),
      parentTaskId: 'task_parent_wave',
    }
    const taskMetadata = buildGalSwarmWaveLedgerTaskMetadata(task)

    const eventMetadata = {
      waveId: 'wave_20260511_contracts',
      leaseId: 'lease_worker_7',
      workerId: 'worker_7',
      eventType: 'artifact.recorded',
      ...taskMetadata,
    } satisfies GalSwarmWaveLedgerEventMetadata

    const envelope = {
      schemaVersion: GAL_SWARM_WAVE_LEDGER_EVENT_SCHEMA_VERSION,
      id: 'swarm_evt_1',
      eventType: eventMetadata.eventType,
      occurredAt: '2026-05-11T18:15:00.000Z',
      waveId: eventMetadata.waveId,
      leaseId: eventMetadata.leaseId,
      workerId: eventMetadata.workerId,
      task: taskMetadata,
      actor: task.callee,
      artifacts: [
        {
          id: 'artifact_wave_ledger_summary',
          name: 'wave-ledger-summary.json',
          kind: 'json',
          mediaType: 'application/json',
        },
      ],
      evidence: [
        {
          id: 'evidence_actions_run',
          url: 'https://github.com/gal-run/agent-network/actions/runs/123',
          label: 'Focused contract test run',
          mediaType: 'text/html',
        },
      ],
      metadata: {
        transport: 'http_json',
      },
    } satisfies GalSwarmWaveLedgerEnvelope

    expect(GAL_SWARM_WAVE_LEDGER_EVENT_TYPES).toContain('lease.acquired')
    expect(isGalSwarmWaveLedgerEventType('artifact.recorded')).toBe(true)
    expect(isGalSwarmWaveLedgerEventType('task.persisted')).toBe(false)
    expect(envelope.task.correlationId).toBe(task.correlationId)
    expect(envelope.task.parentTaskId).toBe(task.parentTaskId)
    expect(envelope.artifacts?.[0].kind).toBe('json')
    expect(envelope.evidence?.[0].url).toContain('/actions/runs/')
  })
})

function minimalPolicyAgentCard(): GalServiceAgentCard {
  return {
    schemaVersion: GAL_SERVICE_AGENT_CARD_SCHEMA_VERSION,
    agentId: 'gal.policy',
    displayName: 'GAL Policy Agent',
    description: 'Evaluates approved configuration and enforcement decisions.',
    ownerOrg: 'gal-run',
    repo: 'gal-run/agent-network',
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
      logName: 'gal-service-tasks',
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

function minimalTask(card: GalServiceAgentCard): GalServiceTask {
  const caller = {
    type: 'service',
    id: 'example-private',
    serviceId: 'example-private.lifecycle',
  } as const
  const callee = {
    type: 'agent',
    id: card.agentId,
    agentId: card.agentId,
  } as const

  return {
    schemaVersion: GAL_SERVICE_TASK_SCHEMA_VERSION,
    id: 'task_http_json_1',
    correlationId: 'corr_http_json_1',
    agentId: card.agentId,
    state: 'completed',
    caller,
    callee,
    authorization: {
      methods: ['service_token'],
      scopes: ['policy:read'],
    },
    audit: {
      correlationId: 'corr_http_json_1',
      requestedBy: caller,
      callerService: caller,
      calleeAgent: callee,
    },
    input: {
      taskType: 'policy.status.report',
      payload: {},
    },
    output: {
      payload: { ready: true },
      summary: 'Policy status completed.',
    },
    artifacts: [],
    history: [
      {
        state: 'completed',
        at: '2026-05-09T09:30:00.000Z',
        actor: callee,
        reason: 'task_completed',
      },
    ],
    createdAt: '2026-05-09T09:30:00.000Z',
    updatedAt: '2026-05-09T09:30:00.000Z',
  }
}

function jsonResponse(
  body: unknown,
  status = 200,
  statusText = 'OK',
  headers: Record<string, string> = {},
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText,
    headers: {
      get(name: string) {
        return headers[name.toLowerCase()] ?? headers[name] ?? null
      },
    },
    async text() {
      return JSON.stringify(body)
    },
  }
}
