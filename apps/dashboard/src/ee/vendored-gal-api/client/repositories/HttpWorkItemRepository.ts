/**
 * HTTP Repository Adapter for Work Items
 *
 * Implements work item management using HTTP calls to the API
 * Used by CLI and agents to manage work queue operations
 */

import { HttpClient, type HttpClientConfig } from '../HttpClient'

/**
 * API response shape for work items.
 *
 * Note: This is the JSON response DTO, distinct from `WorkItem` in `@gal/types`
 * which is the domain entity with `Date` fields and strict enums. The API returns
 * dates as ISO strings and uses loose string types for `type`.
 */
export interface WorkItem {
  id: string
  type: string
  status: 'pending' | 'claimed' | 'in_progress' | 'completed' | 'failed'
  priority: number
  command: string
  source: { type: string; id?: string; url?: string; issueNumber?: number }
  claimedBy?: string
  createdAt: string
  updatedAt: string
  sdlcPhase?: number
  parentIssueId?: string
  result?: { success: boolean; message?: string }
}

/**
 * GitHub issue summary returned by the work prioritizer API.
 */
export interface GitHubIssue {
  number: number
  title: string
  url: string
  labels: string[]
  priority: number
  sdlcProgress: {
    status: string
    completedPhases: number[]
    currentPhase: number | null
    totalJobs: number
  }
}

/**
 * Request payload for creating a new work item via the API.
 */
export interface CreateWorkItemRequest {
  type: string
  command: string
  sdlcPhase?: number
  parentIssueId?: string
  priority: number
  source: {
    type: string
    url?: string
    repository?: string
    issueNumber?: number
  }
  context?: string
}

/**
 * Request payload for adding an item to the queue via CLI.
 */
export interface AddToQueueRequest {
  command: string
  priority: number
  source: {
    type: string
    url?: string
    repository?: string
    issueNumber?: number
  }
  context?: string
  preferredAgent?: string
  runnerLabel?: string  // #4956: Target ARC runner label
}

/**
 * Response from adding a queue item.
 */
export interface AddToQueueResponse {
  workItem: WorkItem
  queuePosition?: number
  warnings?: string[]
  duplicate?: Pick<WorkItem, 'id' | 'status' | 'createdAt'>
}

/**
 * Queue health metrics.
 */
export interface QueueStats {
  pending: number
  active: number
  maxActive: number
  completed: number
  failed: number
  nextItem?: {
    id: string
    command: string
    priority: number
    createdAt: string
  } | null
  consumerPaused: boolean
  lastPollAt?: string | null
}

/**
 * Response from pause/resume operations.
 */
export interface QueueControlResponse {
  success: boolean
  paused: boolean
  alreadyPaused?: boolean
  alreadyRunning?: boolean
}

export class HttpWorkItemRepository extends HttpClient {
  constructor(config: HttpClientConfig) {
    super(config)
  }

  async list(params?: { status?: string; priority?: string; limit?: string }): Promise<WorkItem[]> {
    const searchParams = new URLSearchParams()
    if (params?.status) searchParams.append('status', params.status)
    if (params?.priority) searchParams.append('priority', params.priority)
    if (params?.limit) searchParams.append('limit', params.limit)
    const query = searchParams.toString()
    const response = await this.fetchJson<{ workItems?: WorkItem[] }>(`/api/work-items${query ? '?' + query : ''}`)
    return response.workItems || []
  }

  async create(request: CreateWorkItemRequest): Promise<WorkItem> {
    const response = await this.fetchJson<{ workItem: WorkItem }>('/api/work-items', {
      method: 'POST',
      body: JSON.stringify(request),
    })
    return response.workItem
  }

  async getNext(): Promise<WorkItem | null> {
    try {
      const response = await this.fetchJson<{ workItem: WorkItem }>('/api/work-items/next')
      return response.workItem
    } catch {
      return null
    }
  }

  async claim(workItemId: string, agentId: string): Promise<void> {
    await this.fetch(`/api/work-items/${workItemId}/claim`, {
      method: 'POST',
      body: JSON.stringify({ agentId }),
    })
  }

  async start(workItemId: string, agentId: string): Promise<void> {
    await this.fetch(`/api/work-items/${workItemId}/start`, {
      method: 'POST',
      body: JSON.stringify({ agentId }),
    })
  }

