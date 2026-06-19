import type { TrackedRepo } from '@gal/types'

/**
 * Tracked Repository repository interface
 * Handles repositories that are governed by GAL
 * Implementations: FirestoreTrackedRepoRepository (API)
 */
export interface ITrackedRepoRepository {
  // ─────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get tracked repo by full name
   */
  getTrackedRepo(repoFullName: string): Promise<TrackedRepo | null>

  /**
   * List tracked repos for an organization
   */
  listTrackedRepos(orgId: string): Promise<TrackedRepo[]>

  // ─────────────────────────────────────────────────────────────────
  // Commands
  // ─────────────────────────────────────────────────────────────────

  /**
   * Track a repository
   */
  trackRepo(repo: Omit<TrackedRepo, 'id'>): Promise<string>

  /**
   * Update tracked repo (e.g., update active version)
   */
  updateTrackedRepo(
    repoFullName: string,
    updates: Partial<TrackedRepo>
  ): Promise<void>

  /**
   * Untrack a repository
   */
  untrackRepo(repoFullName: string): Promise<void>
}
