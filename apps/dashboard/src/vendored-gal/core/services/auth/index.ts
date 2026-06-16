/**
 * Auth Services - Framework-agnostic authentication and authorization
 */

export { JwtService } from './JwtService'
export type { UserSession } from './JwtService'

export { OAuthService } from './OAuthService'
export type { GitHubUser, GitHubOrg, OAuthState } from './OAuthService'

export { RedirectValidator } from './RedirectValidator'
export type { RedirectValidationResult } from './RedirectValidator'

// Note: OAuthProxyService removed in GAL-569 (Unified Auth)
// OAuth proxy functionality is no longer needed with Firebase Auth
