/**
 * Secrets Management Types (Issue #4242)
 *
 * Types for user-scoped and org-scoped environment secrets.
 * Secrets are stored in Firestore and used during agent dispatch
 * to inject environment variables into background agent sessions.
 *
 * Firestore paths:
 *   User-scoped: organizations/{orgId}/secrets/{docId}  (composite: userId + key)
 *   Org-scoped:  organizations/{orgId}/org-secrets/{key}
 */

// =============================================================================
// Core Types
// =============================================================================

/**
 * Scope of a secret — determines visibility and override priority.
 * - 'user': visible only to the creating user; overrides org secrets with same key
 * - 'org': visible to all members of the organization
 */
export type SecretScope = 'user' | 'org';

/**
 * Secret metadata — returned by list endpoints.
 * NEVER includes the secret value.
 */
export interface Secret {
  /** The secret key name (e.g., "ANTHROPIC_API_KEY") */
  key: string;
  /** Whether this is a user-scoped or org-scoped secret */
  scope: SecretScope;
  /** Optional human-readable description */
  description?: string;
  /** Whether the value should be masked in logs/UI (default: true) */
  redacted?: boolean;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 last-update timestamp */
  updatedAt: string;
  /** User ID of the creator */
  createdBy: string;
  /** Optional ISO 8601 expiry timestamp */
  expiresAt?: string;
}

/**
 * Secret with its plaintext value — only returned by the resolve endpoint.
 */
export interface SecretWithValue extends Secret {
  /** The plaintext secret value */
  value: string;
}

// =============================================================================
// Firestore Document Types
// =============================================================================

/**
 * Firestore document shape for a stored secret.
 * Includes the value field that is never exposed via list endpoints.
 */
export interface SecretDocument {
  /** The secret key name */
  key: string;
  /** The plaintext secret value (Phase 1 — KMS encryption is Phase 2) */
  value: string;
  /** Secret scope */
  scope: SecretScope;
  /** Optional human-readable description */
  description?: string;
  /** Whether the value should be masked in logs/UI */
  redacted?: boolean;
  /** Firestore Timestamp or ISO string — creation time */
  createdAt: any;
  /** Firestore Timestamp or ISO string — last update time */
  updatedAt: any;
  /** User ID of the creator */
  createdBy: string;
  /** User ID — only present on user-scoped secrets */
  userId?: string;
  /** Optional Firestore Timestamp or ISO string — expiry time */
  expiresAt?: any;
}

// =============================================================================
// API Request Types
// =============================================================================

/**
 * Request body for PUT /api/secrets/:key (upsert a secret).
 */
export interface UpsertSecretRequest {
  /** The secret value */
  value: string;
  /** Secret scope: 'user' or 'org' */
  scope: SecretScope;
  /** Optional human-readable description */
  description?: string;
  /** Whether the value should be masked in logs/UI (default: true) */
  redacted?: boolean;
  /** Optional ISO 8601 expiry timestamp */
  expiresAt?: string;
}

// =============================================================================
// API Response Types
// =============================================================================

/**
 * Response for GET /api/secrets — list secret metadata.
 */
export interface ListSecretsResponse {
  /** Array of secret metadata (values are NEVER included) */
  secrets: Secret[];
}

/**
 * Response for PUT /api/secrets/:key — upsert confirmation.
 */
export interface UpsertSecretResponse {
  /** Whether the operation succeeded */
  success: boolean;
  /** The secret key that was upserted */
  key: string;
  /** The scope of the secret */
  scope: SecretScope;
  /** Whether this was a create or update operation */
  operation: 'created' | 'updated';
}

/**
 * Response for DELETE /api/secrets/:key — deletion confirmation.
 */
export interface DeleteSecretResponse {
  /** Whether the operation succeeded */
  success: boolean;
  /** The secret key that was deleted */
  key: string;
}

/**
 * Response for POST /api/secrets/resolve — merged secrets for dispatch.
 * User secrets override org secrets when the same key exists.
 */
export interface ResolveSecretsResponse {
  /** Merged key-value map of resolved secrets */
  secrets: Record<string, string>;
  /** Breakdown of which keys came from which scope */
  scope: {
    /** Keys that came from user-scoped secrets */
    user: string[];
    /** Keys that came from org-scoped secrets */
    org: string[];
  };
}
