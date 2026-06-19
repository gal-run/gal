/**
 * TeamSyncService - Live GitHub sync for team members
 *
 * Implements team member caching, role override management, and GitHub API synchronization.
 *
 * @see specs/1741-team-page-live-github-sync/tasks.md (T005)
 * @see openspec/changes/1741-team-page-live-github-sync/proposal.md
 */

import type { IOrganizationRepository } from '../../repositories/IOrganizationRepository'
import type { CachedMember, TeamMemberCache, RoleOverride, TeamMembersResponse, GalRole } from '@gal/types'

interface EffectiveMember extends CachedMember {
  userId: string
  galRole: GalRole
  roleAssignedBy?: string
  roleAssignedAt?: Date
  approvalStatus: 'approved' | 'pending'
}

export class TeamSyncService {
  constructor(private orgRepository: IOrganizationRepository) {}

  /**
   * FR-003: Derive default GAL role from GitHub org role
   *
   * GitHub API returns only two org-level roles:
   *   - "admin"  → shown as "Owner" in GitHub UI (can delete org, manage billing)
   *   - "member" → shown as "Member" in GitHub UI
   *
   * We identify admins reliably by fetching GET /orgs/{org}/members?role=admin
   * and cross-referencing IDs with the full member list (the members endpoint
   * does NOT return role in its response body).
   *
   * Mapping:
   *   GitHub admin (Owner)  → GAL "owner"     (highest privilege)
   *   GitHub member          → GAL "developer" (default)
   *
   * GAL "admin" is assigned via role override OR via team membership in
   * 'admin-team' or 'security-team'.
   *
   * @see https://docs.github.com/en/rest/orgs/members
   * @see https://docs.github.com/en/rest/teams/members
   */
  deriveDefaultRole(githubOrgRole: 'admin' | 'member', teamMemberships?: string[]): string {
    if (githubOrgRole === 'admin') return 'owner'
    if (teamMemberships?.includes('admin-team') || teamMemberships?.includes('security-team')) return 'admin'
    return 'developer'
  }

  /**
   * FR-004: Merge cached members with role overrides
   */
  mergeWithOverrides(cached: CachedMember[], overrides: RoleOverride[]): EffectiveMember[] {
    const overrideMap = new Map(overrides.map(o => [o.githubId, o]))

    return cached.map(member => {
      const override = overrideMap.get(member.githubId)
      const isPending = member.approvalStatus === 'pending'

      if (override) {
        // Use override role and metadata
        return {
          ...member,
          userId: `github-${member.githubId}`,
          galRole: override.galRole,
          roleAssignedBy: override.assignedBy,
          roleAssignedAt: override.assignedAt,
          approvalStatus: 'approved',
        }
      } else {
        // Use default role derived from GitHub org role
        // Omit roleAssignedBy/roleAssignedAt (optional props, no override)
        return {
          ...member,
          userId: `github-${member.githubId}`,
          galRole: this.deriveDefaultRole(member.githubOrgRole, member.teamMemberships) as GalRole,
          approvalStatus: isPending ? 'pending' : 'approved',
        }
      }
    })
  }

  /**
   * FR-007: Fetch members from GitHub and update cache
   * FR-001: Store fetched members in cache
   * FR-008: Clean up overrides for departed members
   * FR-009: Handle 403 permission errors gracefully
   */
  /**
   * Paginate through all pages of a GitHub API endpoint using octokit.request()
   * (getInstallationOctokit doesn't include the REST plugin, so we use request())
   */
  private async paginateRequest(octokit: any, url: string, params: Record<string, any>): Promise<any[]> {
    const allItems: any[] = []
    let page = 1

    while (true) {
      const { data } = await octokit.request(url, { ...params, page, per_page: 100 })
      if (!Array.isArray(data) || data.length === 0) break
      allItems.push(...data)
      if (data.length < 100) break
      page++
    }

    return allItems
  }

  private isCacheFresh(cache: TeamMemberCache | null): boolean {
    if (!cache) return false

    const lastSyncedAt = new Date(cache.lastSyncedAt)
    if (isNaN(lastSyncedAt.getTime())) return false

    const fiveMinutesAgo = Date.now() - 5 * 60 * 1000
    return lastSyncedAt.getTime() > fiveMinutesAgo
  }

  private async cleanupDepartedOverrides(orgName: string, members: CachedMember[]): Promise<void> {
    const overrides = await this.orgRepository.getRoleOverrides(orgName)
    const currentMemberIds = new Set(members.map((m) => m.githubId))
    const departedMemberIds = overrides
      .map((o) => o.githubId)
      .filter((id) => !currentMemberIds.has(id))

    if (departedMemberIds.length > 0) {
      await this.orgRepository.deleteRoleOverridesForMembers(orgName, departedMemberIds)
    }
  }

