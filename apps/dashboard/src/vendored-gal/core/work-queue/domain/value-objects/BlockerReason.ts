/**
 * BlockerReason Value Object
 *
 * Represents a reason why an SDLC work item is blocked, along with
 * structured metadata for dashboard display and automated recovery.
 */

import type { BlockerReasonType, BlockerReasonData } from '@gal/types';

// Re-export types for convenience
export type { BlockerReasonType, BlockerReasonData };

interface BlockerMetadata {
  description: string;
  recoverable: boolean; // Can this blocker be auto-resolved?
  requiresHuman: boolean; // Does this require human intervention?
}

const BLOCKER_METADATA: Record<BlockerReasonType, BlockerMetadata> = {
  missing_issue_link: {
    description: 'PR body must include "Addresses #<issue>" or "Relates to #<issue>"',
    recoverable: true,
    requiresHuman: false,
  },
  missing_pr_link: {
    description: 'PR not created yet',
    recoverable: true,
    requiresHuman: false,
  },
  invalid_branch_name: {
    description: 'Branch name must match <issue>-description pattern',
    recoverable: false,
    requiresHuman: true,
  },
  ci_failure: {
    description: 'CI checks failed',
    recoverable: true,
    requiresHuman: false,
  },
  merge_conflict: {
    description: 'PR has merge conflicts with base branch',
    recoverable: true,
    requiresHuman: false,
  },
  review_requested: {
    description: 'Awaiting review',
    recoverable: false,
    requiresHuman: true,
  },
  changes_requested: {
    description: 'Reviewer requested changes',
    recoverable: true,
    requiresHuman: false,
  },
  pr_budget_exceeded: {
    description: 'Max open PRs limit reached (wait for merges)',
    recoverable: false,
    requiresHuman: true,
  },
  stale_session: {
    description: 'Session heartbeat timeout',
    recoverable: false,
    requiresHuman: true,
  },
  custom: {
    description: 'Custom blocker',
    recoverable: false,
    requiresHuman: true,
  },
}

export class BlockerReason {
  private constructor(
    private readonly type: BlockerReasonType,
    private readonly message: string,
    private readonly metadata: Record<string, unknown> | undefined,
    private readonly detectedAt: Date
  ) {}

  /**
   * Create a blocker reason
   */
  static create(
    type: BlockerReasonType,
    message?: string,
    metadata?: Record<string, unknown>
  ): BlockerReason {
    const defaultMessage = message ?? BLOCKER_METADATA[type].description;
    return new BlockerReason(type, defaultMessage, metadata, new Date());
  }

  /**
   * Reconstitute from plain object
   */
  static fromData(data: BlockerReasonData): BlockerReason {
    return new BlockerReason(
      data.type,
      data.message,
      data.metadata,
      data.detectedAt
    );
  }

  /**
   * Get blocker type
   */
  getType(): BlockerReasonType {
    return this.type;
  }

  /**
   * Get blocker message
   */
  getMessage(): string {
    return this.message;
  }

  /**
   * Get blocker metadata
   */
  getMetadata(): Record<string, unknown> | undefined {
    return this.metadata;
  }

  /**
   * Get detection timestamp
   */
  getDetectedAt(): Date {
    return new Date(this.detectedAt);
  }

  /**
   * Check if this blocker is recoverable
   */
  isRecoverable(): boolean {
    return BLOCKER_METADATA[this.type].recoverable;
  }

  /**
   * Check if this blocker requires human intervention
   */
  requiresHuman(): boolean {
    return BLOCKER_METADATA[this.type].requiresHuman;
  }

  /**
   * Convert to plain object for serialization
   */
  toData(): BlockerReasonData {
    return {
      type: this.type,
      message: this.message,
      metadata: this.metadata,
      detectedAt: this.detectedAt,
    };
  }

  /**
   * Check equality
   */
  equals(other: BlockerReason): boolean {
    return this.type === other.type && this.message === other.message;
  }
}
