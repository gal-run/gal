export interface MalCliSession {
  id: string;
  orgName: string;
  userId: string;
  command: 'build' | 'maintain' | 'evaluate' | 'evolve' | 'status';
  repoFullName: string;
  status: 'running' | 'completed' | 'failed';
  result?: Record<string, unknown>;
  startedAt: string;
  completedAt?: string;
}

export interface MalCliStatusResponse {
  malVersion: string;
  orgName: string;
  repoFullName: string;
  lastScore?: number;
  lastHealthCheck?: string;
  lastEvolution?: string;
  runnerEnabled: boolean;
  knowledgeEntries: number;
  signalsProcessed: number;
}

export interface MalCliQuickAction {
  id: string;
  action: 'build' | 'maintain' | 'evaluate' | 'evolve';
  description: string;
  estimatedDuration: string;
  autoApprove: boolean;
}
