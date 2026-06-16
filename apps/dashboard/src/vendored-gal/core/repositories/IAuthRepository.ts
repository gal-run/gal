/**
 * Authentication Repository Interface
 *
 * Handles authentication-specific data operations:
 * - OAuth states and tokens
 * - Session management
 * - Provider connections
 */

export interface OAuthState {
  state: string;
  redirectUri?: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
}

export interface ConnectedProvider {
  type: 'github' | 'google' | 'email';
  identifier: string; // GitHub login, email address, etc.
  connectedAt: string;
  // Provider-specific data
  githubId?: number;
  avatarUrl?: string;
}

/**
 * Auth repository interface
 * Implementations: FirestoreAuthRepository (API), InMemoryAuthRepository (dev/testing)
 */
export interface IAuthRepository {
  // ─────────────────────────────────────────────────────────────────
  // OAuth State Management
  // ─────────────────────────────────────────────────────────────────

  /**
   * Store a pending OAuth state for CSRF protection
   */
  storePendingState(state: OAuthState): Promise<void>;

  /**
   * Retrieve and consume a pending OAuth state
   * Returns null if state is invalid, expired, or already consumed
   */
  consumePendingState(stateId: string): Promise<OAuthState | null>;

  /**
   * Mark a state as consumed (prevent replay attacks)
   */
  markStateConsumed(stateId: string): Promise<void>;

  /**
   * Clean up expired states (older than 10 minutes)
   */
  cleanupExpiredStates(): Promise<void>;

  // ─────────────────────────────────────────────────────────────────
  // Provider Management
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get all connected providers for a user
   */
  getUserProviders(userId: string): Promise<ConnectedProvider[]>;

  /**
   * Add a provider to a user's account
   */
  addProvider(userId: string, provider: ConnectedProvider): Promise<void>;

  /**
   * Remove a provider from a user's account
   */
  removeProvider(userId: string, providerType: string): Promise<void>;

  /**
   * Check if a GitHub account is already linked to any user
   * Returns the userId if linked, null otherwise
   */
  findUserByGithubId(githubId: number): Promise<string | null>;

  /**
   * Check if an email is already linked to any user
   * Returns the userId if linked, null otherwise
   */
  findUserByEmail(email: string): Promise<string | null>;

  // ─────────────────────────────────────────────────────────────────
  // Session Management
  // ─────────────────────────────────────────────────────────────────

  /**
   * Store user session data (for stateful session stores)
   * Note: In current implementation, sessions are stored in JWT tokens (stateless)
   * This method is for future migration to server-side sessions
   */
  storeSession?(sessionId: string, sessionData: Record<string, unknown>): Promise<void>;

  /**
   * Retrieve session data
   */
  getSession?(sessionId: string): Promise<Record<string, unknown> | null>;

  /**
   * Invalidate a session
   */
  invalidateSession?(sessionId: string): Promise<void>;
}
