/**
 * Billing repository interface
 * Handles checkout sessions, billing events, and coupon validation
 * Implementations: FirestoreBillingRepository (API)
 */
export interface IBillingRepository {
  // ─────────────────────────────────────────────────────────────────
  // Checkout Session Management
  // ─────────────────────────────────────────────────────────────────

  /**
   * Store checkout session metadata
   * Used to track checkout sessions before completion
   */
  storeCheckoutSession(
    sessionId: string,
    data: CheckoutSessionData
  ): Promise<void>

  /**
   * Get checkout session by ID
   */
  getCheckoutSession(sessionId: string): Promise<CheckoutSessionData | null>

  /**
   * Delete checkout session (after completion or expiry)
   */
  deleteCheckoutSession(sessionId: string): Promise<void>

  // ─────────────────────────────────────────────────────────────────
  // Billing Event Logging
  // ─────────────────────────────────────────────────────────────────

  /**
   * Log a billing event for audit trail
   */
  logBillingEvent(event: BillingEvent): Promise<void>

  /**
   * Get billing events for an organization
   */
  getBillingEvents(
    organizationId: string,
    options?: {
      eventType?: string
      limit?: number
      startAfter?: Date
    }
  ): Promise<BillingEvent[]>

  // ─────────────────────────────────────────────────────────────────
  // Coupon Management
  // ─────────────────────────────────────────────────────────────────

  /**
   * Store coupon validation result (for caching)
   */
  storeCouponValidation(
    code: string,
    validation: CouponValidation
  ): Promise<void>

  /**
   * Get cached coupon validation
   */
  getCouponValidation(code: string): Promise<CouponValidation | null>
}

/**
 * Supporting types for Billing repository
 */
export interface CheckoutSessionData {
  sessionId: string
  organizationId: string
  organizationName: string
  planTier: 'convenience' | 'enforcement'
  billingInterval: 'monthly' | 'yearly'
  seatCount: number
  email: string
  createdAt: Date
  expiresAt: Date
  status: 'pending' | 'completed' | 'expired'
}

export interface BillingEvent {
  eventId?: string
  organizationId: string
  eventType:
    | 'subscription_created'
    | 'subscription_updated'
    | 'subscription_cancelled'
    | 'subscription_synced'
    | 'payment_succeeded'
    | 'payment_failed'
    | 'seat_count_updated'
    | 'partner_activated'
  data: Record<string, unknown>
  createdAt: Date
}

export interface CouponValidation {
  code: string
  valid: boolean
  percentOff: number | null
  amountOff: number | null
  name: string | null
  duration: 'forever' | 'once' | 'repeating' | null
  error?: string
  validatedAt: Date
  expiresAt?: Date
}
