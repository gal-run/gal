import { describe, expect, it, vi } from 'vitest'
import { claimEvaluationRun, submitEvaluationReport } from './report-submitter.js'
import {
  GAL_EVAL_REPORT_SCHEMA_VERSION,
  type GalEvalReport,
} from './types.js'

const report: GalEvalReport = {
  schemaVersion: GAL_EVAL_REPORT_SCHEMA_VERSION,
  suiteId: 'gal.ops-triage.email.v1',
  suiteName: 'Email triage',
  evaluatorId: 'gal-evals',
  adapterId: 'prediction-file',
  subject: {
    kind: 'managed_agent',
    agentId: 'gal.ops-triage',
    taskType: 'ops.email.triage',
    version: '2026-05-16.1',
  },
  generatedAt: '2026-05-16T00:00:00.000Z',
  score: 1,
  passed: true,
  metrics: [],
  cases: [],
  suggestions: [],
}

describe('submitEvaluationReport', () => {
  it('claims a managed-agent eval run and returns the work packet', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        workPacket: {
          schemaVersion: 'gal.managed_agents.eval_work_packet.v1',
          agent: { id: 'gal.ops-triage', taskType: 'ops.email.triage' },
          version: { runtimeRef: 'gal-worker://managed-agent-runtime' },
          evalRun: {
            runId: 'eval-1',
            status: 'running',
            gateStatus: 'not_run',
          },
          submission: {
            method: 'POST',
            path: '/api/managed-agents/example-org/gal.ops-triage/versions/2026-05-16.1/eval-runs/eval-1/report',
            reportSchemaVersion: 'gal.evals.report.v1',
          },
        },
      }),
    })

    const workPacket = await claimEvaluationRun(
      {
        apiBaseUrl: 'https://api.gal.run/',
        orgName: 'Example Org',
        agentId: 'gal.ops-triage',
        version: '2026-05-16.1',
        runId: 'eval-1',
        bearerToken: 'runner-token',
      },
      fetchImpl as unknown as typeof fetch,
    )

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.gal.run/api/managed-agents/Example%20Org/gal.ops-triage/versions/2026-05-16.1/eval-runs/eval-1/claim',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer runner-token',
        },
        body: JSON.stringify({}),
      },
    )
    expect(workPacket.evalRun.status).toBe('running')
    expect(workPacket.schemaVersion).toBe('gal.managed_agents.eval_work_packet.v1')
    expect(workPacket.submission.reportSchemaVersion).toBe('gal.evals.report.v1')
  })

  it('posts a gal.evals.report.v1 snapshot to the managed-agent eval run', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        evalRun: {
          runId: 'eval-1',
          status: 'completed',
          gateStatus: 'passed',
        },
      }),
    })

    const evalRun = await submitEvaluationReport(
      report,
      {
        apiBaseUrl: 'https://api.gal.run/',
        orgName: 'Example Org',
        agentId: 'gal.ops-triage',
        version: '2026-05-16.1',
        runId: 'eval-1',
        bearerToken: 'runner-token',
      },
      fetchImpl as unknown as typeof fetch,
    )

    expect(fetchImpl).toHaveBeenCalledWith(
      'https://api.gal.run/api/managed-agents/Example%20Org/gal.ops-triage/versions/2026-05-16.1/eval-runs/eval-1/report',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: 'Bearer runner-token',
        },
        body: JSON.stringify({ reportSnapshot: report }),
      },
    )
    expect(evalRun.gateStatus).toBe('passed')
  })

  it('surfaces API submission failures', async () => {
    const fetchImpl = vi.fn().mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'invalid_managed_agent_request' }),
    })

    await expect(
      submitEvaluationReport(
        report,
        {
          apiBaseUrl: 'https://api.gal.run',
          orgName: 'example-org',
          agentId: 'gal.ops-triage',
          version: '2026-05-16.1',
          runId: 'eval-1',
        },
        fetchImpl as unknown as typeof fetch,
      ),
    ).rejects.toThrow('invalid_managed_agent_request')
  })
})
