/**
 * OSS Provider A/B Evaluation Metrics Spec (#4885)
 *
 * Defines what "winning" means when evaluating providers (Claude, Codex, OSS)
 * on background-agent tasks sourced from RTDB /sessions.
 */

export const OSS_EVAL_SCHEMA_VERSION = "v1" as const;
export const OSS_EVAL_DATASET_PATH = "/sessions" as const;

export const OSS_EVAL_TASK_SET_MODES = ["intersection", "all"] as const;
export type OssEvalTaskSetMode = (typeof OSS_EVAL_TASK_SET_MODES)[number];

/**
 * Canonical provider buckets used for cross-provider scorecards.
 *
 * - "oss" captures open-source model providers (e.g. DeepSeek/Qwen/Llama/Mistral)
 * - Additional provider strings are allowed for forward compatibility.
 */
export const OSS_EVAL_CANONICAL_PROVIDERS = ["claude", "codex", "oss"] as const;
export type OssEvalCanonicalProvider = (typeof OSS_EVAL_CANONICAL_PROVIDERS)[number];

export const OSS_EVAL_METRIC_IDS = [
  "pr_merge_rate",
  "ci_pass_rate_first_attempt",
  "task_completion_rate",
  "review_score",
] as const;
export type OssEvalMetricId = (typeof OSS_EVAL_METRIC_IDS)[number];

export interface OssEvalMetricThresholds {
  /**
   * PR merge rate:
   * merged PRs / sessions with a discovered PR
   */
  prMergeRate: number;

  /**
   * CI first-attempt pass rate:
   * PRs where first-attempt CI passed / PRs with CI evidence
   */
  ciPassRateFirstAttempt: number;

  /**
   * Task completion rate:
   * issues closed without human reopen / sessions with an issue mapping
   */
  taskCompletionRate: number;

  /**
   * Review score:
   * PRs with no requested changes / PRs with review evidence
   */
  reviewScore: number;
}

export interface OssEvalMetricWeights {
  prMergeRate: number;
  ciPassRateFirstAttempt: number;
  taskCompletionRate: number;
  reviewScore: number;
}

export interface OssEvalWinCriteria {
  /**
   * Minimum number of shared tasks (intersection mode) required
   * before declaring a winner.
   */
  minimumSharedTasks: number;

  /**
   * Composite score threshold for "win-ready" providers.
   */
  minimumCompositeScore: number;

  /**
   * When true, each individual metric must clear its threshold.
   */
  requireAllMetricThresholds: boolean;
}

export interface OssEvalMetricDefinition {
  id: OssEvalMetricId;
  label: string;
  numeratorDefinition: string;
  denominatorDefinition: string;
  thresholdKey: keyof OssEvalMetricThresholds;
  weightKey: keyof OssEvalMetricWeights;
}

export interface OssEvalSpec {
  schemaVersion: typeof OSS_EVAL_SCHEMA_VERSION;
  datasetPath: typeof OSS_EVAL_DATASET_PATH;
  defaultTaskSetMode: OssEvalTaskSetMode;
  metrics: Record<OssEvalMetricId, OssEvalMetricDefinition>;
  thresholds: OssEvalMetricThresholds;
  weights: OssEvalMetricWeights;
  winCriteria: OssEvalWinCriteria;
}

export interface OssEvalMetricResult {
  metricId: OssEvalMetricId;
  numerator: number;
  denominator: number;
  missingCount: number;
  rate: number | null;
  threshold: number;
  weight: number;
  meetsThreshold: boolean | null;
}

export interface OssEvalProviderScorecard {
  provider: string;
  sessionsConsidered: number;
  tasksConsidered: number;
  sharedTasks: number;
  metrics: Record<OssEvalMetricId, OssEvalMetricResult>;
  compositeScore: number | null;
  meetsWinCriteria: boolean;
}

export interface OssEvalWinner {
  provider: string;
  compositeScore: number;
  reason: string;
}

export interface OssEvalHarnessResult {
  schemaVersion: typeof OSS_EVAL_SCHEMA_VERSION;
  generatedAt: string;
  taskSetMode: OssEvalTaskSetMode;
  dataset: {
    source: "rtdb";
    path: typeof OSS_EVAL_DATASET_PATH;
    scannedSessions: number;
    includedSessions: number;
  };
  sharedTaskCount: number;
  providers: OssEvalProviderScorecard[];
  winner: OssEvalWinner | null;
}

/**
 * Winning thresholds for OSS provider A/B evaluation.
 *
 * These values are intentionally strict enough to avoid regressions before
 * promoting an OSS lane for background-agent execution.
 */
export const DEFAULT_OSS_EVAL_THRESHOLDS: OssEvalMetricThresholds = {
  prMergeRate: 0.75,
  ciPassRateFirstAttempt: 0.65,
  taskCompletionRate: 0.8,
  reviewScore: 0.85,
};

/**
 * Composite weighting:
 * - Task completion and merge outcomes are weighted highest.
 * - CI first-attempt quality is next.
 * - Review friction is still tracked but slightly lower weight.
 */
export const DEFAULT_OSS_EVAL_WEIGHTS: OssEvalMetricWeights = {
  prMergeRate: 0.3,
  ciPassRateFirstAttempt: 0.2,
  taskCompletionRate: 0.35,
  reviewScore: 0.15,
};

export const DEFAULT_OSS_EVAL_WIN_CRITERIA: OssEvalWinCriteria = {
  minimumSharedTasks: 20,
  minimumCompositeScore: 0.75,
  requireAllMetricThresholds: true,
};

export const OSS_EVAL_METRICS: Record<OssEvalMetricId, OssEvalMetricDefinition> = {
  pr_merge_rate: {
    id: "pr_merge_rate",
    label: "PR Merge Rate",
    numeratorDefinition: "PR merged",
    denominatorDefinition: "Session has mapped PR",
    thresholdKey: "prMergeRate",
    weightKey: "prMergeRate",
  },
  ci_pass_rate_first_attempt: {
    id: "ci_pass_rate_first_attempt",
    label: "CI Pass Rate (First Attempt)",
    numeratorDefinition: "PR CI passed on first attempt",
    denominatorDefinition: "Session has mapped PR with CI evidence",
    thresholdKey: "ciPassRateFirstAttempt",
    weightKey: "ciPassRateFirstAttempt",
  },
  task_completion_rate: {
    id: "task_completion_rate",
    label: "Task Completion Rate",
    numeratorDefinition: "Issue closed with no human reopen",
    denominatorDefinition: "Session has mapped issue",
    thresholdKey: "taskCompletionRate",
    weightKey: "taskCompletionRate",
  },
  review_score: {
    id: "review_score",
    label: "Review Score",
    numeratorDefinition: "PR had no requested changes",
    denominatorDefinition: "Session has mapped PR with review evidence",
    thresholdKey: "reviewScore",
    weightKey: "reviewScore",
  },
};

export const DEFAULT_OSS_EVAL_SPEC: OssEvalSpec = {
  schemaVersion: OSS_EVAL_SCHEMA_VERSION,
  datasetPath: OSS_EVAL_DATASET_PATH,
  defaultTaskSetMode: "intersection",
  metrics: OSS_EVAL_METRICS,
  thresholds: DEFAULT_OSS_EVAL_THRESHOLDS,
  weights: DEFAULT_OSS_EVAL_WEIGHTS,
  winCriteria: DEFAULT_OSS_EVAL_WIN_CRITERIA,
};

