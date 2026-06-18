export class AuthError extends Error {}
export class CreditsError extends Error {}
export class MonthlyLimitError extends Error {}
export class UserLimitError extends Error {}
export class ModelError extends Error {}

class LimitError extends Error {
  retryAfter?: number
  constructor(message: string, retryAfter?: number) {
    super(message)
    this.retryAfter = retryAfter
  }
}
export class FreeUsageLimitError extends LimitError {}
export class SubscriptionUsageLimitError extends LimitError {}

export class ContextLimitError extends Error {
  constructor(
    message: string,
    public readonly estimatedTokens: number,
    public readonly maxContextTokens: number,
    public readonly reductionNeeded: number,
  ) {
    super(message)
    this.name = "ContextLimitError"
  }
}
