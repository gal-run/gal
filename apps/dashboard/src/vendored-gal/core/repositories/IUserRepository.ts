import type { User } from '../domain/user'

/**
 * User repository interface
 * Implementations: FirestoreUserRepository (API), HttpUserRepository (CLI/Dashboard)
 */
export interface IUserRepository {
  // ─────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────

  /**
   * Find user by GitHub ID
   */
  findByGithubId(githubId: number): Promise<User | null>

  /**
   * Find user by GitHub login (username)
   */
  findByLogin(login: string): Promise<User | null>

  /**
   * Find user by email address
   */
  findByEmail(email: string): Promise<User | null>

  /**
   * Find all users in an organization
   */
  findByOrganization(orgName: string): Promise<User[]>

  /**
   * Find all admin users in an organization
   */
  findAdminsByOrganization(orgName: string): Promise<User[]>

  /**
   * Check if a user exists
   */
  exists(githubId: number): Promise<boolean>

  // ─────────────────────────────────────────────────────────────────
  // Commands
  // ─────────────────────────────────────────────────────────────────

  /**
   * Create a new user
   */
  create(user: User): Promise<void>

  /**
   * Update an existing user
   */
  update(user: User): Promise<void>

  /**
   * Delete a user
   */
  delete(githubId: number): Promise<void>

  /**
   * Update user's last activity timestamp
   */
  updateLastActivity(githubId: number): Promise<void>
}