  private buildTeamResponse(cache: TeamMemberCache, overrides: RoleOverride[]): TeamMembersResponse {
    const effectiveMembers = this.mergeWithOverrides(cache.members, overrides)

    const approvedMembers = effectiveMembers.filter((m) => m.approvalStatus !== 'pending')
    const pendingMembers = effectiveMembers.filter((m) => m.approvalStatus === 'pending')

    const toResponseMember = (m: EffectiveMember) => ({
      userId: m.userId,
      githubLogin: m.githubLogin,
      githubId: m.githubId,
      name: m.name,
      email: m.email,
      avatarUrl: m.avatarUrl,
      githubOrgRole: m.githubOrgRole,
      galRole: m.galRole,
      roleAssignedBy: m.roleAssignedBy ?? null,
      roleAssignedAt: m.roleAssignedAt ?? null,
      approvalStatus: m.approvalStatus,
    })

    const members = approvedMembers.map(toResponseMember)
    const pending = pendingMembers.map(toResponseMember)

    const roleCounts = members.reduce(
      (acc, m) => {
        if (m.galRole === 'owner') acc.owners++
        else if (m.galRole === 'admin') acc.admins++
        else if (m.galRole === 'developer') acc.developers++
        return acc
      },
      { owners: 0, admins: 0, developers: 0 }
    )

    return {
      members,
      pendingMembers: pending,
      totalPending: pending.length,
      totalMembers: members.length,
      lastSyncedAt: cache.lastSyncedAt.toISOString(),
      syncedBy: cache.syncedBy,
      cacheStatus: 'fresh',
      owners: roleCounts.owners,
      admins: roleCounts.admins,
      developers: roleCounts.developers,
    }
  }

  async syncFromGitHub(orgName: string, octokit: any, syncedBy: string): Promise<TeamMemberCache> {
    try {
      // FR-007: Fetch all members with pagination using octokit.request()
      // Note: GET /orgs/{org}/members doesn't return role, so we cross-reference with admin list
      // Also fetch admin-team and security-team membership for GAL role derivation
      const [allMembers, adminMembers, adminTeamMembers, securityTeamMembers] = await Promise.all([
        this.paginateRequest(octokit, 'GET /orgs/{org}/members', { org: orgName }),
        this.paginateRequest(octokit, 'GET /orgs/{org}/members', { org: orgName, role: 'admin' }),
        this.paginateRequest(octokit, 'GET /orgs/{org}/teams/{team_slug}/members', { org: orgName, team_slug: 'admin-team' }).catch(() => []),
        this.paginateRequest(octokit, 'GET /orgs/{org}/teams/{team_slug}/members', { org: orgName, team_slug: 'security-team' }).catch(() => []),
      ])

      const adminIds = new Set(adminMembers.map((m: { id: number }) => m.id))

      // Build team membership map
      const teamMembershipsMap = new Map<number, string[]>()
      for (const m of adminTeamMembers as { id: number }[]) {
        const teams = teamMembershipsMap.get(m.id) || []
        teams.push('admin-team')
        teamMembershipsMap.set(m.id, teams)
      }
      for (const m of securityTeamMembers as { id: number }[]) {
        const teams = teamMembershipsMap.get(m.id) || []
        teams.push('security-team')
        teamMembershipsMap.set(m.id, teams)
      }

      // Map GitHub response to CachedMember format
      const members: CachedMember[] = allMembers.map((m: { id: number; login: string; avatar_url: string; name?: string; email?: string; role_name?: string; type?: string }) => ({
        githubId: m.id,
        githubLogin: m.login,
        name: m.name || null,
        email: m.email || null,
        avatarUrl: m.avatar_url,
        githubOrgRole: (adminIds.has(m.id) ? 'admin' : 'member') as 'admin' | 'member',
        ...(teamMembershipsMap.has(m.id) && { teamMemberships: teamMembershipsMap.get(m.id)! }),
        approvalStatus: 'approved' as const,
      }))

      // FR-001: Store cache
      const cache: TeamMemberCache = {
        members,
        lastSyncedAt: new Date(),
        syncedBy,
        memberCount: members.length,
        orgName,
      }

      await this.orgRepository.setTeamMemberCache(orgName, cache)

      // FR-008: Clean up overrides for departed members
      await this.cleanupDepartedOverrides(orgName, members)

      return cache
    } catch (error: unknown) {
      // FR-009: Handle 403 permission errors
      if ((error as { status?: number }).status === 403) {
        throw new Error('Missing "Members: Read" permission for GitHub App')
      }
      throw error
    }
  }

