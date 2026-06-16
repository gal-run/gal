/**
 * Agent Security Policy Types (#2514)
 *
 * Security policy enforcement for background agent sessions (CI/CD runners).
 * Defines tool restrictions, file access policies, and network policies
 * that agents must respect during execution.
 *
 * Firestore path: organizations/{org}/agent-security-policies/{id}
 */

export interface AgentSecurityPolicy {
  id: string;
  orgName: string;
  name: string;
  description: string;
  /** Tool restrictions */
  allowedTools: string[];
  blockedTools: string[];
  /** File access restrictions (glob patterns) */
  allowedFilePatterns: string[];
  blockedFilePatterns: string[];
  /** Network restrictions */
  networkRestrictions: NetworkRestriction;
  enabled: boolean;
  priority: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface NetworkRestriction {
  allowedDomains: string[];
  blockedDomains: string[];
}

/**
 * Merged security policy returned by the GET endpoint.
 * Combines all enabled policies for an org into a single effective policy.
 */
export interface MergedAgentSecurityPolicy {
  allowedTools: string[];
  blockedTools: string[];
  allowedFilePatterns: string[];
  blockedFilePatterns: string[];
  networkRestrictions: NetworkRestriction;
  /** IDs of policies that contributed to this merged result */
  sourcePolicyIds: string[];
  mergedAt: string;
}
