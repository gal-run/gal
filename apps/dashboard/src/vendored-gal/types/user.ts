/**
 * User entity types
 */

import type { AuthProvider } from './auth.js';

/**
 * User account in GAL system
 */
export interface User {
  /** Unique identifier (Firebase UID) */
  id: string;
  /** Primary email address (verified) */
  email: string;
  /** User's display name */
  displayName: string;
  /** Profile picture URL */
  avatarUrl?: string;
  /** Linked authentication providers */
  providers: AuthProvider[];
  /** Account creation timestamp */
  createdAt: Date;
  /** Last update timestamp */
  updatedAt: Date;
  /** Last sign-in timestamp */
  lastSignInAt: Date;
  /** ToS/Privacy acceptance timestamp */
  termsAcceptedAt?: Date;
  /** Version of terms accepted (e.g. '1.0') */
  termsVersion?: string;
}
