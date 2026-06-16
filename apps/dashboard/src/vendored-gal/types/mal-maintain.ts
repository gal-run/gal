/**
 * MAL MAINTAIN API Types (#1316)
 *
 * API-level types for health checks, auto-repair, and sync operations.
 */

export interface MalHealthCheckRequest {
  repoFullName: string;
  branch?: string;
}

export interface MalMaintainReport {
  id: string;
  orgName: string;
  repoFullName: string;
  score: number;
  issues: {
    critical: MalMaintainIssue[];
    warnings: MalMaintainIssue[];
    suggestions: MalMaintainIssue[];
  };
  coverage: {
    rulesForErrorPatterns: number;
    agentsForTaskTypes: number;
    skillsForWorkflows: number;
  };
  staleness: {
    unusedRules: string[];
    outdatedAgents: string[];
    missingPatterns: string[];
  };
  createdAt: string;
}

export interface MalMaintainIssue {
  id: string;
  severity: 'critical' | 'warning' | 'suggestion';
  category: 'stale_reference' | 'unused_rule' | 'missing_pattern' | 'failing_skill' | 'outdated_agent';
  message: string;
  file?: string;
  autoFixable: boolean;
  fix?: string;
}

export interface MalRepairResult {
  repaired: { issue: string; file: string; action: string }[];
  skipped: { issue: string; reason: string }[];
  scoreBefore: number;
  scoreAfter: number;
}

export interface MalSyncResult {
  updated: string[];
  added: string[];
  removed: string[];
  conflicts: string[];
}
