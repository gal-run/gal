/**
 * HTTP Repository Adapter for Admin Operations
 *
 * Implements admin-only operations using HTTP calls to the API
 * Used by CLI and dashboard for administrative tasks
 */

import { HttpClient, type HttpClientConfig } from '../HttpClient'

export interface GrantPlanResponse {
  success: boolean
  organization: string
  planTier: string
  seatLimit: number
  grantedBy: string
}

export interface OrgSummary {
  name: string
  planTier: string
  seatLimit: number
  totalConfigs: number
  manualGrant?: {
    grantedBy: string
    grantedAt: string
    reason: string
  }
}

export class HttpAdminRepository extends HttpClient {
  constructor(config: HttpClientConfig) {
    super(config)
  }

  async grantPlan(orgName: string, planTier: string, reason: string): Promise<GrantPlanResponse> {
    return this.fetchJson<GrantPlanResponse>(
      `/admin/organizations/${encodeURIComponent(orgName)}/grant-plan`,
      {
        method: 'POST',
        body: JSON.stringify({ planTier, reason }),
      }
    )
  }

  async listOrganizations(): Promise<{ organizations: OrgSummary[]; total: number }> {
    return this.fetchJson<{ organizations: OrgSummary[]; total: number }>('/admin/organizations')
  }
}
