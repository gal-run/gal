/**
 * Credential Consent Audit Types (Issue #189)
 *
 * Point-of-capture consent records for provider credential storage.
 * Addresses FTC §5 deception-by-omission risk on GAL credential capture.
 *
 * Path in Firestore: users/{userId}/credential_consent/{consentId}
 * Rules: user can read their own records; writes are server-only via Admin SDK.
 */

import type { CredentialProvider } from './credentials.js';

// =============================================================================
// Policy / Privacy version refs
// =============================================================================

/**
 * A reference to the ToS version the user consented against. Produced by the
 * legal pipeline; bumped whenever gal-terms changes materially (§13–§16).
 *
 * Example: "gal-terms-2026-04-17"
 */
export type PolicyVersionRef = string;

/**
 * A reference to the Privacy Policy version the user consented against.
 *
 * Example: "gal-privacy-2026-04-17"
 */
export type PrivacyVersionRef = string;

/**
 * Subset of CredentialProvider that this consent gate applies to.
 * Cursor / oss / firebase are not dispatched by background agents today and
 * are therefore not covered by this point-of-capture consent flow.
 */
export type ConsentProvider = Extract<CredentialProvider, 'claude' | 'codex' | 'gemini'>;

export const CONSENT_PROVIDERS: ConsentProvider[] = ['claude', 'codex', 'gemini'];

// =============================================================================
// Firestore Document
// =============================================================================

/**
 * Stored consent-audit document.
 *
 * Immutable once written. Revocation sets `revokedAt` but does not delete
 * the record (so we preserve an FTC-defensible audit trail).
 */
export interface CredentialConsentRecord {
  /** Document id (generated server-side). */
  consentId: string;
  /** Owning user's id (same as the Firestore parent doc). */
  userId: string;
  /** Provider the consent applies to. */
  provider: ConsentProvider;
  /** When the user ticked the consent box and submitted. */
  consentedAt: Date;
  /** ToS version they were shown at capture time. */
  policyVersionRef: PolicyVersionRef;
  /** Privacy Policy version they were shown at capture time. */
  privacyVersionRef: PrivacyVersionRef;
  /** SHA-256 of the client IP, salted with the deployment salt. Never raw IP. */
  ipAddress: string;
  /** User-Agent header string at capture time (truncated to 512 chars). */
  userAgent: string;
  /** Set when the user revokes (deleteCredential + explicit revoke). Null while active. */
  revokedAt: Date | null;
}

// =============================================================================
// API Request / Response shapes
// =============================================================================

/**
 * POST /api/credentials/consent
 */
export interface CreateCredentialConsentRequest {
  provider: ConsentProvider;
  policyVersionRef: PolicyVersionRef;
  privacyVersionRef: PrivacyVersionRef;
}

export interface CreateCredentialConsentResponse {
  consentId: string;
  provider: ConsentProvider;
  consentedAt: string; // ISO-8601
  policyVersionRef: PolicyVersionRef;
  privacyVersionRef: PrivacyVersionRef;
  /**
   * True when the request was deduplicated against an existing consent
   * within the 24h idempotency window. Record returned is the existing one.
   */
  reused: boolean;
}

/**
 * GET /api/credentials/consent
 */
export interface ListCredentialConsentResponse {
  consents: Array<{
    consentId: string;
    provider: ConsentProvider;
    consentedAt: string; // ISO-8601
    policyVersionRef: PolicyVersionRef;
    privacyVersionRef: PrivacyVersionRef;
    userAgent: string;
    revokedAt: string | null; // ISO-8601 or null
  }>;
}

/**
 * POST /api/credentials/consent/:consentId/revoke
 */
export interface RevokeCredentialConsentResponse {
  consentId: string;
  revokedAt: string; // ISO-8601
}

// =============================================================================
// Staleness
// =============================================================================

/**
 * Default number of days after which a consent record is considered stale and
 * the user must re-consent before storing new credentials. Configurable via
 * the CONSENT_STALENESS_DAYS environment variable on the API.
 */
export const DEFAULT_CONSENT_STALENESS_DAYS = 365; // 12 months

/**
 * Current policy/privacy version refs, kept in types so dashboard + API +
 * tests all agree. Bumped whenever gal-terms or gal-privacy ships a material
 * change to §13–§16 (ToS) or §02/§06/§07 (Privacy).
 */
export const CURRENT_POLICY_VERSION_REF: PolicyVersionRef = 'gal-terms-2026-04-17';
export const CURRENT_PRIVACY_VERSION_REF: PrivacyVersionRef = 'gal-privacy-2026-04-17';
