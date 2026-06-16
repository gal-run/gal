/**
 * HTTP Repository Adapter for Organizations
 *
 * Implements IOrganizationRepository using HTTP calls to the API.
 * Shared across Dashboard, CLI, and VS Code clients.
 */

import {
  Organization,
  TeamMember,
  type IOrganizationRepository,
  type ConfigStats,
  type PlatformStats,
  type HookSettings,
  type ManualGrant,
  type OrganizationStorageUrls,
  type DriftReport,
  type AuditLogEntry,
  type AuditLogQuery,
  type AuditSummary,
} from '@gal/core'
import type { GalRole, AgentPlatform, MultiPlatformScanResult, TeamMemberCache, RoleOverride } from '@gal/types'
import { HttpClient, type HttpClientConfig } from '../HttpClient'

// API Response types
interface OrganizationApiResponse {
  name: string
  installationId: number
  accountType: 'User' | 'Organization'
  totalRepos?: number
  totalConfigs?: number
  totalCommands?: number
  totalHooks?: number
  settings?: {
    storageUrl: string
    versions: number
  }
  commands?: {
    storageUrl: string
    count: number
  }
  hooks?: {
    storageUrl: string
    count: number
  }
  platforms?: Record<AgentPlatform, PlatformStats>
  hookSettings?: HookSettings
  planTier?: 'free' | 'convenience' | 'enforcement' | 'enterprise'
  seatLimit?: number
  stripeCustomerId?: string
  stripeSubscriptionId?: string
  manualGrant?: ManualGrant
  configRepoEnabled?: boolean
  configRepoUrl?: string
  configRepoCreatedAt?: string
  lastConfigSyncAt?: string
  lastScanAt?: string
  audienceTierRef?: any | null
  audienceTierSource?: 'stripe' | 'admin' | null
  entitledFeatures?: string[] | null
  installedByGithubId?: number
  installedByLogin?: string
  createdAt?: string
  updatedAt?: string
}

interface TeamMemberApiResponse {
  userId: string
  githubLogin: string
  githubId: number
  name?: string | null
  email?: string | null
  avatarUrl?: string
  githubOrgRole?: 'admin' | 'member'
  galRole: GalRole
  roleAssignedBy?: string
  roleAssignedAt?: string
  lastActiveAt?: string
  createdAt?: string
  updatedAt?: string
}

export class HttpOrganizationRepository extends HttpClient implements IOrganizationRepository {
  constructor(config: HttpClientConfig) {
    super(config)
  }

  // ─────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────

  async findByName(name: string): Promise<Organization | null> {
    try {
      const response = await this.fetch(`/organizations/${name}`)
      const data = (await response.json()) as { organization: OrganizationApiResponse }

      return this.mapToOrganization(data.organization)
    } catch (error: unknown) {
      const err = error as Error
      if (err.message?.includes('404')) {
        return null
      }
      throw err
    }
  }

  async findAll(): Promise<Organization[]> {
    const response = await this.fetch('/organizations')
    const data = (await response.json()) as { organizations: OrganizationApiResponse[] }

    return data.organizations.map((org) => this.mapToOrganization(org))
  }

  async findByInstallationId(installationId: number): Promise<Organization | null> {
    const all = await this.findAll()
    return all.find((org) => org.installationId === installationId) || null
  }

  async findByUser(_userId: string): Promise<Organization[]> {
    // TODO: Implement user filtering when endpoint is available
    return await this.findAll()
  }

  // Extra helpers (not part of core interface)
  async exists(name: string): Promise<boolean> {
    const org = await this.findByName(name)
    return org !== null
  }

  // ─────────────────────────────────────────────────────────────────
  // Commands
  // ─────────────────────────────────────────────────────────────────

  async create(org: Organization): Promise<void> {
    await this.fetch('/organizations', {
      method: 'POST',
      body: JSON.stringify({
        name: org.name,
        installationId: org.installationId,
        accountType: org.accountType,
        totalRepos: org.totalRepos,
      }),
    })
  }

  async update(org: Organization): Promise<void> {
    await this.fetch(`/organizations/${org.name}`, {
      method: 'PUT',
      body: JSON.stringify({
        totalRepos: org.totalRepos,
        totalConfigs: org.totalConfigs,
        totalCommands: org.totalCommands,
        totalHooks: org.totalHooks,
      }),
    })
  }

  async delete(name: string): Promise<void> {
    await this.fetch(`/organizations/${name}`, {
      method: 'DELETE',
    })
  }

