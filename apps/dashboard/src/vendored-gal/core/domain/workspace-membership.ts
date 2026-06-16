/**
 * WorkspaceMembership domain entity - Rich entity with business logic
 * Represents a user's access to a workspace with role
 */

import type { WorkspaceRole } from '@gal/types';

export class WorkspaceMembership {
  constructor(
    public readonly id: string,
    public readonly workspaceId: string,
    public readonly userId: string,
    public role: WorkspaceRole,
    public readonly source: 'github_org' | 'owner' | 'collaborator',
    public cachedAt: Date,
    public expiresAt: Date
  ) {}

  /**
   * Check if user is admin in this workspace
   */
  isAdmin(): boolean {
    return this.role === 'admin';
  }

  /**
   * Check if user is member (any role)
   */
  isMember(): boolean {
    return this.role === 'admin' || this.role === 'member';
  }

  /**
   * Check if membership cache has expired
   */
  hasExpired(): boolean {
    return new Date() >= this.expiresAt;
  }

  /**
   * Check if membership is from GitHub org sync
   */
  isFromGitHub(): boolean {
    return this.source === 'github_org';
  }

  /**
   * Check if user is the workspace owner
   */
  isOwner(): boolean {
    return this.source === 'owner';
  }

  /**
   * Get remaining cache validity in hours
   */
  getCacheValidityHours(): number {
    const now = Date.now();
    const expiresMs = this.expiresAt.getTime();
    const remainingMs = Math.max(0, expiresMs - now);
    return Math.floor(remainingMs / (1000 * 60 * 60));
  }

  /**
   * Refresh cache expiration
   */
  refreshCache(expirationHours: number = 24): void {
    this.cachedAt = new Date();
    this.expiresAt = new Date(Date.now() + expirationHours * 60 * 60 * 1000);
  }

  /**
   * Update role (for admin actions)
   */
  updateRole(newRole: WorkspaceRole): void {
    this.role = newRole;
    this.refreshCache();
  }
}
