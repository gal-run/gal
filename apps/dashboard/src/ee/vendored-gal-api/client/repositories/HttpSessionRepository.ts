/**
 * HTTP Repository Adapter for Background Agent Sessions
 *
 * Implements session management using HTTP calls to the API.
 * Used by CLI and other interfaces to create/list/manage background agent sessions.
 */

import type {
  CreateSessionRequest,
  Session,
  SessionListResponse,
  SessionStatus,
  SessionDispatchBackend,
} from '@gal/types'

/** Directive types understood by the runner and MCP tools */
export type DirectiveType = 'claim_task' | 'stop' | 'switch_branch' | 'inject-context' | 'change-approach' | 'custom'

export interface SendDirectiveRequest {
  /** Session ID receiving the directive */
  targetSessionId: string
  /** Directive type */
  type: DirectiveType
  /** Directive payload */
  payload?: Record<string, unknown>
}

export interface SendDirectiveResponse {
  success: boolean
  directiveId: string
  targetSessionId: string
}
import { HttpClient, type HttpClientConfig } from '../HttpClient'

export interface ListSessionsParams {
  status?: SessionStatus
  limit?: number
  cursor?: string
}

export interface ResumeSessionResponse {
  success: boolean
  sessionId: string
  workflowRunId: number
  agentSessionId: string
  message: string
}

export class HttpSessionRepository extends HttpClient {
  constructor(config: HttpClientConfig) {
    super(config)
  }

  async create(request: CreateSessionRequest): Promise<Session> {
    return await this.fetchJson<Session>('/api/sessions', {
      method: 'POST',
      body: JSON.stringify(request),
    })
  }

  async list(params: ListSessionsParams = {}): Promise<SessionListResponse> {
    const searchParams = new URLSearchParams()
    if (params.status) searchParams.set('status', params.status)
    if (typeof params.limit === 'number') searchParams.set('limit', String(params.limit))
    if (params.cursor) searchParams.set('cursor', params.cursor)

    const query = searchParams.toString()
    return await this.fetchJson<SessionListResponse>(`/api/sessions${query ? `?${query}` : ''}`)
  }

  async get(sessionId: string): Promise<Session> {
    return await this.fetchJson<Session>(`/api/sessions/${encodeURIComponent(sessionId)}`)
  }

  async terminate(sessionId: string, reason?: string): Promise<Session> {
    return await this.fetchJson<Session>(`/api/sessions/${encodeURIComponent(sessionId)}`, {
      method: 'DELETE',
      ...(reason ? { body: JSON.stringify({ reason }) } : {}),
    })
  }

  async resume(
    sessionId: string,
    prompt: string,
    dispatchBackend?: SessionDispatchBackend,
  ): Promise<ResumeSessionResponse> {
    const body: Record<string, unknown> = { prompt };
    if (dispatchBackend) body.dispatchBackend = dispatchBackend;
    return await this.fetchJson<ResumeSessionResponse>(
      `/api/sessions/${encodeURIComponent(sessionId)}/resume`,
      {
        method: 'POST',
        body: JSON.stringify(body),
      },
    )
  }

  async reconnect(sessionId: string): Promise<Session> {
    return await this.fetchJson<Session>(
      `/api/sessions/${encodeURIComponent(sessionId)}/reconnect`,
      { method: 'POST' },
    )
  }

  /**
   * Send a directive to a target session.
   *
   * The directive is persisted in Firebase RTDB under
   * `sessions/{targetSessionId}/directives/` and picked up by
   * the running agent on the next polling cycle.
   *
   * @param fromSessionId - The calling session's ID (used as audit trail `from`)
   * @param request - Directive details
   */
  async sendDirective(
    fromSessionId: string,
    request: SendDirectiveRequest,
  ): Promise<SendDirectiveResponse> {
    return await this.fetchJson<SendDirectiveResponse>(
      `/api/sessions/${encodeURIComponent(fromSessionId)}/directive`,
      {
        method: 'POST',
        body: JSON.stringify({
          targetSessionId: request.targetSessionId,
          type: request.type,
          payload: request.payload ?? {},
        }),
      },
    )
  }

  /**
   * Get (and mark-as-read) pending directives for a session.
   */
  async getDirectives(sessionId: string): Promise<{ sessionId: string; directives: Array<{ id: string; from: string; type: string; payload: unknown; createdAt: string }> }> {
    return await this.fetchJson(
      `/api/sessions/${encodeURIComponent(sessionId)}/directives`,
    )
  }
}
