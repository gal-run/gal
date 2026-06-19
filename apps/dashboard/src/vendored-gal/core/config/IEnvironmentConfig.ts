/**
 * Environment types
 */
export type Environment = 'dev' | 'prod'

/**
 * Feature flags for conditional functionality
 */
export interface FeatureFlags {
  billingEnabled: boolean
  scanningEnabled: boolean
  telemetryEnabled: boolean
}

/**
 * Rate limit configuration per environment
 */
export interface RateLimits {
  auth: number // Requests per minute for auth endpoints
  api: number // Requests per minute for general API
  scanning: number // Requests per minute for scan operations
}

/**
 * IEnvironmentConfig - Framework-agnostic environment configuration
 *
 * Zero Bugs Principle #10: Environment Separation
 * - Environments must be clearly separated
 * - Configuration must be explicit, not implicit
 * - Same code works identically across all environments
 * - Type-safe guards prevent accidental data leakage
 *
 * This interface defines the contract for environment configuration that
 * all apps (API, CLI, Dashboard) must implement.
 */
export interface IEnvironmentConfig {
  // ─────────────────────────────────────────────────────────────────
  // Environment Detection
  // ─────────────────────────────────────────────────────────────────
  environment: Environment
  isProduction: boolean
  isDevelopment: boolean

  // ─────────────────────────────────────────────────────────────────
  // URLs
  // ─────────────────────────────────────────────────────────────────
  apiBaseUrl: string
  dashboardUrl: string
  websiteUrl: string

  // ─────────────────────────────────────────────────────────────────
  // Database Configuration
  // ─────────────────────────────────────────────────────────────────
  // Firestore collection prefix (e.g., 'dev_', '')
  // Prevents cross-environment data access
  firestorePrefix: string
  // Whether to use Firestore emulator
  firestoreEmulator: boolean

  // ─────────────────────────────────────────────────────────────────
  // Authentication Configuration
  // ─────────────────────────────────────────────────────────────────
  jwtSecret: string
  jwtExpiresIn: string
  githubClientId: string
  githubClientSecret: string
  githubCallbackUrl: string

  // ─────────────────────────────────────────────────────────────────
  // External Integrations
  // ─────────────────────────────────────────────────────────────────
  stripeApiKey: string | null
  stripeWebhookSecret: string | null
  sentryDsn: string | null

  // ─────────────────────────────────────────────────────────────────
  // Rate Limits (Environment-specific)
  // ─────────────────────────────────────────────────────────────────
  rateLimits: RateLimits

  // ─────────────────────────────────────────────────────────────────
  // Feature Flags
  // ─────────────────────────────────────────────────────────────────
  features: FeatureFlags

  // ─────────────────────────────────────────────────────────────────
  // Methods
  // ─────────────────────────────────────────────────────────────────
  /**
   * Validate that required secrets are present for the current environment
   * Throws error if validation fails
   */
  validate(): void

  /**
   * Get a human-readable description of the current environment
   */
  getDescription(): string
}
