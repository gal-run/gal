/**
 * HTTP Repository Adapter for Runner Operations
 *
 * Implements runner-specific operations using HTTP calls to the API
 * Used by background agent runners to retrieve credentials and session data
 */

import { HttpClient, type HttpClientConfig } from '../HttpClient'

export interface RunnerCredentials {
  claudeAiOauth?: {
    accessToken: string
    refreshToken: string
  }
  mcpOAuth?: Record<string, unknown>
}

export class HttpRunnerRepository extends HttpClient {
  constructor(config: HttpClientConfig) {
    super(config)
  }

  async getCredentials(sessionId: string): Promise<RunnerCredentials> {
    return this.fetchJson<RunnerCredentials>(
      `/api/sessions/${encodeURIComponent(sessionId)}/runner/credentials`
    )
  }
}
