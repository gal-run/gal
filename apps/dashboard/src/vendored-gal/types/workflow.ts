/**
 * Workflow Types for AI Session Commands
 *
 * Types for tracking GitHub Actions workflow runs triggered via AI Session
 */

export type WorkflowStatus = 'queued' | 'in_progress' | 'completed';
export type WorkflowConclusion = 'success' | 'failure' | 'cancelled' | 'skipped' | null;

export interface WorkflowRun {
  id: number;
  status: WorkflowStatus;
  conclusion: WorkflowConclusion;
  htmlUrl: string;
  createdAt: string;
  updatedAt: string;
  command?: string;
  args?: string;
  triggeredBy?: string;
}

export interface WorkflowJob {
  id: number;
  name: string;
  status: WorkflowStatus;
  conclusion: WorkflowConclusion;
  startedAt?: string;
  completedAt?: string;
  steps: WorkflowStep[];
}

export interface WorkflowStep {
  name: string;
  status: WorkflowStatus;
  conclusion: WorkflowConclusion;
  number: number;
}

export interface ListWorkflowRunsResponse {
  runs: WorkflowRun[];
  totalCount: number;
  hasMore: boolean;
}
