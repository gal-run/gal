import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './api'

describe('APIClient managed-agent contracts', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('lists managed agents from the org-scoped control-plane endpoint', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchWithAuth').mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        orgName: 'Scheduler Systems',
        agents: [
          {
            id: 'gal.ops-triage',
            orgName: 'Scheduler Systems',
            displayName: 'Ops triage',
            taskType: 'ops.email.triage',
            agentCardRef: 'gal-agents://agent-cards/ops-triage',
            requiredEvalSuites: ['gal.ops-triage.email.v1'],
            createdAt: '2026-05-16T00:00:00.000Z',
            updatedAt: '2026-05-16T00:00:00.000Z',
          },
        ],
      }),
    } as any)

    const agents = await api.listManagedAgents('Scheduler Systems')

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3000/api/managed-agents/Scheduler%20Systems',
    )
    expect(agents[0].id).toBe('gal.ops-triage')
  })

  it('creates managed-agent versions without a Gmail-specific method or payload shape', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchWithAuth').mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        version: {
          orgName: 'Scheduler-Systems',
          agentId: 'gal.slack-triage',
          version: '2026-05-16.1',
          runtimeRef: 'gal-worker://managed-agent-runtime',
          executionTargetRef: 'gal-endpoints://managed-runners/ops-triage-slack-dry-run',
          runnerRefs: ['gal-runners://ops-triage/slack-dry-run'],
          connectorRefs: [{ id: 'slack-mcp', kind: 'mcp' }],
          vaultRefIds: ['vault:slack-oauth'],
          evalSuites: ['gal.ops-triage.slack.v1'],
          status: 'draft',
          latestGateStatus: 'not_run',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      }),
    } as any)

    const version = await api.createManagedAgentVersion(
      'Scheduler-Systems',
      'gal.slack-triage',
      {
        version: '2026-05-16.1',
        runtimeRef: 'gal-worker://managed-agent-runtime',
        executionTargetRef: 'gal-endpoints://managed-runners/ops-triage-slack-dry-run',
        runnerRefs: ['gal-runners://ops-triage/slack-dry-run'],
        connectorRefs: [{ id: 'slack-mcp', kind: 'mcp' }],
        vaultRefIds: ['vault:slack-oauth'],
      },
    )

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3000/api/managed-agents/Scheduler-Systems/gal.slack-triage/versions',
      {
        method: 'POST',
        body: JSON.stringify({
          version: '2026-05-16.1',
          runtimeRef: 'gal-worker://managed-agent-runtime',
          executionTargetRef: 'gal-endpoints://managed-runners/ops-triage-slack-dry-run',
          runnerRefs: ['gal-runners://ops-triage/slack-dry-run'],
          connectorRefs: [{ id: 'slack-mcp', kind: 'mcp' }],
          vaultRefIds: ['vault:slack-oauth'],
        }),
      },
    )
    expect(version.executionTargetRef).toBe('gal-endpoints://managed-runners/ops-triage-slack-dry-run')
    expect(version.runnerRefs).toEqual(['gal-runners://ops-triage/slack-dry-run'])
    expect(version.connectorRefs[0]).toEqual({ id: 'slack-mcp', kind: 'mcp' })
  })

  it('submits gal-evals report snapshots for gate evaluation', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchWithAuth').mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        evalRun: {
          runId: 'eval-1',
          orgName: 'Scheduler-Systems',
          agentId: 'gal.ops-triage',
          version: '2026-05-16.1',
          suiteId: 'gal.ops-triage.email.v1',
          status: 'completed',
          gateStatus: 'passed',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
        },
      }),
    } as any)

    const reportSnapshot = {
      schemaVersion: 'gal.evals.report.v1' as const,
      suiteId: 'gal.ops-triage.email.v1',
      passed: true,
      score: 1,
    }

    const evalRun = await api.createManagedAgentEvalRun(
      'Scheduler-Systems',
      'gal.ops-triage',
      '2026-05-16.1',
      {
        suiteId: 'gal.ops-triage.email.v1',
        reportSnapshot,
      },
    )

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3000/api/managed-agents/Scheduler-Systems/gal.ops-triage/versions/2026-05-16.1/eval-runs',
      {
        method: 'POST',
        body: JSON.stringify({
          suiteId: 'gal.ops-triage.email.v1',
          reportSnapshot,
        }),
      },
    )
    expect(evalRun.gateStatus).toBe('passed')
  })

  it('submits worker-completed reports to an existing eval run', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchWithAuth').mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        evalRun: {
          runId: 'eval-1',
          orgName: 'Scheduler-Systems',
          agentId: 'gal.ops-triage',
          version: '2026-05-16.1',
          suiteId: 'gal.ops-triage.email.v1',
          status: 'completed',
          gateStatus: 'passed',
          createdAt: '2026-05-16T00:00:00.000Z',
          updatedAt: '2026-05-16T00:00:00.000Z',
          completedAt: '2026-05-16T00:00:00.000Z',
        },
      }),
    } as any)

    const reportSnapshot = {
      schemaVersion: 'gal.evals.report.v1' as const,
      suiteId: 'gal.ops-triage.email.v1',
      passed: true,
      score: 0.95,
    }

    const evalRun = await api.submitManagedAgentEvalReport(
      'Scheduler-Systems',
      'gal.ops-triage',
      '2026-05-16.1',
      'eval-1',
      { reportSnapshot },
    )

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3000/api/managed-agents/Scheduler-Systems/gal.ops-triage/versions/2026-05-16.1/eval-runs/eval-1/report',
      {
        method: 'POST',
        body: JSON.stringify({ reportSnapshot }),
      },
    )
    expect(evalRun.status).toBe('completed')
    expect(evalRun.gateStatus).toBe('passed')
  })

  it('surfaces promotion gate failures to the UI layer', async () => {
    vi.spyOn(api, 'fetchWithAuth').mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({
        error: 'managed_agent_conflict',
        message: 'Cannot promote managed-agent version until required eval gates pass',
      }),
    } as any)

    await expect(
      api.promoteManagedAgentVersion(
        'Scheduler-Systems',
        'gal.ops-triage',
        '2026-05-16.1',
      ),
    ).rejects.toThrow('Cannot promote managed-agent version until required eval gates pass')
  })

  it('claims queued eval runs through the worker work-packet endpoint', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchWithAuth').mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        workPacket: {
          schemaVersion: 'gal.managed_agents.eval_work_packet.v1',
          agent: {
            id: 'gal.ops-triage',
            orgName: 'Scheduler-Systems',
            displayName: 'Ops triage',
            taskType: 'ops.email.triage',
            agentCardRef: 'gal-agents://agent-cards/ops-triage',
            requiredEvalSuites: ['gal.ops-triage.email.v1'],
            createdAt: '2026-05-16T00:00:00.000Z',
            updatedAt: '2026-05-16T00:00:00.000Z',
          },
          version: {
            orgName: 'Scheduler-Systems',
            agentId: 'gal.ops-triage',
            version: '2026-05-16.1',
            runtimeRef: 'gal-worker://managed-agent-runtime',
            executionTargetRef: 'gal-endpoints://managed-runners/ops-triage-email-dry-run',
            runnerRefs: ['gal-runners://ops-triage/email-dry-run'],
            connectorRefs: [{ kind: 'gmail', id: 'gmail-primary' }],
            vaultRefIds: ['vault:gmail-oauth'],
            evalSuites: ['gal.ops-triage.email.v1'],
            status: 'evaluating',
            latestGateStatus: 'not_run',
            createdAt: '2026-05-16T00:00:00.000Z',
            updatedAt: '2026-05-16T00:00:00.000Z',
          },
          evalRun: {
            runId: 'eval-1',
            orgName: 'Scheduler-Systems',
            agentId: 'gal.ops-triage',
            version: '2026-05-16.1',
            suiteId: 'gal.ops-triage.email.v1',
            status: 'running',
            gateStatus: 'not_run',
            createdAt: '2026-05-16T00:00:00.000Z',
            updatedAt: '2026-05-16T00:00:00.000Z',
          },
          submission: {
            method: 'POST',
            path: '/api/managed-agents/Scheduler-Systems/gal.ops-triage/versions/2026-05-16.1/eval-runs/eval-1/report',
            reportSchemaVersion: 'gal.evals.report.v1',
          },
        },
      }),
    } as any)

    const workPacket = await api.claimManagedAgentEvalRun(
      'Scheduler-Systems',
      'gal.ops-triage',
      '2026-05-16.1',
      'eval-1',
    )

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3000/api/managed-agents/Scheduler-Systems/gal.ops-triage/versions/2026-05-16.1/eval-runs/eval-1/claim',
      { method: 'POST' },
    )
    expect(workPacket.schemaVersion).toBe('gal.managed_agents.eval_work_packet.v1')
    expect(workPacket.submission.reportSchemaVersion).toBe('gal.evals.report.v1')
  })
})