  async updateStats(name: string, stats: ConfigStats): Promise<void> {
    await this.fetch(`/organizations/${name}/stats`, {
      method: 'PUT',
      body: JSON.stringify({
        totalConfigs: stats.totalConfigs,
        totalCommands: stats.totalCommands,
        totalHooks: stats.totalHooks,
      }),
    })
  }

  async upsert(
    _orgName: string,
    _installationId: number,
    _storageUrls: OrganizationStorageUrls,
    _accountType?: 'User' | 'Organization',
    _totalRepos?: number,
    _options?: {
      touchLastScan?: boolean
    }
  ): Promise<void> {
    throw new Error('upsert is a server-side operation not available from HTTP clients')
  }

  async updateMultiPlatformStats(
    _orgName: string,
    _scanResults: MultiPlatformScanResult[],
    _storageUrlBase: string,
    _totalReposScanned?: number
  ): Promise<void> {
    throw new Error('updateMultiPlatformStats is a server-side operation not available from HTTP clients')
  }

  // ─────────────────────────────────────────────────────────────────
  // Team Management
  // ─────────────────────────────────────────────────────────────────

  async getTeamMembers(orgName: string): Promise<TeamMember[]> {
    const response = await this.fetch(`/organizations/${orgName}/team`)
    const data = (await response.json()) as { team: TeamMemberApiResponse[] }

    return data.team.map((member) => new TeamMember(
      member.userId,
      member.githubLogin,
      member.githubId,
      member.name || null,
      member.email || null,
      member.avatarUrl || '',
      (member.githubOrgRole as 'admin' | 'member') || 'member',
      member.galRole,
      member.roleAssignedBy || undefined,
      member.roleAssignedAt ? new Date(member.roleAssignedAt) : undefined,
      member.lastActiveAt ? new Date(member.lastActiveAt) : undefined,
      member.createdAt ? new Date(member.createdAt) : new Date(),
      member.updatedAt ? new Date(member.updatedAt) : new Date()
    ))
  }

  async addTeamMember(orgName: string, member: TeamMember): Promise<void> {
    await this.fetch(`/organizations/${orgName}/team`, {
      method: 'POST',
      body: JSON.stringify({
        userId: member.userId,
        githubLogin: member.githubLogin,
        githubId: member.githubId,
        name: member.name,
        email: member.email,
        avatarUrl: member.avatarUrl,
        galRole: member.galRole,
      }),
    })
  }

  async removeTeamMember(orgName: string, userId: string): Promise<void> {
    await this.fetch(`/organizations/${orgName}/team/${userId}`, {
      method: 'DELETE',
    })
  }

  async updateTeamMemberRole(
    orgName: string,
    userId: string,
    newRole: GalRole
  ): Promise<void> {
    await this.fetch(`/organizations/${orgName}/team/${userId}/role`, {
      method: 'PUT',
      body: JSON.stringify({ galRole: newRole }),
    })
  }

  async getTeamMember(orgName: string, userId: string): Promise<TeamMember | null> {
    const members = await this.getTeamMembers(orgName)
    return members.find((member) => member.userId === userId) || null
  }

  async isMember(orgName: string, userId: string): Promise<boolean> {
    const members = await this.getTeamMembers(orgName)
    return members.some((member) => member.userId === userId)
  }

  // Convenience helpers (not part of core interface)
  async isTeamMember(orgName: string, userId: string): Promise<boolean> {
    return this.isMember(orgName, userId)
  }

  async getTeamMemberRole(
    orgName: string,
    userId: string
  ): Promise<GalRole | null> {
    const member = await this.getTeamMember(orgName, userId)
    return member?.galRole || null
  }

  // ─────────────────────────────────────────────────────────────────
  // Seat Counting
  // ─────────────────────────────────────────────────────────────────

  async getSeatCount(orgName: string): Promise<number> {
    const members = await this.getTeamMembers(orgName)
    return members.length || 1
  }

  // ─────────────────────────────────────────────────────────────────
  // Hook Settings
  // ─────────────────────────────────────────────────────────────────

  async getHookSettings(orgName: string): Promise<HookSettings | null> {
    try {
      const response = await this.fetch(`/organizations/${orgName}/hook-settings`)
      const data = (await response.json()) as { hookSettings: HookSettings }
      return data.hookSettings
    } catch (error: unknown) {
      const err = error as Error
      if (err.message?.includes('404')) {
        return null
      }
      throw err
    }
  }

