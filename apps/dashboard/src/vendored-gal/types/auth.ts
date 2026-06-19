/**
 * Authentication types for unified multi-provider auth
 */

/**
 * Supported authentication provider types
 */
export type AuthProviderType = 'github' | 'google' | 'email';

/**
 * Authentication provider linked to a user account
 */
export interface AuthProvider {
  /** Provider type */
  type: AuthProviderType;
  /** Provider-specific user ID */
  providerId: string;
  /** Email from this provider */
  email: string;
  /** Display name from this provider */
  displayName?: string;
  /** Avatar URL from this provider */
  avatarUrl?: string;
  /** Encrypted access token (GitHub only) */
  accessToken?: string;
  /** Encrypted refresh token (if applicable) */
  refreshToken?: string;
  /** Timestamp when provider was linked */
  connectedAt: Date;
}
