/**
 * Credential Types for Background Agents (Issue #1136)
 *
 * Types for managing OAuth credentials for multiple AI coding agent providers.
 * Credentials are stored encrypted in Firestore: users/{userId}/credentials/{provider}
 */

// =============================================================================
// Provider Types
// =============================================================================

/**
 * Supported credential providers for background agents.
 * Subset of SessionAgent that support OAuth/token authentication.
 * Matches platforms with credentialSync capability in the registry (Issue #2821).
 */
export type CredentialProvider = 'claude' | 'codex' | 'gemini' | 'cursor' | 'oss' | 'firebase';

/**
 * List of providers that support credential configuration.
 */
export const CREDENTIAL_PROVIDERS: CredentialProvider[] = ['claude', 'codex', 'gemini', 'cursor', 'oss', 'firebase'];

/**
 * Status of a credential configuration.
 */
export type CredentialStatus = 'not_configured' | 'active' | 'expired';

// =============================================================================
// Firestore Document Types
// =============================================================================

/**
 * Stored credential document in Firestore.
 * Tokens are encrypted at rest using AES-256.
 *
 * Path: users/{userId}/credentials/{provider}
 *
 * Post-2026-04 credential schema is API-key-only. Legacy OAuth fields
 * (encryptedRefreshToken, encryptedIdToken, encryptedAccountId, scope,
 * tokenType) in existing Firestore docs are silently ignored during read;
 * new writes never include them.
 */
export interface AgentCredential {
  /** Provider identifier */
  provider: CredentialProvider;
  /** AES-256 encrypted access token (API key or setup-token) */
  encryptedAccessToken: string;
  /** Token prefix for identification (e.g., "sk-ant-api-...") */
  tokenPrefix: string;
  /** When the credential was first saved */
  createdAt: Date;
  /** When the credential was last updated */
  updatedAt: Date;
  /**
   * Optional expiry timestamp in milliseconds. API keys are long-lived by
   * default; set only when the caller knows the key has a finite lifetime.
   */
  expiryDate?: number;
}

// =============================================================================
// API Request/Response Types
// =============================================================================

/**
 * Response for credential status check (GET /api/credentials/:provider).
 */
export interface CredentialStatusResponse {
  /** Whether credentials exist for this provider */
  exists: boolean;
  /** Provider identifier */
  provider: CredentialProvider;
  /** Masked token prefix for display (e.g., "sk-ant-ort01-...") */
  tokenPrefix?: string;
  /** Last update timestamp (ISO 8601) */
  updatedAt?: string;
  /** Current credential status */
  status: CredentialStatus;
}

/**
 * Request to save credentials (POST /api/credentials/:provider).
 *
 * Post-2026-04: API-key-only. Only \`accessToken\` is accepted; a request
 * carrying legacy OAuth fields (\`refreshToken\`, \`idToken\`, \`accountId\`,
 * \`scope\`, \`tokenType\`) is rejected with \`400 INVALID_REQUEST\`.
 */
export interface SaveCredentialRequest {
  /** API key / access token (plain text, will be encrypted server-side) */
  accessToken: string;
}

/**
 * Response after saving credentials.
 */
export interface SaveCredentialResponse {
  /** Whether the save operation succeeded */
  success: boolean;
  /** Token prefix for confirmation */
  tokenPrefix: string;
  /** Provider that was saved */
  provider: CredentialProvider;
}

/**
 * Response for getting all credential statuses (GET /api/credentials).
 */
export interface AllCredentialsResponse {
  /** Array of credential statuses for all providers */
  credentials: CredentialStatusResponse[];
}

// =============================================================================
// Provider Configuration (UI Display)
// =============================================================================

/**
 * Provider-specific credential configuration for UI display.
 */
export interface CredentialProviderConfig {
  /** Provider identifier */
  id: CredentialProvider;
  /** Display name in UI */
  displayName: string;
  /** Icon (emoji) */
  icon: string;
  /** Instructions for obtaining credentials */
  instructions: string;
  /** Example token format hint */
  tokenHint: string;
  /** Whether refresh token is required for this provider */
  refreshTokenRequired: boolean;
  /** Validation regex for access token (optional) */
  accessTokenPattern?: RegExp;
  /** Validation regex for refresh token (optional) */
  refreshTokenPattern?: RegExp;
}

