import type {
  AgentCredential,
  CredentialProvider,
  CredentialStatusResponse,
} from '@gal/types'

/**
 * Credential Repository Interface (Wave 1.5)
 *
 * Repository for managing encrypted OAuth credentials for background agent providers.
 * Implementations: FirestoreCredentialRepository (API)
 *
 * Firestore path: users/{userId}/credentials/{provider}
 */
export interface ICredentialRepository {
  // ─────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get credential for a specific provider.
   * Returns encrypted credential from Firestore.
   */
  getCredential(
    userId: string,
    provider: CredentialProvider
  ): Promise<AgentCredential | null>

  /**
   * Get status of all credential providers for a user.
   * Returns summary information (exists, status, tokenPrefix, updatedAt).
   */
  getAllCredentialStatuses(userId: string): Promise<CredentialStatusResponse[]>

  /**
   * Get status of a specific credential provider.
   * Returns summary without decrypted tokens.
   */
  getCredentialStatus(
    userId: string,
    provider: CredentialProvider
  ): Promise<CredentialStatusResponse>

  /**
   * Check if user has valid (active, non-expired) credentials for a provider.
   * Used by session creation to validate before starting background agents.
   */
  checkUserCredentials(
    userId: string,
    provider: CredentialProvider
  ): Promise<{
    hasCredentials: boolean
    status?: 'active' | 'expired' | 'not_configured'
    error?: string
  }>

  // ─────────────────────────────────────────────────────────────────
  // Commands
  // ─────────────────────────────────────────────────────────────────

  /**
   * Store encrypted credential for a provider.
   * Overwrites existing credential if present.
   */
  storeCredential(
    userId: string,
    credential: AgentCredential
  ): Promise<{ tokenPrefix: string }>

  /**
   * Delete credential for a specific provider.
   */
  deleteCredential(userId: string, provider: CredentialProvider): Promise<void>

  /**
   * Delete all credentials for a user (for user deletion/cleanup).
   */
  deleteAllUserCredentials(userId: string): Promise<void>
}
