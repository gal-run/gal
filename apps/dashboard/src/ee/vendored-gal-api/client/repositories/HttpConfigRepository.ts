/**
 * HTTP Repository Adapter for Config Operations
 *
 * Implements IConfigRepository using HTTP calls to the API
 * Used by CLI and VS Code extension to access config data without direct Firestore access
 */

import type {
  ApprovedConfig,
  ApprovedConfigEnforcementManifest,
  IConfigRepository,
} from '@gal/core'
import type { RuleSet } from '@gal/enforce-rules'
import type {
  ConfigVersion,
  ApprovedConfigResponse,
  AllPlatformConfigsResponse,
  DownloadedFile,
  ConfigDownloadResponse,
  AgentPlatform,
  SyncPreflightHintRequest,
  SyncPreflightHintResponse,
} from '@gal/types'
import { HttpClient, type HttpClientConfig } from '../HttpClient'

export interface ApprovedConfigEnforcementRuleSetResponse {
  manifest: ApprovedConfigEnforcementManifest
  rules: RuleSet
  hasSource: boolean
  sourceHash?: string
}

export class HttpConfigRepository extends HttpClient implements IConfigRepository {
  constructor(config: HttpClientConfig) {
    super(config)
  }

  async getApprovedConfig(
    orgName: string,
    platform?: string
  ): Promise<ApprovedConfig | null> {
    try {
      const response = await this.fetchJson<ApprovedConfigResponse>(
        `/organizations/${orgName}/approved-config?platform=${platform || 'claude'}`
      )

      if (!response.approved) {
        return null
      }

      return this.mapToApprovedConfig(response)
    } catch (error: unknown) {
      if ((error instanceof Error ? error.message : "").includes('404')) {
        return null
      }
      throw error
    }
  }

  async getAllApprovedConfigs(orgName: string): Promise<ApprovedConfig[]> {
    try {
      const response = await this.fetchJson<AllPlatformConfigsResponse>(
        `/organizations/${orgName}/approved-config?platform=all`
      )

      return Object.entries(response.configs).map(([platform, config]) =>
        this.mapToApprovedConfig({ ...config, platform })
      )
    } catch (error: unknown) {
      if ((error instanceof Error ? error.message : "").includes('404')) {
        return []
      }
      throw error
    }
  }

  async setApprovedConfig(orgName: string, config: ApprovedConfig): Promise<void> {
    await this.fetch(
      `/organizations/${orgName}/approved-config`,
      {
        method: 'PUT',
        body: JSON.stringify({
          platform: config.platform,
          hash: config.hash,
          policyName: config.policyName,
          configContent: (config as any).configContent,
          commands: config.commands,
          hooks: config.hooks,
          subagents: config.subagents,
          skills: config.skills,
          rules: config.rules,
          instructions: config.instructions,
          settings: config.settings,
          cursorRules: config.cursorRules,
          copilotInstructions: config.copilotInstructions,
          copilotPathInstructions: config.copilotPathInstructions,
          copilotAgents: config.copilotAgents,
          copilotSkills: config.copilotSkills,
          mcp: (config as any).mcp,
          enforcement: (config as any).enforcement,
          environment: (config as any).environment,
          enforcementSettings: config.enforcementSettings,
        }),
      }
    )
  }

  async deleteApprovedConfig(orgName: string, platform: string): Promise<void> {
    await this.fetch(
      `/organizations/${orgName}/approved-config?platform=${platform}`,
      {
        method: 'DELETE',
      }
    )
  }

  // ─────────────────────────────────────────────────────────────────
  // CLI-Specific Convenience Methods (not in interface)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Download all configs for an organization
   * Returns actual file contents from API
   */
  async downloadConfigs(orgName: string, platform?: AgentPlatform): Promise<DownloadedFile[]> {
    const params = new URLSearchParams()
    if (platform) params.set('platform', platform)

    const url = `/organizations/${orgName}/configs${params.toString() ? '?' + params.toString() : ''}`
    // Use longer timeout for config downloads (may involve many files)
    const response = await this.fetchJson<ConfigDownloadResponse>(url, {}, 120000)

    // Map API response to DownloadedFile format
    return response.configs.map(config => ({
      fileName: config.fileName,
      content: config.content,
      platform: config.platform as AgentPlatform,
      type: config.category as 'settings' | 'rule' | 'command' | 'hook',
      repoName: config.repoName,
    }))
  }

