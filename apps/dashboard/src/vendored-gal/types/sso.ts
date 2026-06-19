/**
 * SSO / SAML 2.0 types
 * Issue #184 — Enterprise security: SSO integration
 */

/** Per-organization SSO configuration stored in Firestore */
export interface SSOConfig {
  /** Organization name this config belongs to */
  orgName: string;
  /** Whether SSO is enabled for this org */
  enabled: boolean;
  /** IdP metadata URL (optional — alternative to manual fields) */
  metadataUrl?: string;
  /** IdP SSO URL — where users are sent to log in */
  idpSsoUrl: string;
  /** IdP public certificate (PEM format) — used to verify SAML responses */
  idpCertificate: string;
  /** IdP issuer / entity ID */
  idpIssuer: string;
  /** Whether to require signed assertions */
  requireSignedAssertions: boolean;
  /** Attribute mapping — which SAML attribute maps to email */
  emailAttribute: string;
  /** Attribute mapping — which SAML attribute maps to display name */
  nameAttribute: string;
  /** Created at ISO timestamp */
  createdAt: string;
  /** Last updated ISO timestamp */
  updatedAt: string;
  /** Who configured this */
  configuredBy: string;
}

/** Payload sent to create/update SSO config */
export interface SSOConfigPayload {
  idpSsoUrl: string;
  idpCertificate: string;
  idpIssuer: string;
  metadataUrl?: string;
  requireSignedAssertions?: boolean;
  emailAttribute?: string;
  nameAttribute?: string;
}

/** SAML assertion data extracted after validation */
export interface SAMLAssertion {
  /** Unique user identifier from IdP (nameID) */
  nameId: string;
  /** User's email from SAML attributes */
  email: string;
  /** User's display name from SAML attributes */
  displayName: string | null;
  /** Raw SAML attributes */
  attributes: Record<string, string | string[]>;
}

/** SSO login URL response */
export interface SSOLoginUrlResponse {
  loginUrl: string;
}

/** GAL's SP (Service Provider) metadata */
export interface SPMetadata {
  entityId: string;
  acsUrl: string;
}
