/**
 * Token Budget Types (Issue #6297)
 *
 * Type definitions for tenant-configurable budget alerts for GAL Code
 * token spend. This module enables org admins to set per-user or org-wide
 * token/USD budgets and receive webhook notifications when exceeded.
 *
 * ## Overview
 *
 * The token budget system allows organizations to:
 * - Set daily/hourly token or USD limits per user or org-wide
 * - Configure webhook alerts (Slack, email, generic HTTPS)
 * - Prevent alert spam via deduplication windows
 *
 * ## Firestore Schema
 *
 * Budgets are stored in a subcollection under each organization:
 * ```
 * organizations/{orgName}/token_budgets/{budgetId}
 * ```
 *
 * Each budget document contains:
 * - user login (or "*" for org-wide)
 * - budget type (tokens or USD)
 * - limit value
 * - time window (1h, 24h, 7d, 30d)
 * - webhook configurations
 * - deduplication settings
 */

// =============================================================================
// Enums & Constants
// =============================================================================

/**
 * Budget type: whether the limit is measured in token count or USD.
 *
 * - `tokens`: Raw token count (prompt + completion)
 * - `usd`: Estimated cost in US dollars based on rate card
 */
export type BudgetType = 'tokens' | 'usd';

/**
 * Time window for budget calculation.
 *
 * - `1h`: Last hour (rolling)
 * - `24h`: Last 24 hours (rolling)
 * - `7d`: Last 7 days (rolling)
 * - `30d`: Last 30 days (rolling)
 */
export type BudgetWindow = '1h' | '24h' | '7d' | '30d';

/**
 * Webhook delivery type.
 *
 * - `generic`: POST JSON to any HTTPS URL
 * - `slack`: Slack Incoming Webhook with formatted blocks
 * - `email`: Send via Resend email API
 */
export type WebhookType = 'generic' | 'slack' | 'email';

// =============================================================================
// Webhook Configuration
// =============================================================================

/**
 * Configuration for a single webhook endpoint.
 *
 * Each budget can have multiple webhooks for redundancy or
 * different notification channels.
 */
export interface TokenBudgetWebhook {
  /** Unique identifier for this webhook */
  id: string;

  /** Type of webhook (generic, slack, email) */
  type: WebhookType;

  /**
   * Destination URL or email address.
   * - For `generic`: Any HTTPS URL
   * - For `slack`: Slack Incoming Webhook URL
   * - For `email`: Recipient email address
   */
  url: string;

  /** Whether this webhook is currently active */
  enabled: boolean;

  /** ISO timestamp of last successful delivery */
  lastTriggeredAt?: string;

  /** Error message from last failed delivery attempt */
  lastError?: string;
}

// =============================================================================
// Firestore Document
// =============================================================================

/**
 * Internal budget record stored in Firestore.
 *
 * Path: organizations/{orgName}/token_budgets/{budgetId}
 *
 * This is the database representation; API responses use
 * TokenBudgetResponse which has ISO string dates instead of Date objects.
 */
export interface TokenBudgetRecord {
  /** Unique identifier for this budget */
  budgetId: string;

  /** Organization this budget belongs to */
  organization: string;

  /**
   * GitHub login of the user this budget applies to.
   * Use "*" (wildcard) for org-wide budget that applies to all users.
   */
  userLogin: string;

  /** Whether the limit is in tokens or USD */
  type: BudgetType;

  /** The budget limit value (positive number) */
  limit: number;

  /** Time window for calculating usage */
  window: BudgetWindow;

  /** Webhook configurations for alert delivery */
  webhooks: TokenBudgetWebhook[];

  /**
   * Minimum hours between alerts for this budget.
   * Prevents alert spam when usage consistently exceeds the limit.
   */
  dedupeHours: number;

  /** Whether this budget is currently active */
  enabled: boolean;

  /** When this budget was created */
  createdAt: Date;

  /** When this budget was last modified */
  updatedAt: Date;

  /** User ID who created this budget */
  createdBy: string;

  /** When the last alert was sent for this budget */
  lastAlertAt?: Date;
}

// =============================================================================
// API Request Types
// =============================================================================

/**
 * Request body for creating a new budget.
 *
 * All fields except userLogin, type, and limit are optional
 * with sensible defaults.
 */
