// OAuth Proxy Types for Preview Deployment Authentication
// Feature: OAuth authentication for preview deployments (GAL-527)

/**
 * Enhanced OAuth state structure that includes preview deployment context
 * for routing OAuth callbacks to appropriate preview environments
 */
export interface EnhancedOAuthState {
  state: string;           // Original random state for CSRF protection
  redirectUri?: string;    // Enhanced with preview URL context
  createdAt: number;       // State creation timestamp
  previewContext?: PreviewDeploymentContext; // Preview-specific routing info
}

/**
 * Preview deployment context extracted from OAuth state
 * Used for constructing target callback URLs for specific preview environments
 */
export interface PreviewDeploymentContext {
  prNumber?: string;       // PR number (e.g., "123")
  prPrefix?: string;       // PR prefix (e.g., "pr-123")
  environment: 'dev' | 'prod' | 'preview'; // Target environment
  channel?: string;        // Firebase preview channel ID
}

/**
 * OAuth proxy callback request parameters
 * Received from GitHub OAuth and processed by the proxy
 */
export interface OAuthProxyCallbackParams {
  code?: string;           // OAuth authorization code from GitHub
  state: string;           // OAuth state parameter with preview context
  error?: string;          // OAuth error code (when OAuth fails)
  error_description?: string; // Human-readable error description
}

/**
 * OAuth proxy callback response behavior
 * Determines how the proxy should handle the OAuth callback
 */
export interface OAuthProxyCallbackResponse {
  action: 'redirect' | 'error';
  targetUrl?: string;      // URL to redirect to (for redirect action)
  statusCode: number;      // HTTP status code (302 for redirects, 400 for errors)
  errorMessage?: string;   // Error message (for error action)
}

/**
 * URL construction configuration for preview environments
 * Used to build target API callback URLs from preview dashboard URLs
 */
export interface PreviewUrlConfig {
  dashboardPattern: RegExp;    // Pattern to match Firebase preview URLs
  apiUrlTemplate: string;      // Template for constructing API URLs
  fallbackApiUrl: string;      // Fallback API URL when pattern doesn't match
}

/**
 * Firebase preview URL patterns for different environments
 * Matches: https://gal-{env}-dashboard--{channel}.web.app
 */
export interface FirebasePreviewPattern {
  environment: 'dev' | 'prod';
  pattern: RegExp;
  apiBaseUrl: string;      // Base URL for the corresponding API environment
}

/**
 * OAuth proxy routing decision
 * Determines where to route the OAuth callback based on state analysis
 */
export interface OAuthRoutingDecision {
  valid: boolean;          // Whether the state and routing are valid
  targetApiUrl: string;    // Target API callback URL
  previewContext?: PreviewDeploymentContext; // Extracted preview context
  routingReason: string;   // Human-readable reason for routing decision
}

/**
 * OAuth proxy metrics for monitoring and performance tracking
 */
export interface OAuthProxyMetrics {
  requestId: string;       // Unique request identifier
  receivedAt: number;      // Timestamp when request was received
  processedAt?: number;    // Timestamp when processing completed
  latencyMs?: number;      // Processing latency in milliseconds
  routingDecision: OAuthRoutingDecision; // Routing decision made
  success: boolean;        // Whether the proxy operation succeeded
}

/**
 * Rate limiting configuration for OAuth proxy endpoints
 */
export interface OAuthRateLimitConfig {
  windowMs: number;        // Time window in milliseconds
  maxRequests: number;     // Maximum requests per window
  keyGenerator?: (req: any) => string; // Function to generate rate limit keys
  skipSuccessfulRequests?: boolean;    // Whether to skip counting successful requests
}

/**
 * OAuth proxy error types for structured error handling
 */
export type OAuthProxyErrorType =
  | 'invalid_state'        // OAuth state not found or expired
  | 'malformed_params'     // Required parameters missing or malformed
  | 'url_construction_failed' // Failed to construct target callback URL
  | 'rate_limit_exceeded'  // Too many requests from same source
  | 'internal_error';      // Internal server error

/**
 * Structured error response for OAuth proxy failures
 */
export interface OAuthProxyError {
  type: OAuthProxyErrorType;
  message: string;
  details?: any;           // Additional error context
  requestId?: string;      // Request identifier for debugging
  timestamp: number;       // Error occurrence timestamp
}