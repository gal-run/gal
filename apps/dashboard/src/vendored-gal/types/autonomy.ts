/**
 * Shared autonomy evaluation and intervention logging types (#4571).
 */

export type AutonomyMetricsWindow = 'last100' | '24h' | '7d' | '30d';

export interface AutonomyMetrics {
  totalDispatches: number;
  successfulPRs: number;
  failedDispatches: number;
  humanInterventions: number;
  manualInterventionsLogged: number;
  workItemHumanInterventions: number;
  prProductionRate: number;
  avgTimeToFirstPR: number;
  autonomyScore: number;
  failureBreakdown: Record<string, number>;
  window: { from: string; to: string };
}

export type AutonomyInterventionAction =
  | 'manual_dispatch'
  | 'firestore_cleanup'
  | 'auth_refresh'
  | 'code_fix'
  | 'config_fix'
  | 'session_retry'
  | 'queue_override'
  | 'other';

export interface AutonomyInterventionCreateRequest {
  action: AutonomyInterventionAction;
  reason: string;
  notes?: string;
  relatedIssueNumber?: number;
  preventedByIssueNumber?: number;
  sessionId?: string;
  workItemId?: string;
  metadata?: Record<string, string>;
}

export interface AutonomyInterventionRecord extends AutonomyInterventionCreateRequest {
  id: string;
  orgId: string;
  actorUserId?: string;
  actorLogin?: string;
  createdAt: string;
}

export interface AutonomyInterventionListResponse {
  success: boolean;
  interventions: AutonomyInterventionRecord[];
}

export interface AutonomyInterventionCreateResponse {
  success: boolean;
  intervention: AutonomyInterventionRecord;
}

export interface AutonomyMetricsSnapshot {
  window: AutonomyMetricsWindow;
  metrics: AutonomyMetrics;
}

export interface AutonomyOverviewResponse {
  success: boolean;
  snapshots: AutonomyMetricsSnapshot[];
  interventions: AutonomyInterventionRecord[];
}