export interface CreateTokenBudgetRequest {
  /**
   * GitHub login of the user, or "*" for org-wide.
   * Required.
   */
  userLogin: string;

  /**
   * Type of budget: "tokens" or "usd".
   * Required.
   */
  type: BudgetType;

  /**
   * Budget limit (positive number).
   * Required.
   */
  limit: number;

  /**
   * Time window for usage calculation.
   * Default: "24h"
   */
  window?: BudgetWindow;

  /**
   * Initial webhook configurations.
   * Optional; can be added later.
   */
  webhooks?: Omit<TokenBudgetWebhook, 'id' | 'lastTriggeredAt' | 'lastError'>[];

  /**
   * Hours to wait between duplicate alerts.
   * Default: 24
   */
  dedupeHours?: number;

  /**
   * Whether to enable the budget immediately.
   * Default: true
   */
  enabled?: boolean;
}

/**
 * Request body for updating an existing budget.
 *
 * All fields are optional; only provided fields are updated.
 */
export interface UpdateTokenBudgetRequest {
  /** New user login or wildcard */
  userLogin?: string;

  /** New budget type */
  type?: BudgetType;

  /** New limit value */
  limit?: number;

  /** New time window */
  window?: BudgetWindow;

  /**
   * Replace all webhooks.
   * Note: This replaces the entire webhook array, not appends.
   * Existing webhook IDs may be included to preserve delivery history.
   */
  webhooks?: Array<{
    id?: string;
    type: WebhookType;
    url: string;
    enabled?: boolean;
  }>;

  /** New deduplication hours */
  dedupeHours?: number;

  /** Enable or disable the budget */
  enabled?: boolean;
}

/**
 * Request body for adding a webhook to a budget.
 */
export interface AddWebhookRequest {
  /** Webhook type */
  type: WebhookType;

  /** Destination URL or email */
  url: string;

  /** Enable immediately (default: true) */
  enabled?: boolean;
}

// =============================================================================
// API Response Types
// =============================================================================

/**
 * Budget configuration returned by API endpoints.
 *
 * Similar to TokenBudgetRecord but with ISO string dates
 * for JSON serialization.
 */
export interface TokenBudgetResponse {
  budgetId: string;
  organization: string;
  userLogin: string;
  type: BudgetType;
  limit: number;
  window: BudgetWindow;
  webhooks: TokenBudgetWebhook[];
  dedupeHours: number;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  createdBy: string;
  lastAlertAt?: string;
}

/**
 * Response for GET /api/admin/token-budgets
 */
export interface ListTokenBudgetsResponse {
  budgets: TokenBudgetResponse[];
  total: number;
}

// =============================================================================
// Alert Payload
// =============================================================================

/**
 * Payload sent to webhooks when a budget is exceeded.
 *
 * This structure is sent as JSON to generic webhooks and formatted
 * appropriately for Slack and email channels.
 */
export interface TokenBudgetAlertPayload {
  /** Organization where the budget was exceeded */
  organization: string;

  /** User who exceeded the budget, or "*" for org-wide */
  userLogin: string;

  /** ID of the budget that was exceeded */
  budgetId: string;

  /** Type of budget (tokens or usd) */
  budgetType: BudgetType;

  /** Configured limit */
  limit: number;

  /** Actual usage that exceeded the limit */
  currentUsage: number;

  /** Time window for this budget */
  window: BudgetWindow;

  /** ISO timestamp when the alert was generated */
  exceededAt: string;

  /** Percentage over the limit (e.g., 25 = 25% over) */
  percentOver: number;
}

// =============================================================================
// Constants & Defaults
// =============================================================================

/** Valid time window values */
export const BUDGET_WINDOWS: BudgetWindow[] = ['1h', '24h', '7d', '30d'];

/** Valid budget type values */
export const BUDGET_TYPES: BudgetType[] = ['tokens', 'usd'];

/** Valid webhook type values */
export const WEBHOOK_TYPES: WebhookType[] = ['generic', 'slack', 'email'];

/** Default time window for new budgets */
export const DEFAULT_BUDGET_WINDOW: BudgetWindow = '24h';

/** Default hours between duplicate alerts */
export const DEFAULT_DEDUPE_HOURS = 24;
