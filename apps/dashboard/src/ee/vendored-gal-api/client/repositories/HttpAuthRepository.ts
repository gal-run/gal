/**
 * HTTP Repository Adapter for Auth Operations
 *
 * Provides CLI/extension auth operations (NOT server-side IAuthRepository)
 * Used by CLI and VS Code extension for:
 * - User info and context
 * - Personal workspace operations
 * - Developer status reporting
 */

import type { AgentPlatform, CurrentUser, UserContextResponse, WorkspaceView } from '@gal/types'
import { HttpClient, type HttpClientConfig } from '../HttpClient'

export interface ScanProgress {
  status: 'scanning' | 'complete' | 'error'
  totalRepos: number
  scannedRepos: number
  configsFound: number
  startedAt: string
  error?: string
}

export interface DeveloperPlatformSyncStatus {
  syncStatus: 'synced' | 'outdated' | 'never_synced'
  lastSyncAt?: string
  syncedConfigVersion?: string
}

export class HttpAuthRepository extends HttpClient {
  constructor(config: HttpClientConfig) {
    super(config)
  }

  /**
   * Get current authenticated user info
   */
  async getCurrentUser(): Promise<CurrentUser> {
    const response = await this.fetchJson<{ user: CurrentUser }>('/auth/me')
    return response.user
  }

  /**
   * List workspaces the user has access to
   */
  async getWorkspaces(): Promise<WorkspaceView[]> {
    const response = await this.fetchJson<{ workspaces: WorkspaceView[] }>('/workspaces')
    return response.workspaces
  }

  /**
   * Get user context with capabilities
   * Returns org memberships and detected permissions from GitHub
   */
  async getUserContext(): Promise<UserContextResponse> {
    const response = await this.fetchJson<UserContextResponse>('/api/user/context')
    return response
  }

  /**
   * Test API connectivity
   */
  async testConnection(): Promise<boolean> {
    try {
      const response = await this.fetchJson<{ status: string; service: string }>('/health')
      // Accept both service names: 'gal-api' (legacy) and 'gal-run-api' (production Cloud Run).
      // The API returns 'gal-run-api' in production but some clients may expect 'gal-api'.
      // TODO: Converge on a single name once all clients are updated.
      return response.status === 'ok' && (response.service === 'gal-api' || response.service === 'gal-run-api')
    } catch (error) {
      return false
    }
  }

  /**
   * Get personal GitHub connection status
   */
  async getPersonalGitHubStatus(): Promise<{ connected: boolean; username?: string }> {
    const response = await this.fetchJson<{ connected: boolean; username?: string }>(
      '/auth/github/personal/status'
    )
    return response
  }

  /**
   * Get personal approved config selection
   */
  async getPersonalApprovedConfig(): Promise<{
    approved: boolean
    sourceRepo?: string
    configContent?: string
    version?: string
    hash?: string
    approvedAt?: string
  }> {
    const response = await this.fetchJson<{
      approved: boolean
      sourceRepo?: string
      configContent?: string
      version?: string
      hash?: string
      approvedAt?: string
    }>('/personal/approved-config')
    return response
  }

  /**
   * Get personal discovered repos with Claude configs
   */
  async getPersonalConfigRepos(): Promise<{
    repos: Array<{
      name: string
      fullName: string
      configCount: number
      configTypes: string[]
      lastScanned: string
    }>
    totalRepos: number
    lastScanAt: string | null
    username: string
  }> {
    const response = await this.fetchJson<{
      repos: Array<{
        name: string
        fullName: string
        configCount: number
        configTypes: string[]
        lastScanned: string
      }>
      totalRepos: number
      lastScanAt: string | null
      username: string
    }>('/personal/discovered-repos')
    return response
  }

  /**
   * Get configs from a specific personal repo
   */
  async getPersonalRepoConfigs(repoName: string): Promise<{
    repo: string
    configs: Array<{
      type: string
      name: string
      path: string
      content: string
      lastModified: string
    }>
    totalConfigs: number
  }> {
    const response = await this.fetchJson<{
      repo: string
      configs: Array<{
        type: string
        name: string
        path: string
        content: string
        lastModified: string
      }>
      totalConfigs: number
    }>(`/personal/discovered-configs/${encodeURIComponent(repoName)}`)
    return response
  }

  /**
   * Sync provider credentials to GAL for background agent sessions
   */
  async syncCredentials(
    provider: 'claude' | 'codex' | 'gemini',
    credentials: Record<string, unknown>
  ): Promise<{ success: boolean; error?: string; tokenPrefix?: string }> {
    return this.fetchJson<{ success: boolean; error?: string; tokenPrefix?: string }>(
      `/api/credentials/${provider}`,
      {
        method: 'POST',
        body: JSON.stringify(credentials),
      }
    )
  }

  /**
   * Get organization details
   */
  async getOrganization(orgName: string): Promise<any> {
    const response = await this.fetchJson<{ organization: any }>(`/organizations/${orgName}`)
    return response.organization
  }

  /**
   * Trigger a scan for an organization
   */
  async scanOrganization(orgName: string): Promise<any> {
    return this.fetchJson<any>(`/scan/${orgName}`, { method: 'POST' })
  }

  /**
   * Get scan progress for an organization
   */
  async getScanProgress(orgName: string): Promise<ScanProgress | null> {
    try {
      return this.fetchJson<ScanProgress>(`/scan/${orgName}/progress`)
    } catch {
      return null
    }
  }

  /**
   * Get organization's default enforcement policy
   */
  async getOrgPolicy(orgName: string): Promise<any | null> {
    try {
      const response = await this.fetchJson<{ policy: any }>(`/organizations/${orgName}/policy`)
      return response.policy
    } catch {
      return null
    }
  }

  /**
   * List the current user's browser profiles (metadata only).
   * Used by `gal sync --pull` to discover which profiles to download.
   */
  async listBrowserProfiles(): Promise<{
    profiles: Array<{
      id: string
      name: string
      domains: string[]
      cookieCount: number
      earliestExpiry: number | null
      status: string
      createdAt: string
      updatedAt: string
    }>
  }> {
    return this.fetchJson('/api/browser-profiles')
  }

  /**
   * Get the decrypted storage state for a single browser profile.
   * Returns the raw Playwright-compatible storage state JSON string.
   */
  async getBrowserProfileState(profileId: string): Promise<string> {
    const response = await this.fetchJson<{ storageState: string }>(
      `/api/browser-profiles/${encodeURIComponent(profileId)}/state`
    )
    return response.storageState
  }

  /**
   * Report developer status to the dashboard
   * Allows admins to see who has CLI installed, authenticated, and synced
   */
  async reportDeveloperStatus(
    orgName: string,
    status: {
      cliInstalled?: boolean
      cliVersion?: string
      authenticated?: boolean
      authExpiresAt?: string
      lastSyncAt?: string
      syncedConfigVersion?: string
      syncStatus?: 'synced' | 'outdated' | 'never_synced'
      syncedPlatforms?: AgentPlatform[]
      platformSync?: Partial<Record<AgentPlatform, DeveloperPlatformSyncStatus>>
    }
  ): Promise<{ success: boolean; message: string }> {
    const response = await this.fetchJson<{ success: boolean; message: string }>(
      `/organizations/${encodeURIComponent(orgName)}/developer-status`,
      {
        method: 'POST',
        body: JSON.stringify(status),
      }
    )
    return response
  }
}
