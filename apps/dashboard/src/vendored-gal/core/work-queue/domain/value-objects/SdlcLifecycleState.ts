/**
 * SDLC Lifecycle State Value Object
 *
 * Immutable value object representing the current lifecycle state
 * of an SDLC work item within a phase. Provides strict enforcement
 * of the intake -> implement -> test -> PR -> review -> merge -> verify flow.
 */

import type { SdlcLifecycleStateValue } from '@gal/types';

// Re-export type for convenience
export type { SdlcLifecycleStateValue };

interface StateMetadata {
  description: string;
  allowedTransitions: SdlcLifecycleStateValue[];
  requiresBranchName?: boolean;
  requiresIssueLink?: boolean;
  requiresPRLink?: boolean;
}

const STATE_METADATA: Record<SdlcLifecycleStateValue, StateMetadata> = {
  intake: {
    description: 'Issue claimed, awaiting implementation',
    allowedTransitions: ['implement'],
    requiresIssueLink: true,
  },
  implement: {
    description: 'Active implementation in progress',
    allowedTransitions: ['test', 'pr_created'],
    requiresBranchName: true,
    requiresIssueLink: true,
  },
  test: {
    description: 'Tests being written/run',
    allowedTransitions: ['pr_created', 'implement'],
    requiresBranchName: true,
    requiresIssueLink: true,
  },
  pr_created: {
    description: 'PR created, awaiting review',
    allowedTransitions: ['review', 'implement'], // Can go back to implement if changes needed
    requiresBranchName: true,
    requiresIssueLink: true,
    requiresPRLink: true,
  },
  review: {
    description: 'PR under review',
    allowedTransitions: ['merge_ready', 'implement'], // Can go back to implement if changes needed
    requiresBranchName: true,
    requiresIssueLink: true,
    requiresPRLink: true,
  },
  merge_ready: {
    description: 'PR approved, ready to merge',
    allowedTransitions: ['merged'],
    requiresBranchName: true,
    requiresIssueLink: true,
    requiresPRLink: true,
  },
  merged: {
    description: 'PR merged to main',
    allowedTransitions: ['release_verify'],
    requiresIssueLink: true,
    requiresPRLink: true,
  },
  release_verify: {
    description: 'Production verification in progress',
    allowedTransitions: [],
    requiresIssueLink: true,
    requiresPRLink: true,
  },
};

export class SdlcLifecycleState {
  private constructor(private readonly value: SdlcLifecycleStateValue) {}

  static readonly INTAKE = new SdlcLifecycleState('intake');
  static readonly IMPLEMENT = new SdlcLifecycleState('implement');
  static readonly TEST = new SdlcLifecycleState('test');
  static readonly PR_CREATED = new SdlcLifecycleState('pr_created');
  static readonly REVIEW = new SdlcLifecycleState('review');
  static readonly MERGE_READY = new SdlcLifecycleState('merge_ready');
  static readonly MERGED = new SdlcLifecycleState('merged');
  static readonly RELEASE_VERIFY = new SdlcLifecycleState('release_verify');

  /**
   * Create state from string
   */
  static fromString(value: string): SdlcLifecycleState {
    const normalized = value.toLowerCase() as SdlcLifecycleStateValue;
    if (!this.isValid(normalized)) {
      throw new Error(`Invalid SDLC lifecycle state: ${value}`);
    }
    return new SdlcLifecycleState(normalized);
  }

  /**
   * Check if value is valid
   */
  static isValid(value: string): value is SdlcLifecycleStateValue {
    return Object.keys(STATE_METADATA).includes(value);
  }

  /**
   * Get all states in order
   */
  static all(): SdlcLifecycleState[] {
    return [
      SdlcLifecycleState.INTAKE,
      SdlcLifecycleState.IMPLEMENT,
      SdlcLifecycleState.TEST,
      SdlcLifecycleState.PR_CREATED,
      SdlcLifecycleState.REVIEW,
      SdlcLifecycleState.MERGE_READY,
      SdlcLifecycleState.MERGED,
      SdlcLifecycleState.RELEASE_VERIFY,
    ];
  }

  /**
   * Get state value
   */
  toString(): SdlcLifecycleStateValue {
    return this.value;
  }

  /**
   * Get state description
   */
  getDescription(): string {
    return STATE_METADATA[this.value].description;
  }

  /**
   * Get allowed transitions from this state
   */
  getAllowedTransitions(): SdlcLifecycleState[] {
    return STATE_METADATA[this.value].allowedTransitions.map(
      (v) => new SdlcLifecycleState(v)
    );
  }

  /**
   * Check if transition to another state is allowed
   */
  canTransitionTo(nextState: SdlcLifecycleState): boolean {
    return STATE_METADATA[this.value].allowedTransitions.includes(nextState.value);
  }

  /**
   * Check if this state requires a branch name
   */
  requiresBranchName(): boolean {
    return STATE_METADATA[this.value].requiresBranchName ?? false;
  }

  /**
   * Check if this state requires an issue link
   */
  requiresIssueLink(): boolean {
    return STATE_METADATA[this.value].requiresIssueLink ?? false;
  }

  /**
   * Check if this state requires a PR link
   */
  requiresPRLink(): boolean {
    return STATE_METADATA[this.value].requiresPRLink ?? false;
  }

  /**
   * Check if this is the final state
   */
  isFinal(): boolean {
    return this.value === 'release_verify';
  }

  /**
   * Check equality
   */
  equals(other: SdlcLifecycleState): boolean {
    return this.value === other.value;
  }
}
