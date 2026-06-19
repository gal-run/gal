import { DomainError } from './DomainError'

/**
 * Validation errors for business rule violations.
 */
export class ValidationError extends DomainError {
  constructor(
    message: string,
    public readonly field?: string,
    code?: string
  ) {
    super(message, code)
    this.name = 'ValidationError'
    Object.setPrototypeOf(this, ValidationError.prototype)
  }

  static required(field: string): ValidationError {
    return new ValidationError(
      `${field} is required`,
      field,
      'REQUIRED_FIELD'
    )
  }

  static invalid(field: string, reason?: string): ValidationError {
    const message = reason
      ? `${field} is invalid: ${reason}`
      : `${field} is invalid`

    return new ValidationError(message, field, 'INVALID_FIELD')
  }

  static limitExceeded(limit: number, current: number): ValidationError {
    return new ValidationError(
      `Limit exceeded: ${current}/${limit}`,
      undefined,
      'LIMIT_EXCEEDED'
    )
  }
}
