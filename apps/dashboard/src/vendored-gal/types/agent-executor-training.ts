export const AGENT_EXECUTOR_DATASET_SCHEMA_VERSION = 'v1' as const;
export const AGENT_EXECUTOR_TRAINING_TASK = 'agent_executor_trajectory' as const;

export const DEFAULT_AGENT_EXECUTOR_BASE_MODEL =
  'zai-org/glm-4-9b-chat-hf' as const;
export const ONE_HOUR_AGENT_EXECUTOR_FALLBACK_MODEL =
  'zai-org/glm-4-9b-chat-hf' as const;
export const HEAVY_AGENT_EXECUTOR_MODEL =
  'zai-org/GLM-4-32B-0414' as const;

export const AGENT_EXECUTOR_REJECTION_REASONS = [
  'provider_not_teacher',
  'missing_prompt',
  'insufficient_activity',
  'blocked_session',
  'missing_pr',
  'pr_not_merged',
  'ci_not_first_pass',
  'review_requested_changes',
  'issue_reopened',
  'trace_parse_error',
] as const;

export type AgentExecutorTrainingSchemaVersion =
  typeof AGENT_EXECUTOR_DATASET_SCHEMA_VERSION;
export type AgentExecutorTrainingTask = typeof AGENT_EXECUTOR_TRAINING_TASK;
export type AgentExecutorRejectionReason =
  (typeof AGENT_EXECUTOR_REJECTION_REASONS)[number];

export type AgentExecutorPromptSource =
  | 'session_metadata'
  | 'exported_trace_metadata'
  | 'session_name';

export type AgentExecutorDatasetSplit = 'train' | 'eval';
export type AgentExecutorQualityTier = 'gold';

export interface AgentExecutorToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

export interface AgentExecutorSystemMessage {
  role: 'system';
  content: string;
}

export interface AgentExecutorUserMessage {
  role: 'user';
  content: string;
}

export interface AgentExecutorAssistantMessage {
  role: 'assistant';
  content: string | null;
  tool_calls?: AgentExecutorToolCall[];
}

export interface AgentExecutorToolMessage {
  role: 'tool';
  content: string;
  tool_call_id: string;
  name: string;
}

export type AgentExecutorMessage =
  | AgentExecutorSystemMessage
  | AgentExecutorUserMessage
  | AgentExecutorAssistantMessage
  | AgentExecutorToolMessage;

export interface AgentExecutorTrainingMetadataV1 {
  traceId: string;
  sessionId: string;
  organizationId: string;
  provider: string;
  qualityTier: AgentExecutorQualityTier;
  datasetSplit: AgentExecutorDatasetSplit;
  promptSource: AgentExecutorPromptSource;
  promptLengthChars: number;
  trajectoryLengthChars: number;
  turns: number;
  toolCallCount: number;
  filesEdited: number;
  blockedReason: string;
  blockedType: string;
  errorCount: number;
  completionReason?: string;
  completionCount: number;
  repository?: string;
  branchName?: string;
  issueNumber?: number;
  pullRequestNumber: number;
  pullRequestMerged: true;
  ciPassedFirstAttempt: true;
  reviewWithoutRequestedChanges: true;
  taskCompletedWithoutHumanReopen?: boolean | null;
  estimatedTokens: number;
}

export interface AgentExecutorTrainingExampleV1 {
  schemaVersion: AgentExecutorTrainingSchemaVersion;
  task: AgentExecutorTrainingTask;
  messages: AgentExecutorMessage[];
  metadata: AgentExecutorTrainingMetadataV1;
}

export interface AgentExecutorRejectedExampleV1 {
  schemaVersion: AgentExecutorTrainingSchemaVersion;
  task: AgentExecutorTrainingTask;
  traceId: string;
  sessionId: string;
  provider: string;
  reasons: AgentExecutorRejectionReason[];
  repository?: string;
  branchName?: string;
  issueNumber?: number;
  pullRequestNumber?: number | null;
  blockedReason?: string;
  blockedType?: string;
  promptSource?: AgentExecutorPromptSource;
  promptLengthChars?: number;
  toolCallCount?: number;
  filesEdited?: number;
  errorCount?: number;
}

export interface AgentExecutorDatasetLengthStats {
  min: number;
  median: number;
  p95: number;
}

export interface AgentExecutorDatasetManifestV1 {
  schemaVersion: AgentExecutorTrainingSchemaVersion;
  task: AgentExecutorTrainingTask;
  generatedAt: string;
  source: {
    tracesFile: string;
    qualityReportFile: string;
    evalRatio: number;
    teacherProviders: string[];
    minToolCalls: number;
  };
  models: {
    defaultBaseModel: string;
    oneHourFallbackModel: string;
    heavyUpgradeModel: string;
  };
  counts: {
    inputTraces: number;
    acceptedExamples: number;
    rejectedExamples: number;
    trainExamples: number;
    evalExamples: number;
  };
  sourceCountsByProvider: Record<string, number>;
  acceptedCountsByProvider: Record<string, number>;
  rejectionCounts: Partial<Record<AgentExecutorRejectionReason, number>>;
  estimatedTokens: {
    method: 'char_approx_v1';
    charsPerToken: 4;
    train: number;
    eval: number;
    total: number;
  };
  averages: {
    turnsPerExample: number;
    toolCallsPerExample: number;
  };
  promptLengthChars: AgentExecutorDatasetLengthStats;
  trajectoryLengthChars: AgentExecutorDatasetLengthStats;
  decisionGate: {
    heavyUpgradeAllowed: boolean;
    guidance: string;
  };
}
