import type { GalRole } from '@gal/types'

// Re-export GalRole for convenience
export type { GalRole }

/**
 * TeamMember domain model - Rich entity with business logic
 */
export class TeamMember {
  constructor(
    public readonly userId: string,
    public readonly githubLogin: string,
    public readonly githubId: number,
    public readonly name: string | null,
    public readonly email: string | null,
    public readonly avatarUrl: string,
    public readonly githubOrgRole: 'admin' | 'member',
    public galRole: GalRole,
    public roleAssignedBy?: string,
    public roleAssignedAt?: Date,
    public lastActiveAt?: Date,
    public readonly createdAt: Date = new Date(),
    public updatedAt: Date = new Date()
  ) {}

  /**
   * Check if member is an owner
   */
  isOwner(): boolean {
    return this.galRole === 'owner'
  }

  /**
   * Check if member is an admin (owner or admin role)
   */
  isAdmin(): boolean {
    return this.galRole === 'owner' || this.galRole === 'admin'
  }

  /**
   * Check if member has security permissions (owner, admin, or security role).
   * Admin automatically inherits security permissions per #4245.
   */
  isSecurity(): boolean {
    return this.galRole === 'owner' || this.galRole === 'admin' || this.galRole === 'security'
  }

  /**
   * Check if member is a developer
   */
  isDeveloper(): boolean {
    return this.galRole === 'developer'
  }

  /**
   * Check if member can manage other team members
   */
  canManageTeam(): boolean {
    return this.isAdmin()
  }

  /**
   * Check if member can approve configs
   */
  canApproveConfigs(): boolean {
    return this.isAdmin()
  }

  /**
   * Change member's role
   */
  changeRole(newRole: GalRole, changedBy: string): void {
    this.galRole = newRole
    this.roleAssignedBy = changedBy
    this.roleAssignedAt = new Date()
    this.updatedAt = new Date()
  }

  /**
   * Record member activity
   */
  recordActivity(): void {
    this.lastActiveAt = new Date()
    this.updatedAt = new Date()
  }

  /**
   * Check if member is active (activity within last 30 days)
   */
  isActive(nowDate: Date = new Date()): boolean {
    if (!this.lastActiveAt) return false
    const age = nowDate.getTime() - this.lastActiveAt.getTime()
    const thirtyDaysInMs = 30 * 24 * 60 * 60 * 1000
    return age < thirtyDaysInMs
  }

  /**
   * Check if member was auto-promoted from GitHub org admin
   */
  wasAutoPromoted(): boolean {
    return this.githubOrgRole === 'admin' && this.isAdmin()
  }

  /**
   * Get role display name
   */
  getRoleDisplayName(): string {
    return this.galRole.charAt(0).toUpperCase() + this.galRole.slice(1)
  }
}
