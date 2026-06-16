/**
 * MAL Background Runner Types (#1321)
 *
 * Types for automated daily health checks and evolution cycles.
 */

export interface MalRunnerConfig {
  id: string;
  orgName: string;
  enabled: boolean;
  schedule: MalRunnerSchedule;
  targets: MalRunnerTarget[];
  notifications: MalRunnerNotification;
  createdAt: string;
  updatedAt: string;
}

export interface MalRunnerSchedule {
  healthCheck: string;  // cron expression, e.g., "0 6 * * *" (daily 6am)
  evolve: string;       // cron expression, e.g., "0 0 * * 1" (weekly Monday)
  evaluate: string;     // cron expression, e.g., "0 12 * * 5" (Friday noon)
}

export interface MalRunnerTarget {
  repoFullName: string;
  branch?: string;
  autoEvolve: boolean;
  autoRepair: boolean;
}

export interface MalRunnerNotification {
  email: boolean;
  slack: boolean;
  slackChannel?: string;
  onScoreDrop: boolean;
  onCriticalIssue: boolean;
  onEvolution: boolean;
}

export interface MalRunnerExecution {
  id: string;
  orgName: string;
  type: 'health_check' | 'evolve' | 'evaluate';
  status: 'scheduled' | 'running' | 'completed' | 'failed';
  target: string;
  result?: Record<string, unknown>;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  createdAt: string;
}

export interface MalRunnerStatus {
  enabled: boolean;
  lastExecution?: MalRunnerExecution;
  nextScheduled?: { type: string; scheduledAt: string };
  totalExecutions: number;
  successRate: number;
}
