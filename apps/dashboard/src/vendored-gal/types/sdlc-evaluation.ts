/**
 * SDLC Phase Evaluation Types (#4704)
 *
 * Types for evaluating background agent session quality against
 * SDLC phase criteria. Scores feed into approved config quality tracking.
 */

/** SDLC phases that can be evaluated */
export type SdlcPhase =
  | '1-specify'
  | '2-design'
  | '3-analyze'
  | '4-implement'
  | '5-validate'
  | '6-review';

/** Criteria signals for evaluating phase success */
export interface PhaseEvaluationCriteria {
  phase: SdlcPhase;
  successSignals: string[];
  failureSignals: string[];
}

/** Result of evaluating a single session's SDLC phase execution */
export interface SdlcPhaseEvaluation {
  /** Session ID that was evaluated */
  sessionId: string;
  /** Organization ID */
  organizationId: string;
  /** SDLC phase detected from the session prompt */
  phase: SdlcPhase;
  /** Config version that was active during the session */
  configVersion: string;
  /** Platform (e.g., 'claude') */
  platform: string;
  /** Overall score 0.0 - 1.0 */
  score: number;
  /** Recommendation based on evaluation */
  recommendation: 'approve' | 'revise' | 'reject';
  /** Detailed reasoning */
  reasoning: string;
  /** Individual signal matches found in logs */
  signals: {
    signal: string;
    type: 'success' | 'failure';
    found: boolean;
  }[];
  /** Session conclusion (success/failure) */
  sessionConclusion: string;
  /** Workflow run ID */
  workflowRunId?: number;
  /** ISO 8601 timestamp */
  evaluatedAt: string;
}

/** Rolling quality score for an approved config */
export interface ConfigQualityScore {
  /** Overall quality score (0.0 - 1.0, rolling avg of last 20 sessions) */
  overall: number;
  /** Per-phase quality scores */
  byPhase: Partial<Record<SdlcPhase, {
    score: number;
    evaluationCount: number;
    lastEvaluatedAt: string;
  }>>;
  /** Total evaluations contributing to the score */
  totalEvaluations: number;
  /** Last updated timestamp */
  updatedAt: string;
}
