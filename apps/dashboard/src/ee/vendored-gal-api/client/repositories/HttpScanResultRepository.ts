/**
 * HTTP Repository Adapter for Scan Results
 *
 * Implements IScanResultRepository using HTTP calls to the API.
 * Shared across Dashboard and CLI clients.
 */

import {
  ScanResult,
  type IScanResultRepository,
  type AgentSettings,
  type AgentRule,
  type AgentCommand,
  type AgentHook,
  type AgentSubagent,
  type AgentInstructions,
  type AgentCursorRules,
  type AgentAgentsMd,
  type AgentGeminiMd,
  type AgentWindsurfRules,
  type AgentCopilotInstructions,
} from '@gal/core'
import type { AgentPlatform, DiscoveredConfigItem, DiscoveredConfigsCache } from '@gal/types'
import { createHttpFetch, type HttpClientConfig } from '../http-client'

interface ScanResultApiResponse {
  platform: string
  owner?: string
  orgName?: string
  organization?: string
  repo?: string
  repoName?: string
  repository?: string
  scannedAt: string
  settings?: AgentSettings
  rules?: AgentRule[]
  commands?: AgentCommand[]
  hooks?: AgentHook[]
  agents?: AgentSubagent[]
  subagents?: AgentSubagent[]
  instructions?: AgentInstructions
  cursorRules?: AgentCursorRules
  agentsMd?: AgentAgentsMd
  geminiMd?: AgentGeminiMd
  windsurfRules?: AgentWindsurfRules
  copilotInstructions?: AgentCopilotInstructions
}

export interface DiscoveredRepoSummary {
  name: string
  configCount: number
  configTypes: string[]
  lastScanned: string
}

export interface DiscoveredReposResponse {
  organization: string
  repos: DiscoveredRepoSummary[]
  totalRepos: number
  lastScanAt: string
}

export class HttpScanResultRepository implements IScanResultRepository {
  private fetch: ReturnType<typeof createHttpFetch>

  constructor(config: HttpClientConfig) {
    this.fetch = createHttpFetch(config)
  }

  // ─────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────

  async findByOrganization(orgName: string): Promise<ScanResult[]> {
    const response = await this.fetch(`/organizations/${orgName}/scans`)
    const data = (await response.json()) as { scans: ScanResultApiResponse[] }

    return data.scans.map((scan) => this.mapToScanResult(scan))
  }

  async findByRepository(
    orgName: string,
    repoName: string
  ): Promise<ScanResult[]> {
    const response = await this.fetch(
      `/organizations/${orgName}/scans?repo=${encodeURIComponent(repoName)}`
    )
    const data = (await response.json()) as { scans: ScanResultApiResponse[] }

    return data.scans.map((scan) => this.mapToScanResult(scan))
  }

  async findByPlatform(
    orgName: string,
    platform: AgentPlatform
  ): Promise<ScanResult[]> {
    const response = await this.fetch(
      `/organizations/${orgName}/scans?platform=${platform}`
    )
    const data = (await response.json()) as { scans: ScanResultApiResponse[] }

    return data.scans.map((scan) => this.mapToScanResult(scan))
  }

  async findLatestByRepo(
    orgName: string,
    repoName: string,
    platform: AgentPlatform
  ): Promise<ScanResult | null> {
    try {
      const response = await this.fetch(
        `/organizations/${orgName}/scans/latest?repo=${encodeURIComponent(repoName)}&platform=${platform}`
      )
      const data = (await response.json()) as { scan: ScanResultApiResponse }

      return this.mapToScanResult(data.scan)
    } catch (error: unknown) {
      const err = error as Error
      if (err.message?.includes('404')) {
        return null
      }
      throw err
    }
  }

