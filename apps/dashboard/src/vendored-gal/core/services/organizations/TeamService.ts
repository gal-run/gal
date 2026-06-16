import type { IOrganizationRepository } from '../../repositories/IOrganizationRepository'
import { TeamMember, type GalRole } from '../../domain/team-member'
import { ValidationError } from '../../errors/ValidationError'
import { DomainError } from '../../errors/DomainError'

/**
 * TeamService - Business logic for team member management
 *
 * Business rules:
 * - Check seat limits before adding members
 * - Cannot remove the last owner
 * - Role assignment tracking
 */
export class TeamService {
  constructor(private orgRepository: IOrganizationRepository) {}

  /**
   * List team members for an organization
   */
  async listTeamMembers(orgName: string): Promise<TeamMember[]> {
    return this.orgRepository.getTeamMembers(orgName)
  }

  /**
   * Get a specific team member
   */
  async getTeamMember(orgName: string, userId: string): Promise<TeamMember | null> {
    return this.orgRepository.getTeamMember(orgName, userId)
  }

  /**
   * Add a new team member to an organization
   *
   * Business rule: Check seat limit based on organization's plan
   */
  async addTeamMember(
    orgName: string,
    userId: string,
    githubLogin: string,
    githubId: number,
    role: GalRole = 'developer',
    name?: string | null,
    email?: string | null,
    avatarUrl?: string,
    githubOrgRole?: 'admin' | 'member',
    assignedBy?: string
  ): Promise<TeamMember> {
    // Get organization to check seat limits
    const org = await this.orgRepository.findByName(orgName)
    if (!org) {
      throw new DomainError(`Organization ${orgName} not found`)
    }

    // Business rule: Check seat limit
    const currentMembers = await this.orgRepository.getTeamMembers(orgName)
    const seatLimit = org.seatLimit || Number.MAX_SAFE_INTEGER // No limit if not set

    if (currentMembers.length >= seatLimit) {
      throw new ValidationError(
        `Team size limit reached for current plan (${seatLimit} seats)`
      )
    }

    // Create team member with all required fields
    const member = new TeamMember(
      userId,
      githubLogin,
      githubId,
      name || null,
      email || null,
      avatarUrl || '',
      githubOrgRole || 'member',
      role,
      assignedBy,
      undefined, // roleAssignedAt - will be set by repository
      undefined // lastActiveAt
    )

    // Add to organization
    await this.orgRepository.addTeamMember(orgName, member)

    return member
  }

  /**
   * Update a team member's role
   *
   * Business rule: Cannot remove the last owner
   */
  async updateRole(
    orgName: string,
    userId: string,
    newRole: GalRole,
    assignedBy: string
  ): Promise<void> {
    // Get current member
    const member = await this.orgRepository.getTeamMember(orgName, userId)
    if (!member) {
      throw new DomainError(`Team member ${userId} not found in ${orgName}`)
    }

    const currentRole = member.galRole

    // Business rule: Cannot remove the last owner
    if (currentRole === 'owner' && newRole !== 'owner') {
      const members = await this.orgRepository.getTeamMembers(orgName)
      const ownerCount = members.filter((m) => m.galRole === 'owner').length

      if (ownerCount === 1) {
        throw new ValidationError(
          'Cannot remove the last owner. Please assign another owner first.'
        )
      }
    }

    // Update role
    member.changeRole(newRole, assignedBy)
    await this.orgRepository.updateTeamMemberRole(orgName, userId, newRole)
  }

  /**
   * Remove a team member from an organization
   *
   * Business rule: Cannot remove the last owner
   */
  async removeTeamMember(orgName: string, userId: string): Promise<void> {
    // Get current member
    const member = await this.orgRepository.getTeamMember(orgName, userId)
    if (!member) {
      throw new DomainError(`Team member ${userId} not found in ${orgName}`)
    }

    // Business rule: Cannot remove the last owner
    if (member.galRole === 'owner') {
      const members = await this.orgRepository.getTeamMembers(orgName)
      const ownerCount = members.filter((m) => m.galRole === 'owner').length

      if (ownerCount === 1) {
        throw new ValidationError(
          'Cannot remove the last owner. Please assign another owner first.'
        )
      }
    }

    // Remove member
    await this.orgRepository.removeTeamMember(orgName, userId)
  }

  /**
   * Get team summary with role counts
   *
   * Business logic: Calculate role distribution statistics
   */
  async getTeamSummary(orgName: string): Promise<TeamSummary> {
    const members = await this.orgRepository.getTeamMembers(orgName)

    // Calculate role counts
    const owners = members.filter((m) => m.galRole === 'owner')
    const admins = members.filter((m) => m.galRole === 'admin')
    const developers = members.filter((m) => m.galRole === 'developer')

    return {
      organization: orgName,
      totalMembers: members.length,
      ownerCount: owners.length,
      adminCount: admins.length,
      developerCount: developers.length,
      members,
    }
  }

  /**
   * Check if a user is a member of an organization
   */
  async isMember(orgName: string, userId: string): Promise<boolean> {
    const member = await this.orgRepository.getTeamMember(orgName, userId)
    return member !== null
  }

  /**
   * Check if a user has admin or owner role
   */
  async isAdmin(orgName: string, userId: string): Promise<boolean> {
    const member = await this.orgRepository.getTeamMember(orgName, userId)
    if (!member) return false
    return member.isAdmin()
  }

  /**
   * Check if a user has owner role
   */
  async isOwner(orgName: string, userId: string): Promise<boolean> {
    const member = await this.orgRepository.getTeamMember(orgName, userId)
    if (!member) return false
    return member.isOwner()
  }
}

/**
 * Team summary with role distribution
 */
export interface TeamSummary {
  organization: string
  totalMembers: number
  ownerCount: number
  adminCount: number
  developerCount: number
  members: TeamMember[]
}
