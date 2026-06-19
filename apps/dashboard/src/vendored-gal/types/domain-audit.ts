/**
 * Domain Access Audit Types (#2523)
 *
 * Types for domain allowlist compliance — access audit trail
 * and anomaly detection for agent web requests.
 */

export interface DomainAccessLog {
  id: string;
  sessionId: string;
  orgName: string;
  repoName: string;
  domain: string;
  url: string;
  toolName: "WebFetch" | "WebSearch";
  allowed: boolean;
  timestamp: string; // ISO 8601
  userId?: string;
}

export interface DomainAccessStats {
  domain: string;
  totalRequests: number;
  blockedRequests: number;
  lastAccessed: string;
}

export interface DomainException {
  id: string;
  domain: string;
  orgName: string;
  repoName?: string; // null = org-wide
  approvedBy: string;
  approvedAt: string;
  justification: string;
  expiresAt: string; // 90-day review deadline
}

/**
 * Domain Allowlist Policy (#2522)
 *
 * Org-level allowlist that controls which domains WebFetch/WebSearch
 * and MCP server endpoints can access during agent sessions.
 *
 * Firestore path: organizations/{org}/domain-allowlist
 */
export interface DomainAllowlist {
  /** Schema version for forward compatibility */
  version: number;
  /** Organization name */
  orgName: string;
  /** Allowed domains for WebFetch/WebSearch (exact match or wildcard prefix) */
  allowedDomains: string[];
  /** Allowed MCP server endpoint patterns (URL prefixes or exact URLs) */
  allowedMcpEndpoints: string[];
  /** Who last updated the allowlist */
  updatedBy: string;
  /** ISO 8601 timestamp of last update */
  updatedAt: string;
  /** Whether enforcement is active (false = audit-only mode) */
  enforced: boolean;
}

/**
 * Result of evaluating a domain/URL against the allowlist
 */
export interface DomainAllowlistEvaluation {
  allowed: boolean;
  domain: string;
  matchedPattern?: string;
  reason: string;
}

/**
 * Result of evaluating an MCP server endpoint against the allowlist
 */
export interface McpEndpointEvaluation {
  allowed: boolean;
  serverName: string;
  endpoint: string;
  matchedPattern?: string;
  reason: string;
}
