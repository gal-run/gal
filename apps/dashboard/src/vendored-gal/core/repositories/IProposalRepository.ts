import type { ConfigProposal, ConfigVersion } from '@gal/types'

/**
 * Proposal repository interface
 * Handles config change proposals (developer-proposes/admin-approves workflow)
 * Implementations: FirestoreProposalRepository (API)
 */
export interface IProposalRepository {
  // ─────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get a config proposal by ID
   */
  getConfigProposal(id: string): Promise<ConfigProposal | null>

  /**
   * List config proposals for an organization
   */
  listConfigProposals(
    orgName: string,
    filters?: {
      status?: 'pending' | 'approved' | 'rejected'
      scope?: 'org' | 'project'
    }
  ): Promise<ConfigProposal[]>

  // ─────────────────────────────────────────────────────────────────
  // Commands
  // ─────────────────────────────────────────────────────────────────

  /**
   * Create a config proposal
   */
  createConfigProposal(
    proposal: Omit<ConfigProposal, 'id'>
  ): Promise<string>

  /**
   * Update a config proposal
   */
  updateConfigProposal(
    id: string,
    updates: Partial<ConfigProposal>
  ): Promise<void>

  /**
   * Delete a config proposal
   */
  deleteConfigProposal(id: string): Promise<void>

  /**
   * Atomically approve/reject a proposal and create config version
   * Uses transaction to prevent race conditions on concurrent reviews
   * Returns the version number and updated proposal
   */
  approveProposalAtomically(
    proposalId: string,
    newVersion: Omit<ConfigVersion, 'id'>,
    proposalUpdate: {
      status: 'approved' | 'rejected'
      reviewedBy: string
      reviewedAt: Date
      reviewComment?: string
    }
  ): Promise<{ versionNumber: number; proposal: ConfigProposal }>
}
