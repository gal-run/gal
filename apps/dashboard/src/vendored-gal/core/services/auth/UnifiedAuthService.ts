/**
 * UnifiedAuthService - Orchestrates multi-provider authentication
 * Base class for authentication across GitHub, Google, and Email providers
 */

import type { AuthProvider, AuthProviderType, User } from '@gal/types';
import { AuthError } from '../../errors/AuthError.js';
// Use console directly to avoid @gal/telemetry dependency.
// @gal/telemetry's browser entry does not export createLogger,
// so any import (static or dynamic) breaks the dashboard bundle.
// Auth event logging is defense-in-depth and console is sufficient.
const logger: Pick<Console, 'info' | 'error' | 'warn' | 'debug'> = console;

/**
 * Authentication credentials for different providers
 */
export type AuthCredentials =
  | { type: 'github'; code: string; state: string }
  | { type: 'google'; idToken: string }
  | { type: 'email'; email: string; password: string };

/**
 * Authentication result
 */
export interface AuthResult {
  user: User;
  token: string;
  refreshToken?: string;
}

/**
 * Unified authentication service interface
 * Concrete implementations should be provided in app-specific adapters
 */
export abstract class UnifiedAuthService {
  /**
   * Sign in with a provider
   * @param provider - Provider type
   * @param credentials - Provider-specific credentials
   */
  abstract signIn(
    provider: AuthProviderType,
    credentials: AuthCredentials
  ): Promise<AuthResult>;

  /**
   * Sign out current user
   */
  abstract signOut(): Promise<void>;

  /**
   * Link additional provider to existing account
   * @param userId - User ID to link provider to
   * @param provider - Provider to link
   * @param credentials - Provider credentials
   */
  abstract linkProvider(
    userId: string,
    provider: AuthProviderType,
    credentials: AuthCredentials
  ): Promise<AuthProvider>;

  /**
   * Unlink provider from account
   * @param userId - User ID to unlink from
   * @param provider - Provider type to unlink
   */
  abstract unlinkProvider(
    userId: string,
    provider: AuthProviderType
  ): Promise<void>;

  /**
   * Get current authenticated user
   */
  abstract getCurrentUser(): Promise<User | null>;

  /**
   * Refresh authentication token
   * @param refreshToken - Refresh token
   */
  abstract refreshAuth(refreshToken: string): Promise<AuthResult>;

  /**
   * Verify authentication token
   * @param token - Token to verify
   */
  abstract verifyToken(token: string): Promise<User>;

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Validate credentials format
   */
  protected validateCredentials(credentials: AuthCredentials): void {
    switch (credentials.type) {
      case 'github':
        if (!credentials.code || !credentials.state) {
          throw new AuthError(
            'Invalid GitHub credentials: code and state required',
            'INVALID_CREDENTIALS'
          );
        }
        break;

      case 'google':
        if (!credentials.idToken) {
          throw new AuthError(
            'Invalid Google credentials: idToken required',
            'INVALID_CREDENTIALS'
          );
        }
        break;

      case 'email':
        if (!credentials.email || !credentials.password) {
          throw new AuthError(
            'Invalid email credentials: email and password required',
            'INVALID_CREDENTIALS'
          );
        }
        if (!this.isValidEmail(credentials.email)) {
          throw new AuthError(
            'Invalid email format',
            'INVALID_EMAIL'
          );
        }
        break;

      default:
        throw new AuthError(
          `Unknown provider type: ${(credentials as any).type}`,
          'UNKNOWN_PROVIDER'
        );
    }
  }

  /**
   * Validate email format
   */
  protected isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Check if user has at least one provider after unlinking
   */
  protected ensureMinimumProviders(
    providers: AuthProvider[],
    providerToRemove: AuthProviderType
  ): void {
    const remainingProviders = providers.filter(
      (p) => p.type !== providerToRemove
    );

    if (remainingProviders.length === 0) {
      throw new AuthError(
        'Cannot unlink last provider. User must have at least one authentication method.',
        'MINIMUM_PROVIDERS_REQUIRED'
      );
    }
  }

  /**
   * Log authentication event (override in concrete implementations)
   */
  protected logAuthEvent(
    event: 'sign_in' | 'sign_out' | 'link_provider' | 'unlink_provider',
    userId: string,
    provider?: AuthProviderType,
    error?: Error
  ): void {
    const timestamp = new Date().toISOString();
    const message = error
      ? `[AUTH ERROR] ${event} failed for user ${userId} (provider: ${provider}): ${error.message}`
      : `[AUTH] ${event} successful for user ${userId} (provider: ${provider})`;

    logger.info(`[${timestamp}] ${message}`);
  }
}
