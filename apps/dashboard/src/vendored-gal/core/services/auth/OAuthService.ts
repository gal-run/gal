import crypto from 'crypto'
import { AuthError } from '../../errors/AuthError'

/**
 * GitHub user data from OAuth
 */
export interface GitHubUser {
  id: number
  login: string
  name: string | null
  email: string | null
  avatar_url: string
}

/**
 * GitHub organization data
 */
export interface GitHubOrg {
  id: number
  login: string
  avatar_url: string
}

/**
 * OAuth tokens from GitHub
 */
export interface OAuthTokens {
  access_token: string
  refresh_token?: string
  expires_in?: number
  token_type: string
}

/**
 * OAuth state for CSRF protection
 */
export interface OAuthState {
  state: string
  redirectUri?: string
  createdAt: number
}

/**
 * OAuth Service - Framework-agnostic GitHub OAuth flow
 * Supports GitHub App OAuth (preferred) with fallback to OAuth App
 * No dependencies on Express, Firebase, or Node.js-specific APIs
 */
export class OAuthService {
  // In-memory state store (use Redis in production)
  private pendingStates: Map<string, OAuthState> = new Map()
  private readonly STATE_TTL_MS = 10 * 60 * 1000 // 10 minutes
  private cleanupInterval: NodeJS.Timeout | null = null

  constructor(
    private clientId: string,
    private clientSecret: string,
    private callbackUrl: string
  ) {
    if (!clientId || !clientSecret) {
      throw new Error('GitHub OAuth credentials (clientId, clientSecret) are required')
    }

    // Start periodic cleanup to prevent memory leaks (every 5 minutes)
    this.cleanupInterval = setInterval(() => {
      this.cleanupExpiredStates()
    }, 5 * 60 * 1000)
  }

  /**
   * Clean up expired OAuth states
   * This prevents memory leaks when states are abandoned during OAuth flow
   */
  private cleanupExpiredStates(): void {
    const expirationTime = Date.now() - this.STATE_TTL_MS
    for (const [key, value] of this.pendingStates.entries()) {
      if (value.createdAt < expirationTime) {
        this.pendingStates.delete(key)
      }
    }
  }

  /**
   * Stop the cleanup interval (call when shutting down)
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval)
      this.cleanupInterval = null
    }
  }

  /**
   * Check if OAuth is properly configured
   */
  isConfigured(): boolean {
    return this.clientId.trim().length > 0 && this.clientSecret.trim().length > 0
  }

  /**
   * Generate a random state for CSRF protection
   */
  generateState(redirectUri?: string): string {
    const state = crypto.randomBytes(32).toString('hex')

    // Build OAuth state object (handle exactOptionalPropertyTypes)
    const oauthState: OAuthState = {
      state,
      createdAt: Date.now(),
    }

    // Only add redirectUri if it's defined (exactOptionalPropertyTypes requirement)
    if (redirectUri !== undefined) {
      oauthState.redirectUri = redirectUri
    }

    this.pendingStates.set(state, oauthState)

    // Clean up old states (older than TTL)
    const expirationTime = Date.now() - this.STATE_TTL_MS
    for (const [key, value] of this.pendingStates.entries()) {
      if (value.createdAt < expirationTime) {
        this.pendingStates.delete(key)
      }
    }

    return state
  }

  /**
   * Validate and consume a state token
   */
  validateState(state: string): OAuthState | null {
    const storedState = this.pendingStates.get(state)
    if (!storedState) {
      return null
    }

    // Check if state is not expired
    if (Date.now() - storedState.createdAt > this.STATE_TTL_MS) {
      this.pendingStates.delete(state)
      return null
    }

    // Consume the state (one-time use)
    this.pendingStates.delete(state)
    return storedState
  }

