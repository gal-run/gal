/**
 * Environments Types (Issue #4462)
 *
 * Types for user-scoped named environment configurations.
 * An environment bundles plain env vars, secrets references,
 * and runtime/image preferences for background agent sessions.
 *
 * Firestore path:
 *   users/{userId}/environments/{envId}
 */

// =============================================================================
// Core Types
// =============================================================================

/**
 * A single plain environment variable (non-secret).
 */
export interface EnvVar {
  /** Variable name, e.g. "NODE_ENV" */
  key: string;
  /** Plaintext value */
  value: string;
  /** Optional description */
  description?: string;
}

/**
 * A reference to a named secret (value stored in /api/secrets).
 * The reference links to a secret key; the actual value is resolved at dispatch.
 */
export interface SecretRef {
  /** Secret key name (must match a key in the user's secrets) */
  key: string;
  /** Optional description */
  description?: string;
}

/**
 * Runtime/image configuration for the background agent session.
 */
export interface RuntimeConfig {
  /** Base image identifier, e.g. "ubuntu-22.04", "debian-12", "default" */
  baseImage?: string;
  /** Additional packages/tools to preinstall, e.g. ["awscli", "kubectl"] */
  packages?: string[];
  /** Free-form notes about runtime requirements */
  notes?: string;
}

/**
 * A named environment configuration (user-scoped).
 * Bundles plain vars, secret references, and runtime preferences.
 */
export interface Environment {
  /** Firestore document ID */
  id: string;
  /** Human-readable name, e.g. "GCloud Production" */
  name: string;
  /** Optional description */
  description?: string;
  /** Plain environment variables (non-secret) */
  envVars: EnvVar[];
  /** References to named secrets (resolved at dispatch) */
  secretRefs: SecretRef[];
  /** Runtime/image preferences */
  runtime?: RuntimeConfig;
  /** ISO 8601 creation timestamp */
  createdAt: string;
  /** ISO 8601 last-update timestamp */
  updatedAt: string;
  /** User ID of the owner */
  userId: string;
}

// =============================================================================
// Firestore Document Types
// =============================================================================

/**
 * Firestore document shape for a stored environment.
 */
export interface EnvironmentDocument {
  id: string;
  name: string;
  description?: string;
  envVars: EnvVar[];
  secretRefs: SecretRef[];
  runtime?: RuntimeConfig;
  createdAt: any;
  updatedAt: any;
  userId: string;
}

// =============================================================================
// API Request/Response Types
// =============================================================================

/**
 * Request body for POST /api/environments (create) and PUT /api/environments/:id (update).
 */
export interface UpsertEnvironmentRequest {
  name: string;
  description?: string;
  envVars?: EnvVar[];
  secretRefs?: SecretRef[];
  runtime?: RuntimeConfig;
}

/**
 * Response for GET /api/environments — list environments.
 */
export interface ListEnvironmentsResponse {
  environments: Environment[];
}

/**
 * Response for POST /api/environments or PUT /api/environments/:id.
 */
export interface UpsertEnvironmentResponse {
  success: boolean;
  environment: Environment;
  operation: 'created' | 'updated';
}

/**
 * Response for DELETE /api/environments/:id.
 */
export interface DeleteEnvironmentResponse {
  success: boolean;
  id: string;
}
