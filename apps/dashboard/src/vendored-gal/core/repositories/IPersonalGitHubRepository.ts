import type { PersonalGitHubConnection } from '@gal/types'

/**
 * Repository interface for personal GitHub OAuth connections
 *
 * Firestore path: users/{userId}/personalGitHub/connection
 *
 * Implementations:
 * - FirestorePersonalGitHubRepository (API)
 * - HttpPersonalGitHubRepository (CLI/Dashboard)
 *
 * @see specs/064-workspace-separation/data-model.md
 */
export interface IPersonalGitHubRepository {
  // ─────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get user's personal GitHub connection
   * @returns Connection details or null if not connected
   */
  getConnection(userId: string): Promise<PersonalGitHubConnection | null>

  /**
   * Check if user has a personal GitHub connection
   */
  hasConnection(userId: string): Promise<boolean>

  // ─────────────────────────────────────────────────────────────────
  // Commands
  // ─────────────────────────────────────────────────────────────────

  /**
   * Save or update user's personal GitHub connection
   */
  saveConnection(
    userId: string,
    connection: PersonalGitHubConnection
  ): Promise<void>

  /**
   * Remove user's personal GitHub connection
   */
  deleteConnection(userId: string): Promise<void>

  /**
   * Update OAuth token (for refresh scenarios)
   */
  updateToken(
    userId: string,
    accessToken: string,
    expiresAt?: Date
  ): Promise<void>
}