  /**
   * Get hook settings for an organization
   * Used by `gal sync --pull` to fetch reminder interval configuration
   */
  async getHookSettings(orgName: string): Promise<{
    globalIntervalMinutes?: number
    intervals?: Record<string, number>
  }> {
    try {
      const response = await this.fetchJson<{
        globalIntervalMinutes?: number
        intervals?: Record<string, number>
      }>(`/organizations/${orgName}/hook-settings`)
      return response
    } catch (error: unknown) {
      // Return defaults if hook settings not configured
      return {
        globalIntervalMinutes: 10,
        intervals: {},
      }
    }
  }

  /**
   * Remove specific items from approved config
   * Used by `gal approve --remove`
   */
  async removeFromApprovedConfig(
    orgName: string,
    platform: string,
    items: {
      commands?: string[]
      subagents?: string[]
      hooks?: string[]
      rules?: string[]
      skills?: string[]
    }
  ): Promise<{
    success: boolean
    removed: { commands: number; subagents: number; hooks: number; rules: number; skills: number }
    remaining: { commands: number; subagents: number; hooks: number; rules: number; skills: number }
    hash: string
  }> {
    const response = await this.fetchJson<{
      success: boolean
      removed: { commands: number; subagents: number; hooks: number; rules: number; skills: number }
      remaining: { commands: number; subagents: number; hooks: number; rules: number; skills: number }
      hash: string
    }>(
      `/organizations/${orgName}/approved-config/remove`,
      {
        method: 'PATCH',
        body: JSON.stringify({ platform, ...items }),
      }
    )
    return response
  }

  /**
   * Get raw approved config response (no domain mapping)
   * Used by VS Code extension which needs the raw API response shape
   */
  async getApprovedConfigResponse(
    orgName: string,
    platform?: string
  ): Promise<ApprovedConfigResponse> {
    return this.fetchJson<ApprovedConfigResponse>(
      `/organizations/${orgName}/approved-config?platform=${platform || 'claude'}`
    )
  }

  async getApprovedConfigEnforcementManifest(
    orgName: string,
    platform?: string
  ): Promise<ApprovedConfigEnforcementManifest | null> {
    try {
      const response = await this.fetchJson<{
        approved: boolean
        manifest?: ApprovedConfigEnforcementManifest
      }>(
        `/organizations/${orgName}/approved-config/enforcement-manifest?platform=${platform || 'claude'}`
      )

      if (!response.approved || !response.manifest) {
        return null
      }

      return response.manifest
    } catch (error: unknown) {
      if ((error instanceof Error ? error.message : "").includes('404')) {
        return null
      }
      throw error
    }
  }

  async getApprovedConfigEnforcementRuleSet(
    orgName: string,
    platform?: string
  ): Promise<ApprovedConfigEnforcementRuleSetResponse | null> {
    try {
      const response = await this.fetchJson<{
        approved: boolean
        manifest?: ApprovedConfigEnforcementManifest
        rules?: RuleSet
        hasSource?: boolean
        sourceHash?: string
      }>(
        `/organizations/${orgName}/approved-config/enforcement-rules?platform=${platform || 'claude'}`
      )

      if (!response.approved || !response.manifest || !response.rules) {
        return null
      }

      return {
        manifest: response.manifest,
        rules: response.rules,
        hasSource: response.hasSource === true,
        sourceHash: response.sourceHash,
      }
    } catch (error: unknown) {
      if ((error instanceof Error ? error.message : "").includes('404')) {
        return null
      }
      throw error
    }
  }

  /**
   * Get sync status for an organization
   */
  async getSyncStatus(orgName: string): Promise<{
    synced: boolean
    lastSyncAt: string | null
    driftDetected: boolean
    driftFiles: string[]
  }> {
    return this.fetchJson<{
      synced: boolean
      lastSyncAt: string | null
      driftDetected: boolean
      driftFiles: string[]
    }>(`/organizations/${orgName}/sync-status`)
  }

