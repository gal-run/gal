/**
 * System-Level Enforcement Types (#183)
 *
 * Server-side policy enforcement that works even if client-side hooks fail.
 * Provides a backstop for organization-level governance policies.
 */

export interface SystemPolicy {
  id: string;
  orgName: string;
  name: string;
  scope: 'organization' | 'repository' | 'user';
  enforcementLevel: 'block' | 'warn' | 'audit';
  rules: SystemPolicyRule[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SystemPolicyRule {
  type: 'tool-restriction' | 'file-pattern' | 'command-pattern' | 'network-restriction';
  pattern: string; // glob or regex depending on type
  action: 'block' | 'allow';
  message?: string; // custom message shown when blocked
}

export interface EnforcementDecision {
  allowed: boolean;
  enforcementLevel: 'block' | 'warn' | 'audit';
  matchedPolicies: Array<{
    policyId: string;
    policyName: string;
    ruleIndex: number;
    message?: string;
  }>;
  timestamp: string;
}

export interface EnforcementEvent {
  id: string;
  orgName: string;
  sessionId: string;
  userId: string;
  tool: string;
  input: Record<string, unknown>;
  decision: EnforcementDecision;
  timestamp: string;
}
