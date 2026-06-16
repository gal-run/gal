/**
 * HTTP Repository Adapter for Workflow Testing
 *
 * Implements workflow test operations using HTTP calls to the API
 * Used by CLI and dashboard to test Claude Code configurations
 */

import { HttpClient, type HttpClientConfig } from '../HttpClient'

export interface WorkflowTestRequest {
  fileName: string
  type: 'command' | 'hook'
  platform: string
  content: string
  testCases: string[]
  maxIterations: number
}

export class HttpWorkflowTestRepository extends HttpClient {
  constructor(config: HttpClientConfig) {
    super(config)
  }

  async testWorkflow(orgName: string, request: WorkflowTestRequest): Promise<any> {
    const response = await this.fetchJson<{ result: any }>(
      `/organizations/${encodeURIComponent(orgName)}/workflow-test`,
      {
        method: 'POST',
        body: JSON.stringify(request),
      }
    )
    return response.result
  }

  async testWorkflowBatch(orgName: string, requests: WorkflowTestRequest[]): Promise<any> {
    const response = await this.fetchJson<{ report: any }>(
      `/organizations/${encodeURIComponent(orgName)}/workflow-test/batch`,
      {
        method: 'POST',
        body: JSON.stringify({ requests }),
      }
    )
    return response.report
  }
}
