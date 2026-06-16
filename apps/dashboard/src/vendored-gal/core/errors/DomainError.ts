/**
 * Base class for all domain errors.
 * Domain errors represent business rule violations or invalid state.
 */
export class DomainError extends Error {
  constructor(message: string, public readonly code?: string) {
    super(message)
    this.name = 'DomainError'
    Object.setPrototypeOf(this, DomainError.prototype)
  }
}
