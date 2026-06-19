/**
 * Policy Agent Service Types (#6878)
 *
 * Types for the GAL policy agent service that enables
 * organization-level governance enforcement.
 */

export type PolicyStatus =
  | "draft"
  | "pending"
  | "approved"
  | "rejected"
  | "deprecated";

export type PolicyType = "distribution-first" | "security" | "custom";

export type PolicyEnforcementMode = "off" | "warn" | "block";

export type PolicyScope = "org" | "repo";

export type PolicyConditionType =
  | "work_type"
  | "repo_pattern"
  | "label"
  | "issue_title"
  | "custom";

export type PolicyConditionOperator =
  | "equals"
  | "contains"
  | "matches"
  | "in"
  | "not_in";

export type PolicyAction = "allow" | "warn" | "block";

export type PolicyRuleSeverity = "info" | "warning" | "error";

export interface PolicyCondition {
  type: PolicyConditionType;
  operator: PolicyConditionOperator;
  value: string | string[];
}

export interface PolicyRule {
  id: string;
  name: string;
  description?: string;
  condition: PolicyCondition;
  action: PolicyAction;
  message: string;
  severity?: PolicyRuleSeverity;
  evidenceRequired?: string[];
}

export interface PolicyEnforcement {
  enabled: boolean;
  mode: PolicyEnforcementMode;
  scope: PolicyScope;
  repoScope?: string[];
}

export interface PolicyRecord {
  id: string;
  orgName: string;
  name: string;
  description: string;
  type: PolicyType;
  status: PolicyStatus;
  rules: PolicyRule[];
  enforcement: PolicyEnforcement;
  createdAt: Date;
  createdBy: string;
  approvedAt?: Date;
  approvedBy?: string;
  rejectedAt?: Date;
  rejectedBy?: string;
  rejectionReason?: string;
  version: number;
  previousVersionId?: string;
}

export interface PolicyProposalRequest {
  name: string;
  description: string;
  type: PolicyType;
  rules: PolicyRule[];
  enforcement: PolicyEnforcement;
  rationale: string;
}

export interface PolicyCheckContext {
  workType?: string;
  repo?: string;
  issueNumber?: number;
  issueLabels?: string[];
  issueTitle?: string;
  issueBody?: string;
  userLogin?: string;
  branch?: string;
  customContext?: Record<string, unknown>;
}

export interface PolicyCheckRequest {
  context: PolicyCheckContext;
}

export interface PolicyCheckReason {
  ruleId: string;
  ruleName: string;
  message: string;
  severity: PolicyRuleSeverity;
  evidenceRequired?: string[];
}

export interface PolicyCheckResponse {
  allowed: boolean;
  mode: PolicyEnforcementMode;
  policyId: string;
  policyName: string;
  policyVersion: number;
  reasons: PolicyCheckReason[];
  evidenceRequired: string[];
  overridePath?: string;
  timestamp: string;
}

export interface PolicyListResponse {
  policies: PolicyRecord[];
  total: number;
}

export interface PolicyReviewRequest {
  action: "approve" | "reject";
  comment?: string;
}

export interface PolicyEnforcementUpdateRequest {
  enabled?: boolean;
  mode?: PolicyEnforcementMode;
  scope?: PolicyScope;
  repoScope?: string[];
}

export const DEFAULT_POLICY_RULES: PolicyRule[] = [
  {
    id: "check-distribution-status",
    name: "Distribution Status Check",
    description: "Requires distribution/market validation before feature work",
    condition: {
      type: "work_type",
      operator: "in",
      value: [
        "feature",
        "migration",
        "isolation",
        "agentization",
        "platformization",
      ],
    },
    action: "warn",
    message:
      "This work type requires distribution status documentation. Ensure product-market research, early-adopter waitlist, or focused release planning is documented before proceeding.",
    severity: "warning",
    evidenceRequired: ["distribution-status-doc", "market-research-summary"],
  },
  {
    id: "block-without-distribution",
    name: "Block Without Distribution Review",
    description: "Blocks work that has been flagged for distribution review",
    condition: {
      type: "label",
      operator: "equals",
      value: "needs-distribution-review",
    },
    action: "block",
    message:
      "Work blocked pending distribution review. Complete distribution status documentation before proceeding.",
    severity: "error",
  },
];