  async complete(workItemId: string, agentId: string, message?: string, details?: Record<string, unknown>): Promise<void> {
    await this.fetch(`/api/work-items/${workItemId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ agentId, message: message || 'Completed successfully', ...(details ? { details } : {}) }),
    })
  }

  async fail(workItemId: string, agentId: string, message: string, retry: boolean = true): Promise<void> {
    await this.fetch(`/api/work-items/${workItemId}/fail`, {
      method: 'POST',
      body: JSON.stringify({ agentId, message, retry }),
    })
  }

  async release(workItemId: string): Promise<void> {
    await this.fetch(`/api/work-items/${workItemId}/release`, {
      method: 'POST',
    })
  }

  async heartbeat(workItemId: string, agentId: string): Promise<void> {
    await this.fetch(`/api/work-items/${workItemId}/heartbeat`, {
      method: 'POST',
      body: JSON.stringify({ agentId }),
    })
  }

  async update(workItemId: string, data: Record<string, unknown>): Promise<void> {
    await this.fetch(`/api/work-items/${workItemId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    })
  }

  async getGitHubIssues(owner: string, repo: string): Promise<GitHubIssue[]> {
    const response = await this.fetchJson<{ issues?: GitHubIssue[] }>(
      `/api/work-prioritizer/github-issues?owner=${encodeURIComponent(owner)}&repo=${encodeURIComponent(repo)}`
    )
    return response.issues || []
  }

  async getNextPriority(orgId: string): Promise<{ workItem: any; suggestedCommand: string } | null> {
    try {
      return await this.fetchJson<{ workItem: any; suggestedCommand: string }>(
        `/api/work-prioritizer/next?org=${encodeURIComponent(orgId)}`
      )
    } catch {
      return null
    }
  }

  /**
   * Enqueue GitHub issues as work items via the work-prioritizer API.
   * Calls POST /api/work-prioritizer/enqueue.
   */
  async enqueueIssues(owner: string, repo: string, issueNumbers: number[]): Promise<{ success: boolean; result: any }> {
    return this.fetchJson<{ success: boolean; result: any }>('/api/work-prioritizer/enqueue', {
      method: 'POST',
      body: JSON.stringify({ owner, repo, issueNumbers }),
    })
  }

  // ---------------------------------------------------------------------------
  // Queue Management (gal queue commands)
  // ---------------------------------------------------------------------------

  /**
   * Add a work item to the queue (user-facing, simpler API than create()).
   * Performs duplicate detection and returns queue position.
   */
  async addToQueue(request: AddToQueueRequest): Promise<AddToQueueResponse> {
    const payload = {
      type: 'session',
      command: request.command,
      priority: request.priority,
      source: request.source,
      context: request.context,
      preferredAgent: request.preferredAgent,
      ...(request.runnerLabel ? { runnerLabel: request.runnerLabel } : {}),
    }

    const response = await this.fetchJson<{
      workItem: WorkItem
      warnings?: string[]
      queuePosition?: number
      duplicate?: Pick<WorkItem, 'id' | 'status' | 'createdAt'>
    }>('/api/work-items', {
      method: 'POST',
      body: JSON.stringify(payload),
    })

    return {
      workItem: response.workItem,
      queuePosition: response.queuePosition,
      warnings: response.warnings,
      duplicate: response.duplicate,
    }
  }

  /**
   * Get queue health statistics.
   */
  async getQueueStats(): Promise<QueueStats> {
    return this.fetchJson<QueueStats>('/api/work-items/queue/stats')
  }

  /**
   * Pause queue consumer (stop picking up new items).
   */
  async pauseQueue(): Promise<QueueControlResponse> {
    return this.fetchJson<QueueControlResponse>('/api/work-items/queue/pause', {
      method: 'POST',
    })
  }

  /**
   * Resume queue consumer.
   */
  async resumeQueue(): Promise<QueueControlResponse> {
    return this.fetchJson<QueueControlResponse>('/api/work-items/queue/resume', {
      method: 'POST',
    })
  }

  /**
   * Cancel a pending queue item.
   * Throws if the item is not in 'pending' status.
   */
  async cancelQueueItem(id: string): Promise<{ success: boolean; cancelled: string }> {
    return this.fetchJson<{ success: boolean; cancelled: string }>(
      `/api/work-items/${encodeURIComponent(id)}/cancel`,
      { method: 'POST' },
    )
  }
}