  /**
   * FR-002: Serve from cache when fresh (<5 min)
   * FR-001: Fetch from GitHub when cache is stale (>5 min) or missing
   * FR-006: Bypass cache when force=true
   * FR-004: Apply role overrides to returned members
   * FR-010: Ensure logged-in user appears in member list
   */
  async getTeamMembers(
    orgName: string,
    octokit: any,
    currentUserId: string,
    force?: boolean
  ): Promise<TeamMembersResponse> {
    let cache = await this.orgRepository.getTeamMemberCache(orgName)

    // FR-006: Bypass cache when force=true
    // FR-002/FR-001: Sync if cache is stale or missing
    if (force === true || !this.isCacheFresh(cache)) {
      cache = await this.syncFromGitHub(orgName, octokit, currentUserId)
    }

    // Cache is guaranteed non-null: either fresh from repository or just synced
    const validCache = cache!

    // FR-004: Apply role overrides
    const overrides = await this.orgRepository.getRoleOverrides(orgName)
    return this.buildTeamResponse(validCache, overrides)
  }

  async syncPersonalAccountCollaborators(
    orgName: string,
    octokit: any,
    syncedBy: string,
    ownerFallback?: {
      githubId?: number
      login?: string
      name?: string | null
      email?: string | null
      avatarUrl?: string | null
    }
  ): Promise<TeamMemberCache> {
    const { data: owner } = await octokit.request('GET /users/{username}', {
      username: orgName,
    })

    const ownerMember: CachedMember = {
      githubId: owner?.id ?? ownerFallback?.githubId ?? 0,
      githubLogin: owner?.login ?? ownerFallback?.login ?? orgName,
      name: owner?.name ?? ownerFallback?.name ?? orgName,
      email: owner?.email ?? ownerFallback?.email ?? null,
      avatarUrl: owner?.avatar_url ?? ownerFallback?.avatarUrl ?? '',
      githubOrgRole: 'admin',
      approvalStatus: 'approved',
    }

    const repos = await this.paginateRequest(octokit, 'GET /users/{username}/repos', {
      username: orgName,
      type: 'owner',
    })

    const privateRepos = repos.filter(
      (repo: { private?: boolean; name?: string; owner?: { login?: string } }) =>
        repo.private === true &&
        typeof repo.name === 'string' &&
        repo.owner?.login?.toLowerCase() === orgName.toLowerCase()
    )

    const collaboratorMap = new Map<number, CachedMember>()

    for (const repo of privateRepos as { name: string }[]) {
      const collaborators = await this.paginateRequest(
        octokit,
        'GET /repos/{owner}/{repo}/collaborators',
        {
          owner: orgName,
          repo: repo.name,
          affiliation: 'direct',
        },
      )

      for (const collaborator of collaborators as Array<{
        id: number
        login: string
        avatar_url?: string
        name?: string
        email?: string
      }>) {
        if (!collaborator?.id || !collaborator?.login) continue
        if (collaborator.login.toLowerCase() === orgName.toLowerCase()) continue
        if (ownerMember.githubId > 0 && collaborator.id === ownerMember.githubId) continue

        collaboratorMap.set(collaborator.id, {
          githubId: collaborator.id,
          githubLogin: collaborator.login,
          name: collaborator.name || null,
          email: collaborator.email || null,
          avatarUrl: collaborator.avatar_url || '',
          githubOrgRole: 'member',
          approvalStatus: 'pending',
        })
      }
    }

    const members: CachedMember[] = [ownerMember, ...Array.from(collaboratorMap.values())]

    const cache: TeamMemberCache = {
      members,
      lastSyncedAt: new Date(),
      syncedBy,
      memberCount: members.length,
      orgName,
    }

    await this.orgRepository.setTeamMemberCache(orgName, cache)
    await this.cleanupDepartedOverrides(orgName, members)

    return cache
  }

  async getPersonalAccountTeamMembers(
    orgName: string,
    octokit: any,
    currentUserId: string,
    force?: boolean,
    ownerFallback?: {
      githubId?: number
      login?: string
      name?: string | null
      email?: string | null
      avatarUrl?: string | null
    },
  ): Promise<TeamMembersResponse> {
    let cache = await this.orgRepository.getTeamMemberCache(orgName)

    if (force === true || !this.isCacheFresh(cache)) {
      cache = await this.syncPersonalAccountCollaborators(
        orgName,
        octokit,
        currentUserId,
        ownerFallback,
      )
    }

    const validCache = cache!
    const overrides = await this.orgRepository.getRoleOverrides(orgName)
    return this.buildTeamResponse(validCache, overrides)
  }

  /**
   * FR-005: Store role override
   */
  async setRoleOverride(orgName: string, override: RoleOverride): Promise<void> {
    await this.orgRepository.setRoleOverride(orgName, override)
  }

  /**
   * FR-005: Delete override if role matches default
   */
  async deleteOverrideIfDefault(orgName: string, githubId: number, role: string): Promise<void> {
    const cache = await this.orgRepository.getTeamMemberCache(orgName)
    if (!cache) return

    const member = cache.members.find((m) => String(m.githubId) === String(githubId))
    if (!member) return

    const defaultRole = this.deriveDefaultRole(member.githubOrgRole, member.teamMemberships)

    if (role === defaultRole) {
      await this.orgRepository.deleteRoleOverride(orgName, githubId)
    }
  }
}
