import { DomainError } from './DomainError'

/**
 * Authentication and authorization errors.
 */
export class AuthError extends DomainError {
  constructor(message: string, code?: string) {
    super(message, code)
    this.name = 'AuthError'
    Object.setPrototypeOf(this, AuthError.prototype)
  }

  static invalidToken(reason?: string): AuthError {
    return new AuthError(
      reason ? `Invalid token: ${reason}` : 'Invalid token',
      'INVALID_TOKEN'
    )
  }

  static tokenExpired(): AuthError {
    return new AuthError('Token has expired', 'TOKEN_EXPIRED')
  }

  static unauthorized(message = 'Unauthorized'): AuthError {
    return new AuthError(message, 'UNAUTHORIZED')
  }

  static forbidden(message = 'Forbidden'): AuthError {
    return new AuthError(message, 'FORBIDDEN')
  }
}