  async updateHookSettings(
    orgName: string,
    settings: HookSettings,
    updatedBy: string
  ): Promise<void> {
    await this.fetch(`/organizations/${orgName}/hook-settings`, {
      method: 'PUT',
      body: JSON.stringify({
        hookSettings: settings,
        updatedBy,
      }),
    })
  }

  // ─────────────────────────────────────────────────────────────────
  // Partial Updates
  // ─────────────────────────────────────────────────────────────────

  async updateFields(
    orgName: string,
    fields: Record<string, unknown>
  ): Promise<void> {
    await this.fetch(`/organizations/${orgName}/fields`, {
      method: 'PATCH',
      body: JSON.stringify({ fields }),
    })
  }

  // ─────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────

  private mapToOrganization(data: OrganizationApiResponse): Organization {
    return new Organization(
      data.name,
      data.name,
      data.installationId,
      data.accountType,
      data.totalRepos || 0,
      data.totalConfigs || 0,
      data.totalCommands || 0,
      data.totalHooks || 0,
      data.settings || {
        storageUrl: `gs://gal-configs/${data.name}/settings/`,
        versions: 0,
      },
      data.commands || {
        storageUrl: `gs://gal-configs/${data.name}/commands/`,
        count: 0,
      },
      data.hooks || {
        storageUrl: `gs://gal-configs/${data.name}/hooks/`,
        count: 0,
      },
      data.platforms,
      data.hookSettings,
      data.planTier,
      data.seatLimit,
      data.stripeCustomerId,
      data.stripeSubscriptionId,
      data.manualGrant,
      data.configRepoEnabled,
      data.configRepoUrl,
      data.configRepoCreatedAt,
      data.lastConfigSyncAt,
      data.lastScanAt ? new Date(data.lastScanAt) : undefined,
      data.audienceTierRef ?? null, // #4220: reads only audienceTierRef (migration removes old audienceTier string)
      data.audienceTierSource ?? null, // #4089: 'stripe' | 'admin' | null
      data.entitledFeatures ?? null, // #4201: entitled features from Stripe sync
      data.installedByGithubId,
      data.installedByLogin,
      data.createdAt ? new Date(data.createdAt) : new Date(),
      data.updatedAt ? new Date(data.updatedAt) : new Date()
    )
  }

  // Team Cache methods (server-side only, not available via HTTP client)
  async getTeamMemberCache(_orgName: string): Promise<TeamMemberCache | null> {
    throw new Error('getTeamMemberCache is not available via HTTP client')
  }

  async setTeamMemberCache(_orgName: string, _cache: TeamMemberCache): Promise<void> {
    throw new Error('setTeamMemberCache is not available via HTTP client')
  }

  async getRoleOverrides(_orgName: string): Promise<RoleOverride[]> {
    throw new Error('getRoleOverrides is not available via HTTP client')
  }

  async setRoleOverride(_orgName: string, _override: RoleOverride): Promise<void> {
    throw new Error('setRoleOverride is not available via HTTP client')
  }

  async deleteRoleOverride(_orgName: string, _githubId: number): Promise<void> {
    throw new Error('deleteRoleOverride is not available via HTTP client')
  }

  async deleteRoleOverridesForMembers(_orgName: string, _githubIds: number[]): Promise<void> {
    throw new Error('deleteRoleOverridesForMembers is not available via HTTP client')
  }

  async saveDriftReport(_orgName: string, _projectId: string, _report: DriftReport): Promise<void> {
    throw new Error('saveDriftReport is not available via HTTP client')
  }

  async getDriftReport(_orgName: string, _projectId: string): Promise<DriftReport | null> {
    throw new Error('getDriftReport is not available via HTTP client')
  }

  async listDriftReports(_orgName: string): Promise<DriftReport[]> {
    throw new Error('listDriftReports is not available via HTTP client')
  }

  async createAuditLogEntry(_orgName: string, _entry: AuditLogEntry): Promise<void> {
    throw new Error('createAuditLogEntry is not available via HTTP client')
  }

  async queryAuditLogs(_orgName: string, _query: AuditLogQuery): Promise<{ entries: AuditLogEntry[]; total: number }> {
    throw new Error('queryAuditLogs is not available via HTTP client')
  }

  async getAuditLogEntry(_orgName: string, _logId: string): Promise<AuditLogEntry | null> {
    throw new Error('getAuditLogEntry is not available via HTTP client')
  }

  async getAuditSummary(_orgName: string, _query: Pick<AuditLogQuery, 'startDate' | 'endDate'>): Promise<AuditSummary> {
    throw new Error('getAuditSummary is not available via HTTP client')
  }
}
