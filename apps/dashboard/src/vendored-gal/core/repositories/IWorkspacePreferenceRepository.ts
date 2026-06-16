import type { WorkspacePreference } from '@gal/types'

/**
 * Repository interface for workspace preferences
 *
 * Firestore path: users/{userId}/workspacePreferences/{orgName}
 *
 * Implementations:
 * - FirestoreWorkspacePreferenceRepository (API)
 * - HttpWorkspacePreferenceRepository (CLI/Dashboard)
 *
 * @see specs/064-workspace-separation/data-model.md
 */
export interface IWorkspacePreferenceRepository {
  // ─────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get user's workspace preference for an organization
   * @returns Preference or null if not set (defaults to "organization")
   */
  getPreference(
    userId: string,
    orgName: string
  ): Promise<WorkspacePreference | null>

  // ─────────────────────────────────────────────────────────────────
  // Commands
  // ─────────────────────────────────────────────────────────────────

  /**
   * Save user's workspace preference for an organization
   */
  savePreference(
    userId: string,
    orgName: string,
    preference: WorkspacePreference
  ): Promise<void>
}
