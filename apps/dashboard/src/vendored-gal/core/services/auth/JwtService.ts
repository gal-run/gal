import jwt from 'jsonwebtoken'
import { AuthError } from '../../errors/AuthError'

/**
 * User session payload stored in JWT
 */
export interface UserSession {
  userId: string
  /** Alias for userId – some code paths use `.id` instead of `.userId` */
  id?: string
  githubId: number
  login: string
  name: string | null
  email: string | null
  avatarUrl: string
  organizations: string[]
  /**
   * Organizations where the user is a GitHub admin (populated at OAuth time).
   *
   * WARNING: This field only reflects the GitHub org role at the time the JWT
   * was issued. It does NOT include Firestore role-overrides (e.g. a developer
   * promoted to admin via the Team page). For permission checks, use the shared
   * RoleResolver (apps/api/src/middleware/role-resolver.ts) instead.
   *
   * @see https://github.com/Scheduler-Systems/gal-run-private/issues/2325
   */
  adminOrganizations: string[]
  /** Runtime flag set by RoleResolver middleware */
  isAdmin?: boolean
  /** Organization context, set by middleware for org-scoped routes */
  orgId?: string
  iat: number
  exp: number
}

/**
 * JWT Service - Framework-agnostic token generation and verification
 * No dependencies on Express, Firebase, or Node.js-specific APIs
 */
export class JwtService {
  constructor(
    private secret: string,
    private expiresIn: string = '7d'
  ) {
    if (!secret) {
      throw new Error('JWT secret is required')
    }
  }

  /**
   * Create a JWT token for a user session
   */
  createToken(payload: Omit<UserSession, 'iat' | 'exp'>): string {
    try {
      // Pass options directly to avoid type inference issues
      return jwt.sign(payload, this.secret, {
        expiresIn: this.expiresIn,
      } as jwt.SignOptions)
    } catch (error) {
      throw AuthError.invalidToken(
        `Failed to create token: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Verify and decode a JWT token
   */
  verifyToken(token: string): UserSession {
    try {
      const decoded = jwt.verify(token, this.secret) as UserSession
      return decoded
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw AuthError.tokenExpired()
      }
      throw AuthError.invalidToken(
        `Token verification failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      )
    }
  }

  /**
   * Decode a token without verifying (useful for debugging)
   * WARNING: Do not use for authentication - always use verifyToken()
   */
  decodeToken(token: string): UserSession | null {
    try {
      const decoded = jwt.decode(token) as UserSession
      return decoded
    } catch {
      return null
    }
  }

  /**
   * Check if a token is expired without throwing an error
   */
  isTokenExpired(token: string): boolean {
    try {
      const decoded = this.decodeToken(token)
      if (!decoded) return true

      const now = Math.floor(Date.now() / 1000)
      return decoded.exp < now
    } catch {
      return true
    }
  }

  /**
   * Get time until token expiration in seconds
   * Returns 0 if token is already expired
   */
  getTokenTTL(token: string): number {
    try {
      const decoded = this.decodeToken(token)
      if (!decoded) return 0

      const now = Math.floor(Date.now() / 1000)
      const ttl = decoded.exp - now
      return ttl > 0 ? ttl : 0
    } catch {
      return 0
    }
  }
}