  /**
   * Get Sync Copilot preflight hint for `gal sync --pull`.
   * Returns null when the feature endpoint is unavailable.
   */
  async getSyncPreflightHint(
    orgName: string,
    request: SyncPreflightHintRequest = {}
  ): Promise<SyncPreflightHintResponse | null> {
    try {
      return await this.fetchJson<SyncPreflightHintResponse>(
        `/organizations/${orgName}/sync-preflight-hint`,
        {
          method: 'POST',
          body: JSON.stringify(request),
        }
      )
    } catch (error: unknown) {
      if ((error instanceof Error ? error.message : "").includes('404')) {
        return null
      }
      throw error
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Server-Only Methods (throw descriptive errors)
  // ─────────────────────────────────────────────────────────────────

  async createConfigVersion(
    _version: Omit<ConfigVersion, 'id'>
  ): Promise<number> {
    throw new Error('createConfigVersion() is server-side only (not implemented in HTTP client)')
  }

  async getConfigVersionByNumber(
    _scopeId: string,
    _scope: 'org' | 'project',
    _version: number
  ): Promise<ConfigVersion | null> {
    throw new Error('getConfigVersionByNumber() is server-side only (not implemented in HTTP client)')
  }

  async getConfigVersionHistory(
    _scopeId: string,
    _scope: 'org' | 'project'
  ): Promise<ConfigVersion[]> {
    throw new Error('getConfigVersionHistory() is server-side only (not implemented in HTTP client)')
  }

  async getActiveConfigVersion(
    _scopeId: string,
    _scope: 'org' | 'project'
  ): Promise<ConfigVersion | null> {
    throw new Error('getActiveConfigVersion() is server-side only (not implemented in HTTP client)')
  }

  async updateConfigVersionStatus(
    _id: string,
    _status: 'active' | 'superseded'
  ): Promise<void> {
    throw new Error('updateConfigVersionStatus() is server-side only (not implemented in HTTP client)')
  }

  // ─────────────────────────────────────────────────────────────────
  // Policy Management (server-side only)
  // ─────────────────────────────────────────────────────────────────

  async listPolicies(
    _orgName: string
  ): Promise<import('@gal/core').ConfigPolicy[]> {
    throw new Error('listPolicies() is server-side only (not implemented in HTTP client)')
  }

  async getPolicy(
    _orgName: string,
    _policyId: string
  ): Promise<import('@gal/core').ConfigPolicy | null> {
    throw new Error('getPolicy() is server-side only (not implemented in HTTP client)')
  }

  async createPolicy(
    _orgName: string,
    _policy: Omit<import('@gal/core').ConfigPolicy, 'id' | 'createdAt' | 'updatedAt'>
  ): Promise<import('@gal/core').ConfigPolicy> {
    throw new Error('createPolicy() is server-side only (not implemented in HTTP client)')
  }

  async updatePolicy(
    _orgName: string,
    _policyId: string,
    _updates: Partial<Pick<import('@gal/core').ConfigPolicy, 'name' | 'description' | 'config'>>
  ): Promise<void> {
    throw new Error('updatePolicy() is server-side only (not implemented in HTTP client)')
  }

  async deletePolicy(
    _orgName: string,
    _policyId: string
  ): Promise<void> {
    throw new Error('deletePolicy() is server-side only (not implemented in HTTP client)')
  }

  async activatePolicy(
    _orgName: string,
    _policyId: string
  ): Promise<void> {
    throw new Error('activatePolicy() is server-side only (not implemented in HTTP client)')
  }

  // ─────────────────────────────────────────────────────────────────
  // Helper Methods
  // ─────────────────────────────────────────────────────────────────

  private mapToApprovedConfig(data: any): ApprovedConfig {
    return {
      platform: data.platform,
      hash: data.hash,
      version: data.version,
      approvedAt: data.approvedAt,
      approvedBy: data.approvedBy,
      policyName: data.policyName,
      instructions: data.instructions,
      commands: data.commands,
      hooks: data.hooks,
      settings: data.settings,
      subagents: data.subagents,
      skills: data.skills,
      rules: data.rules,
      cursorRules: data.cursorRules,
      copilotInstructions: data.copilotInstructions,
      copilotPathInstructions: data.copilotPathInstructions,
      copilotAgents: data.copilotAgents,
      copilotSkills: data.copilotSkills,
      mcp: data.mcp,
      enforcement: data.enforcement,
      environment: data.environment,
      enforcementSettings: data.enforcementSettings,
      windsurfRules: data.windsurfRules,
      commandCount: data.commandCount,
      subagentCount: data.subagentCount,
      skillCount: data.skillCount,
      ruleCount: data.ruleCount,
    }
  }
}