export function createDefaultDistributionPolicy(
  orgName: string,
): Omit<PolicyRecord, "id" | "createdAt"> {
  return {
    orgName,
    name: "distribution-first-v1",
    description:
      "Enforces product discipline by requiring distribution/market validation before feature expansion work.",
    type: "distribution-first",
    status: "draft",
    rules: DEFAULT_POLICY_RULES,
    enforcement: {
      enabled: true,
      mode: "warn",
      scope: "org",
    },
    createdBy: "system",
    version: 1,
  };
}

export function evaluatePolicyRule(
  rule: PolicyRule,
  context: PolicyCheckContext,
): { matches: boolean; reason?: PolicyCheckReason } {
  const { condition } = rule;
  let matches = false;

  switch (condition.type) {
    case "work_type": {
      const workType = context.workType;
      if (!workType) break;
      matches = evaluateCondition(
        workType,
        condition.operator,
        condition.value,
      );
      break;
    }
    case "repo_pattern": {
      const repo = context.repo;
      if (!repo) break;
      matches = evaluateCondition(repo, condition.operator, condition.value);
      break;
    }
    case "label": {
      const labels = context.issueLabels || [];
      if (labels.length === 0) break;
      if (condition.operator === "equals") {
        matches = labels.includes(String(condition.value));
      } else if (
        condition.operator === "in" &&
        Array.isArray(condition.value)
      ) {
        matches = labels.some((l) => condition.value.includes(l));
      } else if (condition.operator === "contains") {
        matches = labels.some((l) => l.includes(String(condition.value)));
      }
      break;
    }
    case "issue_title": {
      const title = context.issueTitle;
      if (!title) break;
      matches = evaluateCondition(title, condition.operator, condition.value);
      break;
    }
    case "custom": {
      matches = false;
      break;
    }
  }

  if (matches) {
    return {
      matches: true,
      reason: {
        ruleId: rule.id,
        ruleName: rule.name,
        message: rule.message,
        severity: rule.severity || "warning",
        evidenceRequired: rule.evidenceRequired,
      },
    };
  }

  return { matches: false };
}

function evaluateCondition(
  actual: string,
  operator: PolicyConditionOperator,
  expected: string | string[],
): boolean {
  switch (operator) {
    case "equals":
      return actual === expected;
    case "contains":
      return actual.includes(String(expected));
    case "matches":
      try {
        return new RegExp(String(expected)).test(actual);
      } catch {
        return false;
      }
    case "in":
      return Array.isArray(expected) && expected.includes(actual);
    case "not_in":
      return Array.isArray(expected) && !expected.includes(actual);
    default:
      return false;
  }
}

export function checkPolicy(
  policy: PolicyRecord,
  context: PolicyCheckContext,
): PolicyCheckResponse {
  const reasons: PolicyCheckReason[] = [];
  const evidenceRequired: string[] = [];

  if (!policy.enforcement.enabled || policy.enforcement.mode === "off") {
    return {
      allowed: true,
      mode: "off",
      policyId: policy.id,
      policyName: policy.name,
      policyVersion: policy.version,
      reasons: [],
      evidenceRequired: [],
      timestamp: new Date().toISOString(),
    };
  }

  if (policy.enforcement.scope === "repo" && policy.enforcement.repoScope) {
    if (context.repo && !policy.enforcement.repoScope.includes(context.repo)) {
      return {
        allowed: true,
        mode: "off",
        policyId: policy.id,
        policyName: policy.name,
        policyVersion: policy.version,
        reasons: [],
        evidenceRequired: [],
        timestamp: new Date().toISOString(),
      };
    }
  }

  for (const rule of policy.rules) {
    const result = evaluatePolicyRule(rule, context);
    if (result.matches && result.reason) {
      reasons.push(result.reason);
      if (result.reason.evidenceRequired) {
        evidenceRequired.push(...result.reason.evidenceRequired);
      }
    }
  }

  const hasBlock = reasons.some((r) => r.severity === "error");
  const hasWarn = reasons.some((r) => r.severity === "warning");

  let allowed = true;
  let mode = policy.enforcement.mode;

  if (hasBlock) {
    if (mode === "block") {
      allowed = false;
    } else if (mode === "warn") {
      allowed = true;
    }
  } else if (hasWarn) {
    allowed = true;
  }

  return {
    allowed,
    mode,
    policyId: policy.id,
    policyName: policy.name,
    policyVersion: policy.version,
    reasons,
    evidenceRequired: [...new Set(evidenceRequired)],
    overridePath: allowed ? undefined : `/api/policies/${policy.id}/override`,
    timestamp: new Date().toISOString(),
  };
}