  /**
   * Get GitHub OAuth authorization URL
   * @param state - CSRF protection state
   * @param forceSelect - If true, forces GitHub to show account picker
   */
  generateAuthUrl(state: string, forceSelect = false): string {
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: this.callbackUrl,
      scope: 'read:user read:org',
      state,
    })

    if (forceSelect) {
      params.set('prompt', 'select_account')
    }

    return `https://github.com/login/oauth/authorize?${params.toString()}`
  }

  /**
   * Exchange authorization code for access tokens
   * Supports both GitHub App and OAuth App token exchange
   */
  async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
    try {
      const response = await fetch(
        'https://github.com/login/oauth/access_token',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            client_id: this.clientId,
            client_secret: this.clientSecret,
            code,
          }),
        }
      )

      if (!response.ok) {
        throw new Error(`GitHub OAuth token exchange failed: ${response.statusText}`)
      }

      const data = (await response.json()) as {
        access_token?: string
        refresh_token?: string
        expires_in?: number
        token_type?: string
        error?: string
        error_description?: string
      }

      if (data.error) {
        throw AuthError.unauthorized(
          `GitHub OAuth error: ${data.error_description || data.error}`
        )
      }

      if (!data.access_token) {
        throw AuthError.unauthorized('No access token received from GitHub')
      }

      // Build return object with exactOptionalPropertyTypes compliance
      const result: OAuthTokens = {
        access_token: data.access_token,
        token_type: data.token_type || 'bearer',
      }

      // Only add optional properties if they're defined
      if (data.refresh_token !== undefined) {
        result.refresh_token = data.refresh_token
      }
      if (data.expires_in !== undefined) {
        result.expires_in = data.expires_in
      }

      return result
    } catch (error) {
      if (error instanceof AuthError) {
        throw error
      }
      throw AuthError.unauthorized(
        `Failed to exchange code: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Refresh expired access token using refresh token
   * Only supported for GitHub Apps (not OAuth Apps)
   */
  async refreshToken(refreshToken: string): Promise<OAuthTokens> {
    try {
      const response = await fetch(
        'https://github.com/login/oauth/access_token',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
          },
          body: JSON.stringify({
            client_id: this.clientId,
            client_secret: this.clientSecret,
            grant_type: 'refresh_token',
            refresh_token: refreshToken,
          }),
        }
      )

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.statusText}`)
      }

      const data = (await response.json()) as {
        access_token?: string
        refresh_token?: string
        expires_in?: number
        token_type?: string
        error?: string
        error_description?: string
      }

      if (data.error) {
        throw AuthError.unauthorized(
          `Token refresh error: ${data.error_description || data.error}`
        )
      }

      if (!data.access_token) {
        throw AuthError.unauthorized('No access token received from refresh')
      }

      // Build return object with exactOptionalPropertyTypes compliance
      const result: OAuthTokens = {
        access_token: data.access_token,
        token_type: data.token_type || 'bearer',
      }

      // Only add optional properties if they're defined
      if (data.refresh_token !== undefined) {
        result.refresh_token = data.refresh_token
      }
      if (data.expires_in !== undefined) {
        result.expires_in = data.expires_in
      }

      return result
    } catch (error) {
      if (error instanceof AuthError) {
        throw error
      }
      throw AuthError.unauthorized(
        `Failed to refresh token: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Get GitHub user information using access token
   */
  async getGitHubUser(accessToken: string): Promise<GitHubUser> {
    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      })

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`)
      }

      return (await response.json()) as GitHubUser
    } catch (error) {
      throw AuthError.unauthorized(
        `Failed to fetch user: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Get user's GitHub organizations
   */
  async getUserOrganizations(accessToken: string): Promise<GitHubOrg[]> {
    try {
      const response = await fetch('https://api.github.com/user/orgs', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      })

      if (!response.ok) {
        throw new Error(`GitHub API error: ${response.statusText}`)
      }

      return (await response.json()) as GitHubOrg[]
    } catch (error) {
      throw AuthError.unauthorized(
        `Failed to fetch organizations: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Get user's role in a specific organization
   */
  async getUserOrgRole(
    accessToken: string,
    org: string
  ): Promise<'admin' | 'member' | null> {
    try {
      // Get user info
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      })

      if (!userResponse.ok) {
        return null
      }

      const user = (await userResponse.json()) as GitHubUser

      // Check organization membership
      const membershipResponse = await fetch(
        `https://api.github.com/orgs/${org}/memberships/${user.login}`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: 'application/vnd.github.v3+json',
          },
        }
      )

      if (!membershipResponse.ok) {
        return null
      }

      const membership = (await membershipResponse.json()) as {
        role: 'admin' | 'member'
      }
      return membership.role
    } catch {
      return null
    }
  }
}
