import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { api } from './api'

describe('APIClient Agent Network observability contracts', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fetches recent Agent Network events from the sanitized org event endpoint', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchWithAuth').mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        orgName: 'Scheduler Systems',
        count: 1,
        summary: {
          count: 1,
          states: { completed: 1 },
          agents: { gal: 1 },
          taskTypes: { 'gal.status.read': 1 },
          failures: 0,
          latestAt: '2026-05-09T09:00:00.000Z',
        },
        events: [],
      }),
    } as any)

    const response = await api.getAgentNetworkEvents('Scheduler Systems', 75)

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3000/api/agent-network/Scheduler%20Systems/events?limit=75',
    )
    expect(response.summary.failures).toBe(0)
  })

  it('fetches a task transition timeline without requesting task payloads', async () => {
    const fetchSpy = vi.spyOn(api, 'fetchWithAuth').mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({
        orgName: 'Scheduler-Systems',
        taskId: 'gal_task_1',
        count: 2,
        summary: {
          count: 2,
          states: { submitted: 1, completed: 1 },
          agents: { gal: 2 },
          taskTypes: { 'gal.status.read': 2 },
          failures: 0,
        },
        events: [
          {
            id: 'evt-1',
            orgName: 'Scheduler-Systems',
            taskId: 'gal_task_1',
            correlationId: 'corr-1',
            sequence: 0,
            state: 'submitted',
            reason: 'task_created',
            at: '2026-05-09T09:00:00.000Z',
            agentId: 'gal',
            taskType: 'gal.status.read',
            artifacts: { count: 0, names: [] },
          },
        ],
      }),
    } as any)

    const response = await api.getAgentNetworkTaskEvents('Scheduler-Systems', 'gal_task_1')

    expect(fetchSpy).toHaveBeenCalledWith(
      'http://localhost:3000/api/agent-network/Scheduler-Systems/tasks/gal_task_1/events',
    )
    expect(response.events[0]).not.toHaveProperty('payload')
    expect(response.events[0]).not.toHaveProperty('input')
    expect(response.events[0]).not.toHaveProperty('output')
  })

  it('surfaces Agent Network endpoint failures to the dashboard', async () => {
    vi.spyOn(api, 'fetchWithAuth').mockResolvedValue({
      ok: false,
      json: vi.fn().mockResolvedValue({ error: 'Agent Network events unavailable' }),
    } as any)

    await expect(api.getAgentNetworkEvents('Scheduler-Systems')).rejects.toThrow(
      'Agent Network events unavailable',
    )
  })
})
