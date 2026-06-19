/**
 * Billing Types — Per-Seat Billing (#4202)
 *
 * Shared types for the seat management API (GET/POST /api/billing/seats).
 * These types are consumed by both the API and (eventually) the dashboard.
 */

import type { PlanTier } from './feature-flags.js';

// ─────────────────────────────────────────────────────────────────
// Seat Info (GET /api/billing/seats response)
// ─────────────────────────────────────────────────────────────────

/** Current seat information for an organization */
export interface SeatInfo {
  /** Current GitHub org member count (synced via webhooks) */
  memberCount: number;
  /** Maximum seats included in the plan (from PLAN_SEAT_LIMITS) */
  seatLimit: number;
  /** Number of seats on the Stripe subscription (may exceed seatLimit if admin increased) */
  subscriptionQuantity: number;
  /** Current plan tier */
  planTier: PlanTier;
  /** Whether the org has an active Stripe subscription */
  hasActiveSubscription: boolean;
  /** Whether the org is over the seat limit (memberCount > seatLimit) */
  isOverLimit: boolean;
  /** Organization audience tier — null for public (billing-eligible) orgs */
  audienceTier: string | null;
}

// ─────────────────────────────────────────────────────────────────
// Proration Preview (GET /api/billing/seats/preview response)
// ─────────────────────────────────────────────────────────────────

/** Proration preview for a seat count change */
export interface SeatChangePreview {
  /** Current seat count on the subscription */
  currentQuantity: number;
  /** Requested new seat count */
  newQuantity: number;
  /** Proration cost in cents (positive = charge, negative = credit) */
  prorationAmountCents: number;
  /** Proration cost formatted (e.g., "$12.50" or "-$5.00") */
  prorationFormatted: string;
  /** Currency code (e.g., "usd") */
  currency: string;
  /** When the proration would take effect */
  effectiveDate: string;
  /** Next invoice total in cents (after proration) */
  nextInvoiceTotalCents: number;
}

// ─────────────────────────────────────────────────────────────────
// Seat Update Request (POST /api/billing/seats body)
// ─────────────────────────────────────────────────────────────────

/** Request body for updating seat count */
export interface SeatUpdateRequest {
  /** New seat count (must be >= current memberCount) */
  quantity: number;
}

/** Response from seat count update */
export interface SeatUpdateResponse {
  success: boolean;
  /** Updated seat count on the subscription */
  newQuantity: number;
  /** Previous seat count */
  previousQuantity: number;
}