/**
 * Credential provider configurations for all supported providers.
 * Used by the dashboard UI to render provider-specific forms.
 */
export const CREDENTIAL_PROVIDER_CONFIGS: CredentialProviderConfig[] = [
  {
    id: 'claude',
    displayName: 'Claude Code',
    icon: '🤖',
    instructions: 'Get an Anthropic API key from console.anthropic.com, then run `gal auth claude --api-key <key>`',
    tokenHint: 'Anthropic API key starting with sk-ant-api...',
    refreshTokenRequired: false,
    accessTokenPattern: /^sk-ant-/,
  },
  {
    id: 'codex',
    displayName: 'Codex CLI',
    icon: '🌟',
    instructions: 'Get an OpenAI API key from platform.openai.com, then run `gal auth codex --api-key <key>`',
    tokenHint: 'OpenAI API key starting with sk-...',
    refreshTokenRequired: false,
    accessTokenPattern: /^sk-/,
  },
  {
    id: 'gemini',
    displayName: 'Gemini CLI',
    icon: '💎',
    instructions: 'Get a Google AI Studio API key from aistudio.google.com, then run `gal auth gemini --api-key <key>`',
    tokenHint: 'Google AI Studio API key starting with AIzaSy...',
    refreshTokenRequired: false,
    accessTokenPattern: /^AIza/,
  },
  {
    id: 'firebase' as CredentialProvider,
    displayName: 'Firebase CLI',
    icon: '🔥',
    instructions: "Run `gal auth firebase` after authenticating with Firebase CLI (`firebase login`)",
    tokenHint: 'Google OAuth refresh token starting with 1//...',
    refreshTokenRequired: true,
    accessTokenPattern: /^ya29\./,
    refreshTokenPattern: /^1\/\//,
  },
  {
    id: 'cursor',
    displayName: 'Cursor',
    icon: '🎯',
    instructions: 'Run `gal auth cursor` after authenticating with Cursor CLI',
    tokenHint: 'Cursor access token',
    refreshTokenRequired: false,
  },
  {
    id: 'oss',
    displayName: 'GAL Code (GLM-5)',
    icon: '🔓',
    instructions: 'Use the GAL Code gateway token and base URL for your GLM-5 endpoint',
    tokenHint: 'GAL Code session token or API key',
    refreshTokenRequired: false,
  },
];

/**
 * Get the configuration for a specific provider.
 */
export function getCredentialProviderConfig(provider: CredentialProvider): CredentialProviderConfig | undefined {
  return CREDENTIAL_PROVIDER_CONFIGS.find(c => c.id === provider);
}

/**
 * Check if a string is a valid credential provider.
 */
export function isValidCredentialProvider(value: string): value is CredentialProvider {
  return CREDENTIAL_PROVIDERS.includes(value as CredentialProvider);
}

// =============================================================================
// Credential Validation Types (Issue #2574)
// =============================================================================

/**
 * Result of validating a credential against its provider's API.
 * Returned by POST /api/credentials/:provider/validate.
 */
export interface CredentialValidationResult {
  /** Whether the credential is valid and usable */
  valid: boolean;
  /** The provider that was validated */
  provider: CredentialProvider;
  /** How the credential authenticates: OAuth token, API key, or unknown */
  method: 'oauth' | 'api_key' | 'unknown';
  /** ISO 8601 expiry timestamp, if known */
  expiresAt?: string;
  /** Error description when valid is false */
  error?: string;
  /** Actionable suggestion for the user, e.g. "Run 'gal auth claude' to refresh" */
  suggestion?: string;
}

/**
 * Result of checking whether credentials are ready for agent dispatch.
 * Returned by POST /api/credentials/validate-for-dispatch.
 */
export interface DispatchReadinessResult {
  /** Whether credentials are ready for dispatch */
  ready: boolean;
  /** The provider that was checked */
  provider: CredentialProvider;
  /** How the credential authenticates: OAuth token, API key, or unknown */
  method: 'oauth' | 'api_key' | 'unknown';
  /** List of issues preventing dispatch (empty when ready) */
  issues: string[];
  /** Actionable suggestions for each issue */
  suggestions: string[];
}
