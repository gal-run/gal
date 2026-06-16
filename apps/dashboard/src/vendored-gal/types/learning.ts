/**
 * Organization-scope learning capture types.
 *
 * This pipeline stores generalized, reusable learnings captured from sessions
 * and session-relevant memory. It is intentionally separate from user-scope
 * memory mirroring so GAL does not publish raw local memory into org scope.
 *
 * Storage: organizations/{orgId}/learnings/{learningId}
 * Scope: organization, tied to repo/workspace
 */

/** Organization learnings are shared at org scope after review. */
export type LearningScope = 'organization';

/**
 * Which org-safe source produced the capture candidate.
 * `session_summary` is reserved for future session-log extraction.
 * `instruction_pattern` is for auto-detected patterns from instruction files (#6641).
 */
export type LearningSourceKind = 'memory_file' | 'instruction_file' | 'instruction_pattern' | 'session_summary';

/**
 * Categories for classifying extracted learnings.
 */
export type LearningCategory =
  | 'repo_pattern'          // Repository-specific patterns (build commands, file structure)
  | 'tool_configuration'    // Tool/environment configuration that worked
  | 'debugging_strategy'    // Debugging approaches that resolved issues
  | 'architectural_decision'// Architectural choices and their rationale
  | 'workflow_pattern'      // Workflow patterns (CI, deployment, review)
  | 'error_resolution'      // How specific errors were resolved
  | 'other';                // Catch-all

/**
 * Curation status for admin review.
 */
export type LearningStatus = 'pending' | 'approved' | 'rejected';

/**
 * A single learning extracted from a background agent session.
 */
export interface Learning {
  /** Unique learning identifier (auto-generated) */
  id: string;
  /** Organization that owns the learning */
  organizationId: string;
  /** Explicit scope marker for the org capture pipeline */
  scope: LearningScope;
  /** Session ID that generated this learning */
  sessionId: string;
  /** Agent provider that generated the learning */
  provider: string;
  /** Repository (owner/repo format) this learning applies to */
  repo: string;
  /** Which session-relevant source produced the learning */
  sourceKind: LearningSourceKind;
  /** Learning category for filtering */
  category: LearningCategory;
  /** Human-readable title/summary of the learning */
  title: string;
  /** Full content of the learning (Markdown) */
  content: string;
  /** ISO 8601 timestamp of when the learning was extracted */
  createdAt: string;
  /** ISO 8601 timestamp of the latest content update */
  updatedAt?: string;
  /** Curation status for admin review */
  status: LearningStatus;
  /** User ID who curated (approved/rejected) this learning */
  curatedBy?: string;
  /** ISO 8601 timestamp of curation */
  curatedAt?: string;
  /** Source file path where the learning was found (e.g., ".claude/CLAUDE.md") */
  sourceFile?: string;
  /** Stable dedupe key derived from org/repo/category/title */
  dedupeKey?: string;
  /** Hash of the normalized content used to detect exact duplicates */
  contentHash?: string;
}

/**
 * Request body for creating a learning via API.
 * Used by the runner to submit extracted learnings post-session.
 */
export interface CreateLearningRequest {
  /** Explicit scope marker for the org capture pipeline */
  scope?: LearningScope;
  /** Session ID that generated this learning */
  sessionId: string;
  /** Agent provider */
  provider: string;
  /** Repository (owner/repo format) */
  repo: string;
  /** Which session-relevant source produced the learning */
  sourceKind?: LearningSourceKind;
  /** Learning category */
  category: LearningCategory;
  /** Human-readable title */
  title: string;
  /** Full content (Markdown) */
  content: string;
  /** Source file path */
  sourceFile?: string;
}

/**
 * Query filters for listing learnings.
 */
export interface LearningFilters {
  /** Filter by repository */
  repo?: string;
  /** Filter by category */
  category?: LearningCategory;
  /** Filter by curation status */
  status?: LearningStatus;
  /** Maximum number of results */
  limit?: number;
}

/**
 * Response for GET learnings endpoint.
 */
export interface LearningListResponse {
  learnings: Learning[];
  totalCount: number;
}

/**
 * Request body for PATCH (curate) a learning.
 */
export interface CurateLearningRequest {
  status: 'approved' | 'rejected';
}

/**
 * A summarized learning for injection into new sessions.
 * Lighter weight than full Learning — only the essentials for agent context.
 */
export interface LearningInjectionEntry {
  /** Learning category */
  category: LearningCategory;
  /** Title/summary */
  title: string;
  /** Content (possibly truncated for injection) */
  content: string;
}
