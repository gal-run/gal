import type { Subscription, PlanTier } from '../domain/subscription'

/**
 * Subscription repository interface
 * Implementations: FirestoreSubscriptionRepository (API), HttpSubscriptionRepository (CLI/Dashboard)
 */
export interface ISubscriptionRepository {
  // ─────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────

  /**
   * Find subscription by organization name
   */
  findByOrganization(orgName: string): Promise<Subscription | null>

  /**
   * Find subscription by Stripe customer ID
   */
  findByStripeCustomerId(customerId: string): Promise<Subscription | null>

  /**
   * Find subscription by Stripe subscription ID
   */
  findByStripeSubscriptionId(
    subscriptionId: string
  ): Promise<Subscription | null>

  /**
   * Find all subscriptions for a specific plan tier
   */
  findByPlanTier(tier: PlanTier): Promise<Subscription[]>

  /**
   * Find all active subscriptions
   */
  findActive(): Promise<Subscription[]>

  /**
   * Find all manually granted subscriptions
   * @deprecated manualGrant is replaced by Stripe subscriptions (#3115).
   * Retained for backward compat until migration completes.
   */
  findManuallyGranted(): Promise<Subscription[]>

  // ─────────────────────────────────────────────────────────────────
  // Commands
  // ─────────────────────────────────────────────────────────────────

  /**
   * Create a new subscription
   */
  create(subscription: Subscription): Promise<void>

  /**
   * Update an existing subscription
   */
  update(subscription: Subscription): Promise<void>

  /**
   * Delete a subscription
   */
  delete(orgName: string): Promise<void>

  /**
   * Upgrade subscription to new tier
   */
  upgrade(orgName: string, newTier: PlanTier, newSeatLimit: number): Promise<void>

  /**
   * Downgrade subscription to new tier
   */
  downgrade(orgName: string, newTier: PlanTier, newSeatLimit: number): Promise<void>

  /**
   * Cancel subscription
   */
  cancel(orgName: string): Promise<void>
}
