/**
 * Tool Governance Types (#822)
 *
 * Organization-level tool restrictions and audit logging.
 * Used by the evaluate endpoint to determine if a tool call is allowed,
 * denied, or should be audited.
 */

export interface ToolPolicy {
  id: string;
  orgName: string;
  name: string;
  description: string;
  rules: ToolPolicyRule[];
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  enabled: boolean;
}

export interface ToolPolicyRule {
  tool: string; // e.g., "Bash", "Write", "WebFetch", "*"
  action: "allow" | "deny" | "audit"; // allow = permitted, deny = blocked, audit = allowed but logged
  conditions?: {
    pathPattern?: string; // glob pattern for file paths
    commandPattern?: string; // regex for bash commands
  };
}

export interface ToolCallAuditLog {
  id: string;
  sessionId: string;
  orgName: string;
  userId: string;
  tool: string;
  action: "allowed" | "denied" | "audited";
  input: Record<string, unknown>;
  timestamp: string;
  policyId?: string; // which policy triggered the decision
}

export interface ToolPolicyEvaluationRequest {
  tool: string;
  input: Record<string, unknown>;
}

export interface ToolPolicyEvaluationResult {
  allowed: boolean;
  action: "allowed" | "denied" | "audited";
  matchedPolicyId?: string;
  reason?: string;
}
