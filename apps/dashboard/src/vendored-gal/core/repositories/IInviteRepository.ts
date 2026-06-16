/**
 * Invite Repository Interface
 *
 * Manages developer invitation codes for organization onboarding.
 * Implementations: FirestoreInviteRepository (API)
 */
export interface IInviteRepository {
  // ─────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────

  /**
   * Find invite by unique code
   */
  findByCode(code: string): Promise<Invite | null>

  /**
   * Find invite by ID
   */
  findById(inviteId: string): Promise<Invite | null>

  /**
   * List all invites for an organization
   */
  findByOrganization(organizationName: string): Promise<Invite[]>

  /**
   * List active (non-expired, not revoked) invites for an organization
   */
  findActiveByOrganization(organizationName: string): Promise<Invite[]>

  // ─────────────────────────────────────────────────────────────────
  // Commands
  // ─────────────────────────────────────────────────────────────────

  /**
   * Create a new invite
   */
  create(invite: Invite): Promise<string>

  /**
   * Update invite usage (increment currentUses, add to usedBy)
   */
  incrementUsage(inviteId: string, usedByEmail: string): Promise<void>

  /**
   * Revoke an invite (set isActive = false)
   */
  revoke(inviteId: string): Promise<void>

  /**
   * Check if a code exists (for uniqueness validation)
   */
  codeExists(code: string): Promise<boolean>
}

/**
 * Invite domain model
 * Represents a developer invitation code
 */
export interface Invite {
  id: string
  code: string
  organizationId: string
  organizationName: string
  createdBy: string // email of CISO who created
  createdAt: Date
  expiresAt: Date
  maxUses: number // -1 for unlimited
  currentUses: number
  isActive: boolean
  usedBy: string[] // emails of developers who used this invite
}
