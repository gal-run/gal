/**
 * Feedback Types for GAL Proactive Feedback Collection (Issue #1111)
 *
 * Shared types for feedback collection across Dashboard, CLI, VS Code Extension,
 * and Chrome Extension.
 */

/** Product surface that generated the feedback */
export type FeedbackProduct = 'dashboard' | 'cli' | 'vscode-extension' | 'chrome-extension';

/** Quick rating type (thumbs up/down) */
export type FeedbackRating = 'positive' | 'negative';

/** Reason categories for negative feedback */
export type NegativeFeedbackReason =
  | 'inaccurate'
  | 'not-helpful'
  | 'too-slow'
  | 'confusing-ui'
  | 'missing-feature'
  | 'other';

/** Feedback submission request */
export interface FeedbackSubmission {
  /** Quick rating */
  rating: FeedbackRating;
  /** Reason for negative feedback (required when rating is 'negative') */
  reason?: NegativeFeedbackReason;
  /** Optional freeform comment (max 2000 chars) */
  comment?: string;
  /** Product that generated the feedback */
  product: FeedbackProduct;
  /** Product version string */
  productVersion?: string;
  /** Action context (what the user was doing) */
  context?: FeedbackContext;
}

/** Context about what triggered the feedback */
export interface FeedbackContext {
  /** The action that was performed (e.g. 'config-sync', 'approval', 'scan') */
  action?: string;
  /** Current page or CLI command */
  location?: string;
  /** Error type if feedback was triggered by an error */
  errorType?: string;
  /** Error message if applicable */
  errorMessage?: string;
  /** Any additional metadata */
  metadata?: Record<string, string>;
}

/** Stored feedback record (API response) */
export type FeedbackTriageStatus = 'pending' | 'triaged';

export interface FeedbackTriage {
  /** Manual triage state for turning feedback into a GitHub issue */
  status: FeedbackTriageStatus;
  /** Linked GitHub issue number once triaged */
  githubIssueNumber?: number;
  /** Linked GitHub issue URL once triaged */
  githubIssueUrl?: string;
  /** Repository that received the triaged issue */
  repository?: string;
  /** Org used to resolve the GitHub App installation */
  orgName?: string;
  /** Timestamp of triage completion */
  triagedAt?: string;
  /** User who performed the triage */
  triagedBy?: string;
}

export interface FeedbackRecord extends FeedbackSubmission {
  /** Unique feedback ID */
  id: string;
  /** User ID (optional - anonymous feedback allowed) */
  userId?: string;
  /** User's GitHub login (if authenticated) */
  githubLogin?: string;
  /** Organization context */
  organization?: string;
  /** Timestamp */
  createdAt: string;
  /** Optional manual issue-triage metadata */
  triage?: FeedbackTriage;
}

/** Response from POST /api/feedback */
export interface FeedbackResponse {
  success: boolean;
  id?: string;
  message?: string;
}

/** Feedback prompt configuration */
export interface FeedbackPromptConfig {
  /** Whether feedback prompts are enabled */
  enabled: boolean;
  /** Maximum prompts per session */
  maxPromptsPerSession: number;
  /** Minimum time between prompts (minutes) */
  cooldownMinutes: number;
  /** Actions that trigger feedback prompts */
  triggerActions: string[];
}

export interface FeedbackListResponse {
  success: boolean;
  feedback: FeedbackRecord[];
}

export interface FeedbackCreateIssueRequest {
  /** Target repository in owner/repo format; defaults to the GAL repo */
  repository?: string;
  /** Optional org used to resolve the GitHub App installation */
  orgName?: string;
}

export interface FeedbackCreateIssueResponse {
  success: boolean;
  result?: {
    action: 'created' | 'existing';
    issueNumber: number;
    issueUrl: string;
    repository: string;
  };
  message?: string;
}
