/**
 * Security Standards Compliance Types (#184)
 *
 * Organizations define security standards with rules, then evaluate their
 * Claude Code configurations against those standards.
 */

export type SecurityRuleType =
  | 'required-setting'
  | 'forbidden-tool'
  | 'required-mcp-server'
  | 'minimum-claude-version'
  | 'required-hook';

export type SecurityStandardSeverity = 'low' | 'medium' | 'high' | 'critical';

export interface SecurityRule {
  type: SecurityRuleType;
  target: string; // e.g., setting key, tool name, MCP server name, hook type
  value?: string; // expected value (for required-setting, minimum-claude-version)
  description: string;
}

export interface SecurityStandard {
  id: string;
  name: string;
  description: string;
  rules: SecurityRule[];
  severity: SecurityStandardSeverity;
  orgName: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ComplianceViolation {
  ruleIndex: number;
  rule: SecurityRule;
  message: string;
}

export interface ComplianceResult {
  standardId: string;
  standardName: string;
  passed: boolean;
  violations: ComplianceViolation[];
  evaluatedAt: string;
}

export interface ComplianceEvaluationResponse {
  orgName: string;
  results: ComplianceResult[];
  totalStandards: number;
  passedStandards: number;
  failedStandards: number;
  evaluatedAt: string;
}
