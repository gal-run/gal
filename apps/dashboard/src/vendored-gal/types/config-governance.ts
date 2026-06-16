/**
 * Config Governance Types - Phase 1
 *
 * Two-scope governance model (Org + Project) with developer-proposes/admin-approves workflow.
 *
 * Feature: Config Governance Model (GitHub Issue #1044)
 * Spec: openspec/changes/1044-config-governance-model/
 */

import type { GalConfig } from './gal-config.js';

/**
 * Config version stored in Firestore
 * Represents an approved, immutable configuration at a point in time
 */
export interface ConfigVersion {
  /** Unique version ID */
  id: string;
  /** Scope: org-wide or project-specific */
  scope: 'org' | 'project';
  /** Organization ID or Repository ID */
  scopeId: string;
  /** Sequential version number (1, 2, 3, ...) */
  version: number;
  /** The actual configuration content */
  content: GalConfig;
  /** Status of this version */
  status: 'active' | 'superseded';
  /** When this version was created */
  createdAt: Date;
  /** User ID who created this version */
  createdBy: string;
  /** User ID who approved this version (for proposals that became active) */
  approvedBy?: string;
  /** Description of what changed in this version */
  changeDescription?: string;
}

/**
 * Proposal for config changes
 * Developers propose changes, admins approve/reject
 */
export interface ConfigProposal {
  /** Unique proposal ID */
  id: string;
  /** Scope: org-wide or project-specific */
  scope: 'org' | 'project';
  /** Organization ID or Repository ID */
  scopeId: string;
  /** User ID who proposed this */
  proposedBy: string;
  /** When this was proposed */
  proposedAt: Date;
  /** Proposed configuration content */
  content: GalConfig;
  /** Version number this proposal is based on */
  basedOnVersion?: number;
  /** Current status of proposal */
  status: 'pending' | 'approved' | 'rejected' | 'withdrawn';
  /** User ID who reviewed this */
  reviewedBy?: string;
  /** When this was reviewed */
  reviewedAt?: Date;
  /** Admin's review comment */
  reviewComment?: string;
  /** AI auto-approval decision (populated by AutoApprovalService when evaluated) */
  autoApprovalDecision?: {
    decision: 'approve' | 'reject' | 'escalate';
    confidence: number;
    reasoning: string;
  };
}

/**
 * Tracked repository
 * Repos that are governed by GAL
 */
export interface TrackedRepo {
  /** Unique repo tracking ID */
  id: string;
  /** Organization ID this repo belongs to */
  orgId: string;
  /** Full repository name (owner/repo) */
  repoFullName: string;
  /** GitHub App installation ID (if installed) */
  installationId?: number;
  /** Whether this repo has a project-specific config */
  hasProjectConfig: boolean;
  /** Active config version number (if project config exists) */
  activeConfigVersion?: number;
  /** When this repo was tracked */
  trackedAt: Date;
  /** User ID who tracked this repo */
  trackedBy: string;
}

/**
 * Diff between two configs
 * Computed when viewing proposals
 */
export interface ConfigDiff {
  /** Fields added in new config */
  added: Record<string, unknown>;
  /** Fields modified from old to new */
  modified: Record<string, { old: unknown; new: unknown }>;
  /** Fields removed from old config */
  removed: Record<string, unknown>;
}

// ============================================================================
// API Request/Response Types
// ============================================================================

/**
 * Request body for creating a proposal
 */
export interface CreateProposalRequest {
  /** Proposed configuration content */
  content: GalConfig;
  /** Optional description of changes */
  description?: string;
}

/**
 * Response when proposal is created
 */
export interface CreateProposalResponse {
  /** Newly created proposal ID */
  id: string;
  /** Initial status (always 'pending') */
  status: 'pending';
  /** Computed diff vs current active config */
  diff: ConfigDiff;
  /** When proposal was created (ISO 8601) */
  createdAt: string;
}

/**
 * Request body for reviewing a proposal
 */
export interface ReviewProposalRequest {
  /** Action to take */
  action: 'approve' | 'reject' | 'request_changes';
  /** Optional comment from reviewer */
  comment?: string;
}

/**
 * Response when getting merged config (org + project)
 */
export interface MergedConfigResponse {
  /** Org-level config */
  org: {
    version: number;
    content: GalConfig;
  };
  /** Project-level config (if exists) */
  project?: {
    version: number;
    content: GalConfig;
  };
  /** Final merged configuration */
  merged: GalConfig;
}

/**
 * Response when listing proposals
 */
export interface ListProposalsResponse {
  /** Array of proposals */
  proposals: ConfigProposal[];
  /** Total count (for pagination) */
  total: number;
}

/**
 * Response when getting proposal with diff
 */
export interface ProposalWithDiffResponse {
  /** The proposal */
  proposal: ConfigProposal;
  /** Computed diff vs current active config */
  diff: ConfigDiff;
}

/**
 * Request body for rolling back to a previous version
 */
export interface RollbackRequest {
  /** Version number to rollback to */
  version: number;
  /** Reason for rollback */
  reason?: string;
}

/**
 * Response when rollback is performed
 */
export interface RollbackResponse {
  /** Newly created version (rollback creates new version) */
  version: number;
  /** Previous active version that was superseded */
  previousVersion: number;
  /** When rollback occurred */
  rolledBackAt: string;
}