  async hasRecentScan(
    orgName: string,
    repoName: string,
    platform: AgentPlatform
  ): Promise<boolean> {
    const latest = await this.findLatestByRepo(orgName, repoName, platform)
    if (!latest) return false

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000)
    return latest.scannedAt >= cutoff
  }

  // ─────────────────────────────────────────────────────────────────
  // Commands
  // ─────────────────────────────────────────────────────────────────

  async saveScanResult(orgName: string, result: ScanResult): Promise<void> {
    await this.fetch(`/organizations/${orgName}/scans`, {
      method: 'POST',
      body: JSON.stringify({
        platform: result.platform,
        repo: result.repo,
        scannedAt: result.scannedAt.toISOString(),
        settings: result.settings,
        rules: result.rules,
        commands: result.commands,
        hooks: result.hooks,
        agents: result.agents,
      }),
    })
  }

  async saveScanResults(orgName: string, results: ScanResult[]): Promise<void> {
    await this.fetch(`/organizations/${orgName}/scans/batch`, {
      method: 'POST',
      body: JSON.stringify({
        scans: results.map((result) => ({
          platform: result.platform,
          repo: result.repo,
          scannedAt: result.scannedAt.toISOString(),
          settings: result.settings,
          rules: result.rules,
          commands: result.commands,
          hooks: result.hooks,
          agents: result.agents,
        })),
      }),
    })
  }

  async deleteByRepository(orgName: string, repoName: string): Promise<void> {
    await this.fetch(
      `/organizations/${orgName}/scans?repo=${encodeURIComponent(repoName)}`,
      { method: 'DELETE' }
    )
  }

  async deleteByOrganization(orgName: string): Promise<void> {
    await this.fetch(`/organizations/${orgName}/scans`, { method: 'DELETE' })
  }

  // Extra helper (not part of core interface)
  async deleteOlderThan(orgName: string, daysAgo: number): Promise<void> {
    await this.fetch(
      `/organizations/${orgName}/scans/cleanup?daysAgo=${daysAgo}`,
      { method: 'DELETE' }
    )
  }

  // ─────────────────────────────────────────────────────────────────
  // Discovered Configs Cache (Performance Optimization)
  // ─────────────────────────────────────────────────────────────────

  async getDiscoveredConfigsCache(
    orgName: string,
    maxAgeMs?: number
  ): Promise<DiscoveredConfigsCache | null> {
    try {
      const params = new URLSearchParams()
      if (maxAgeMs !== undefined) {
        params.set('maxAgeMs', String(maxAgeMs))
      }
      const queryString = params.toString() ? `?${params.toString()}` : ''

      const response = await this.fetch(
        `/organizations/${orgName}/discovered-configs-cache${queryString}`
      )
      const data = (await response.json()) as { cache: DiscoveredConfigsCache }
      return data.cache
    } catch (error: unknown) {
      const err = error as Error
      if (err.message?.includes('404')) {
        return null
      }
      throw err
    }
  }

  async saveDiscoveredConfigsCache(
    _orgName: string,
    _configs: DiscoveredConfigItem[]
  ): Promise<void> {
    throw new Error('saveDiscoveredConfigsCache is a server-side operation not available from HTTP clients')
  }

  async getDiscoveredConfigsContentBatch(
    _orgName: string,
    _items: { repo: string; path: string }[]
  ): Promise<Map<string, { content: string; hash: string }>> {
    throw new Error('getDiscoveredConfigsContentBatch is a server-side operation not available from HTTP clients')
  }

  async invalidateDiscoveredConfigsCache(orgName: string): Promise<void> {
    await this.fetch(`/organizations/${orgName}/discovered-configs-cache`, {
      method: 'DELETE',
    })
  }

  // Extra helper (not part of core interface)
  async getDiscoveredRepos(orgName: string): Promise<DiscoveredReposResponse> {
    try {
      const response = await this.fetch(
        `/organizations/${encodeURIComponent(orgName)}/discovered-repos`
      )
      return (await response.json()) as DiscoveredReposResponse
    } catch {
      return {
        organization: orgName,
        repos: [],
        totalRepos: 0,
        lastScanAt: '',
      }
    }
  }

  // ─────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────

  private mapToScanResult(data: ScanResultApiResponse): ScanResult {
    const owner = data.orgName ?? data.owner ?? data.organization ?? ''
    const repo = data.repoName ?? data.repo ?? data.repository ?? ''
    const agents = data.subagents ?? data.agents ?? []

    return new ScanResult(
      data.platform as AgentPlatform,
      owner,
      repo,
      new Date(data.scannedAt),
      data.settings || undefined,
      data.rules || [],
      data.commands || [],
      data.hooks || [],
      agents,
      data.instructions,
      data.cursorRules,
      data.agentsMd,
      data.geminiMd,
      data.windsurfRules,
      data.copilotInstructions
    )
  }
}

export type { HttpClientConfig }
