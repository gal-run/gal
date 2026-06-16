/**
 * Autopilot CI/CD Monitoring Types (#201)
 *
 * Types for autonomous CI/CD monitoring that watches GitHub Actions workflows,
 * detects failures, and provides remediation recommendations.
 *
 * Firestore paths:
 * - organizations/{org}/autopilot-config (single doc)
 * - organizations/{org}/cicd-incidents/{id}
 */

export interface AutopilotConfig {
  orgName: string;
  enabled: boolean;
  monitoredRepos: string[];
  checkIntervalMinutes: number;
  notifyOn: AutopilotNotifyEvent[];
  createdAt: string;
  updatedAt: string;
}

export type AutopilotNotifyEvent = 'failure' | 'timeout' | 'flaky' | 'recovery';

export interface CICDIncident {
  id: string;
  orgName: string;
  repo: string;
  workflowName: string;
  runId: number;
  type: CICDIncidentType;
  severity: CICDIncidentSeverity;
  detectedAt: string;
  status: CICDIncidentStatus;
  resolvedAt?: string;
  remediationId?: string;
  summary?: string;
}

export type CICDIncidentType = 'failure' | 'timeout' | 'flaky';
export type CICDIncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type CICDIncidentStatus = 'open' | 'acknowledged' | 'remediating' | 'resolved';

export interface RemediationRecommendation {
  incidentId: string;
  type: RemediationType;
  description: string;
  confidence: number;
  suggestedAction: string;
  createdAt: string;
}

export type RemediationType = 'retry' | 'config-change' | 'code-fix' | 'infra-fix' | 'skip';
