/**
 * WorkspaceService - Manages workspace permissions and role determination
 *
 * Workspaces represent either:
 * - GitHub Organizations: Role determined from org membership (admin/member)
 * - Personal accounts: Owner is always admin
 *
 * Role hierarchy:
 * - admin: Can approve configs, manage settings (GitHub org admins/owners)
 * - member: Read-only access to configs (GitHub org members)
 */

import type { WorkspaceRole, WorkspaceType } from '@gal/types'
import { Workspace } from '../../domain/workspace.js'
import { WorkspaceMembership } from '../../domain/workspace-membership.js'

/**
 * GitHub organization data
 */
export interface GitHubOrg {
  id: number
  login: string
  avatar_url: string
}

/**
 * GitHub membership role
 */
export type GitHubOrgRole = 'admin' | 'member'

/**
 * Result of workspace permission check
 */
export interface WorkspacePermission {
  workspaceId: string
  userId: string
  role: WorkspaceRole
  canApprove: boolean
  canManageSettings: boolean
  isOwner: boolean
}

/**
 * Workspace with user's role
 */
export interface WorkspaceWithRole {
  workspace: Workspace
  role: WorkspaceRole
  membership: WorkspaceMembership
}

/**
 * Cache expiration time in hours
 */
const CACHE_EXPIRATION_HOURS = 24

/**
 * WorkspaceService - Framework-agnostic workspace management
 *
 * This service:
 * 1. Determines user roles from GitHub org membership
 * 2. Creates personal workspaces for users without orgs
 * 3. Caches membership for performance
 *
 * Concrete implementations should provide:
 * - GitHub API access for role determination
 * - Firestore access for caching
 */
export abstract class WorkspaceService {
  /**
   * Get user's workspaces (GitHub orgs + personal)
   */
  abstract getUserWorkspaces(userId: string): Promise<WorkspaceWithRole[]>

  /**
   * Get or create workspace by GitHub org
   */
  abstract getOrCreateOrgWorkspace(org: GitHubOrg, userId: string): Promise<Workspace>

  /**
   * Get or create personal workspace for user
   */
  abstract getOrCreatePersonalWorkspace(
    userId: string,
    username: string,
    avatarUrl?: string
  ): Promise<Workspace>

  /**
   * Get workspace by ID
   */
  abstract getWorkspace(workspaceId: string): Promise<Workspace | null>

  /**
   * Get user's membership in a workspace
   */
  abstract getMembership(
    workspaceId: string,
    userId: string
  ): Promise<WorkspaceMembership | null>

  /**
   * Check if user has permission in workspace
   */
  abstract checkPermission(
    workspaceId: string,
    userId: string
  ): Promise<WorkspacePermission | null>

  /**
   * Refresh user's role from GitHub
   * Called when cached role expires or on explicit refresh
   */
  abstract refreshMembership(
    workspaceId: string,
    userId: string,
    accessToken: string
  ): Promise<WorkspaceMembership>

  // ============================================================================
  // Helper Methods (shared implementation)
  // ============================================================================

  /**
   * Generate workspace ID from GitHub org
   */
  protected generateOrgWorkspaceId(orgId: number): string {
    return `org:${orgId}`
  }

  /**
   * Generate workspace ID for personal account
   */
  protected generatePersonalWorkspaceId(userId: string): string {
    return `personal:${userId}`
  }

  /**
   * Generate membership ID
   */
  protected generateMembershipId(workspaceId: string, userId: string): string {
    return `${workspaceId}:${userId}`
  }

  /**
   * Determine workspace role from GitHub org role
   * GitHub admin/owner = GAL admin
   * GitHub member = GAL member
   */
  protected mapGitHubRoleToWorkspaceRole(githubRole: GitHubOrgRole): WorkspaceRole {
    return githubRole === 'admin' ? 'admin' : 'member'
  }

  /**
   * Create new membership entity
   */
  protected createMembership(
    workspaceId: string,
    userId: string,
    role: WorkspaceRole,
    source: 'github_org' | 'owner' | 'collaborator'
  ): WorkspaceMembership {
    const now = new Date()
    const expiresAt = new Date(now.getTime() + CACHE_EXPIRATION_HOURS * 60 * 60 * 1000)

    return new WorkspaceMembership(
      this.generateMembershipId(workspaceId, userId),
      workspaceId,
      userId,
      role,
      source,
      now,
      expiresAt
    )
  }

  /**
   * Check if membership has expired
   */
  protected isMembershipExpired(membership: WorkspaceMembership): boolean {
    return membership.hasExpired()
  }

  /**
   * Build permission object from membership
   */
  protected buildPermission(
    workspace: Workspace,
    membership: WorkspaceMembership
  ): WorkspacePermission {
    const isAdmin = membership.isAdmin()
    const isOwner = membership.isOwner() || workspace.isOwner(membership.userId)

    return {
      workspaceId: workspace.id,
      userId: membership.userId,
      role: membership.role,
      canApprove: isAdmin || isOwner,
      canManageSettings: isAdmin || isOwner,
      isOwner,
    }
  }

  /**
   * Create workspace entity from GitHub org
   */
  protected createOrgWorkspace(org: GitHubOrg, ownerId: string): Workspace {
    return new Workspace(
      this.generateOrgWorkspaceId(org.id),
      'organization' as WorkspaceType,
      org.login,
      Workspace.generateSlug(org.login),
      ownerId,
      org.avatar_url || undefined,
      new Date()
    )
  }

  /**
   * Create personal workspace entity
   */
  protected createPersonalWorkspaceEntity(
    userId: string,
    username: string,
    avatarUrl?: string
  ): Workspace {
    return new Workspace(
      this.generatePersonalWorkspaceId(userId),
      'personal' as WorkspaceType,
      `${username}'s Workspace`,
      Workspace.generateSlug(username),
      userId,
      avatarUrl,
      new Date()
    )
  }
}
