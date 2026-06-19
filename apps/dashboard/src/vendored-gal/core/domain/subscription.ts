import type { ManualGrant } from './organization'

/**
 * Subscription domain model - Rich entity with business logic
 */
export class Subscription {
  constructor(
    public readonly organizationName: string,
    public planTier: PlanTier,
    public seatLimit: number,
    public stripeCustomerId?: string,
    public stripeSubscriptionId?: string,
    public manualGrant?: ManualGrant,
    public readonly createdAt: Date = new Date(),
    public updatedAt: Date = new Date()
  ) {}

  /**
   * Check if subscription is active.
   * Since #3115, Stripe is the single source of truth for all subscriptions
   * (including admin-granted ones). Legacy manualGrant docs are still checked
   * for backward compat until migration completes.
   */
  isActive(): boolean {
    return !!this.stripeSubscriptionId || this.isManuallyGranted()
  }

  /**
   * Check if organization was manually granted access
   * @deprecated manualGrant is replaced by Stripe subscriptions (#3115).
   * Retained for backward compat with pre-migration Firestore documents.
   */
  isManuallyGranted(): boolean {
    return !!this.manualGrant
  }

  /**
   * Check if subscription is a paid tier
   */
  isPaid(): boolean {
    return this.planTier !== 'free'
  }

  /**
   * Check if seats are available
   */
  hasAvailableSeats(currentTeamSize: number): boolean {
    return currentTeamSize < this.seatLimit
  }

  /**
   * Get seat utilization percentage
   */
  getSeatUtilization(currentTeamSize: number): number {
    if (this.seatLimit === 0) return 0
    return Math.round((currentTeamSize / this.seatLimit) * 100)
  }

  /**
   * Check if seat limit is being approached (>= 80%)
   */
  isSeatLimitApproaching(currentTeamSize: number): boolean {
    return this.getSeatUtilization(currentTeamSize) >= 80
  }

  /**
   * Check if subscription tier supports a feature
   */
  hasFeature(feature: Feature): boolean {
    const tierLevel = TIER_LEVELS[this.planTier]
    const requiredLevel = FEATURE_REQUIREMENTS[feature]
    return tierLevel >= requiredLevel
  }

  /**
   * Upgrade to new tier
   */
  upgrade(newTier: PlanTier, newSeatLimit: number): void {
    if (TIER_LEVELS[newTier] <= TIER_LEVELS[this.planTier]) {
      throw new Error(
        `Cannot upgrade from ${this.planTier} to ${newTier}: not an upgrade`
      )
    }
    this.planTier = newTier
    this.seatLimit = newSeatLimit
    this.updatedAt = new Date()
  }

  /**
   * Downgrade to new tier
   */
  downgrade(newTier: PlanTier, newSeatLimit: number): void {
    if (TIER_LEVELS[newTier] >= TIER_LEVELS[this.planTier]) {
      throw new Error(
        `Cannot downgrade from ${this.planTier} to ${newTier}: not a downgrade`
      )
    }
    this.planTier = newTier
    this.seatLimit = newSeatLimit
    this.updatedAt = new Date()
  }

  /**
   * Cancel subscription
   */
  cancel(): void {
    this.stripeSubscriptionId = undefined
    this.planTier = 'free'
    this.updatedAt = new Date()
  }

  /**
   * Get tier display name
   */
  getTierDisplayName(): string {
    return this.planTier.charAt(0).toUpperCase() + this.planTier.slice(1)
  }
}

/**
 * Supporting types for Subscription
 */
export type PlanTier = 'free' | 'convenience' | 'enforcement' | 'enterprise'

export type Feature =
  | 'auto_discovery'
  | 'approved_config'
  | 'config_sync'
  | 'policy_enforcement'
  | 'compliance_scanning'
  | 'automated_workflows'
  | 'sso'
  | 'audit_logs'
  | 'priority_support'

/**
 * Tier hierarchy for comparison
 */
const TIER_LEVELS: Record<PlanTier, number> = {
  free: 0,
  convenience: 1,
  enforcement: 2,
  enterprise: 3,
}

/**
 * Feature availability by tier
 */
const FEATURE_REQUIREMENTS: Record<Feature, number> = {
  auto_discovery: 1, // Convenience+
  approved_config: 1, // Convenience+
  config_sync: 1, // Convenience+
  policy_enforcement: 2, // Enforcement+
  compliance_scanning: 2, // Enforcement+
  automated_workflows: 3, // Enterprise only
  sso: 3, // Enterprise only
  audit_logs: 3, // Enterprise only
  priority_support: 3, // Enterprise only
}
