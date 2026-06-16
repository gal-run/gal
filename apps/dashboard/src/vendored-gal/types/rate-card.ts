/**
 * Rate Card Types (Issue #6296)
 *
 * Type definitions for versioned rate cards stored in Firestore.
 * Rate cards define the pricing for GAL Code token usage per model.
 *
 * ## Overview
 *
 * Rate cards are stored in Firestore to allow admins to update model
 * pricing via the dashboard without requiring code changes and redeploy.
 *
 * ## Firestore Schema
 *
 * ```
 * rate_cards/{model}  -- Global rate card (not org-scoped)
 * ```
 *
 * Each document contains:
 * - model: Model identifier (e.g., "zai-org/glm-5-maas")
 * - promptUsdPerMtok: Price per million prompt tokens in USD
 * - completionUsdPerMtok: Price per million completion tokens in USD
 * - version: Rate card version string
 * - updatedAt: Last update timestamp
 * - updatedBy: User who last updated
 *
 * ## Cache Behavior
 *
 * The service caches rate cards in memory with a 5-minute TTL.
 * If Firestore is unavailable, it falls back to DEFAULT_RATE_CARD.
 *
 * @see https://github.com/Scheduler-Systems/gal-run-private/issues/6296
 */

// =============================================================================
// Core Types
// =============================================================================

/**
 * Pricing entry for a single model.
 */
export interface RateCardEntry {
  /** Price per million prompt tokens in USD */
  promptUsdPerMtok: number;

  /** Price per million completion tokens in USD */
  completionUsdPerMtok: number;
}

/**
 * Complete rate card with version and all model rates.
 */
export interface RateCard {
  /** Version identifier (e.g., "2026-04-19" or "v1.2.3") */
  version: string;

  /** Per-model pricing rates, keyed by model identifier */
  rates: Record<string, RateCardEntry>;

  /** Fallback pricing when model not in rates */
  fallback: RateCardEntry;
}

/**
 * Single model's rate card document in Firestore.
 *
 * Path: `rate_cards/{model}`
 */
export interface RateCardDocument {
  /** Model identifier (e.g., "zai-org/glm-5-maas") */
  model: string;

  /** Price per million prompt tokens in USD */
  promptUsdPerMtok: number;

  /** Price per million completion tokens in USD */
  completionUsdPerMtok: number;

  /** Version of the rate card this belongs to */
  version: string;

  /** When this rate was last updated */
  updatedAt: Date;

  /** User ID who last updated this rate */
  updatedBy: string;

  /** Audit trail of changes */
  history?: RateCardHistoryEntry[];
}

/**
 * History entry for audit logging.
 */
export interface RateCardHistoryEntry {
  /** Previous prompt price */
  previousPromptUsdPerMtok: number;

  /** Previous completion price */
  previousCompletionUsdPerMtok: number;

  /** New prompt price */
  newPromptUsdPerMtok: number;

  /** New completion price */
  newCompletionUsdPerMtok: number;

  /** When this change was made */
  changedAt: Date;

  /** User who made the change */
  changedBy: string;
}

// =============================================================================
// API Types
// =============================================================================

/**
 * Request body for updating a model's rate.
 */
export interface UpdateRateCardRequest {
  /** Price per million prompt tokens in USD */
  promptUsdPerMtok: number;

  /** Price per million completion tokens in USD */
  completionUsdPerMtok: number;
}

/**
 * Response for a single rate card.
 */
export interface RateCardResponse {
  model: string;
  promptUsdPerMtok: number;
  completionUsdPerMtok: number;
  version: string;
  updatedAt: string;
  updatedBy: string;
}

/**
 * Response for listing all rate cards.
 */
export interface ListRateCardsResponse {
  rateCard: RateCard;
  models: RateCardResponse[];
}

// =============================================================================
// Cache Configuration
// =============================================================================

/** Cache TTL in milliseconds (5 minutes) */
export const RATE_CARD_CACHE_TTL_MS = 5 * 60 * 1000;

/** Firestore collection name for rate cards */
export const RATE_CARDS_COLLECTION = 'rate_cards';
