/**
 * WorkItemStatus Value Object
 *
 * Immutable value object representing work item status.
 * Encapsulates state machine transitions.
 */

export type StatusValue = 'pending' | 'claimed' | 'in_progress' | 'completed' | 'failed';

export class WorkItemStatus {
  private constructor(private readonly value: StatusValue) {}

  static readonly PENDING = new WorkItemStatus('pending');
  static readonly CLAIMED = new WorkItemStatus('claimed');
  static readonly IN_PROGRESS = new WorkItemStatus('in_progress');
  static readonly COMPLETED = new WorkItemStatus('completed');
  static readonly FAILED = new WorkItemStatus('failed');

  /**
   * Create status from string value
   */
  static fromString(value: string): WorkItemStatus {
    if (!this.isValid(value)) {
      throw new Error(
        `Invalid status: ${value}. Must be one of: pending, claimed, in_progress, completed, failed`
      );
    }
    return new WorkItemStatus(value as StatusValue);
  }

  /**
   * Check if value is valid status
   */
  static isValid(value: string): value is StatusValue {
    return ['pending', 'claimed', 'in_progress', 'completed', 'failed'].includes(value);
  }

  /**
   * Get all possible statuses
   */
  static all(): WorkItemStatus[] {
    return [
      WorkItemStatus.PENDING,
      WorkItemStatus.CLAIMED,
      WorkItemStatus.IN_PROGRESS,
      WorkItemStatus.COMPLETED,
      WorkItemStatus.FAILED,
    ];
  }

  /**
   * Get string value
   */
  toString(): StatusValue {
    return this.value;
  }

  /**
   * Check if status allows claiming
   */
  canBeClaimed(): boolean {
    return this.value === 'pending';
  }

  /**
   * Check if status allows starting work
   */
  canBeStarted(): boolean {
    return this.value === 'claimed';
  }

  /**
   * Check if status allows completion
   */
  canBeCompleted(): boolean {
    return this.value === 'in_progress';
  }

  /**
   * Check if status allows marking as failed
   */
  canBeFailed(): boolean {
    return this.value === 'in_progress' || this.value === 'claimed';
  }

  /**
   * Check if status allows release (back to pending)
   */
  canBeReleased(): boolean {
    return this.value === 'claimed' || this.value === 'in_progress';
  }

  /**
   * Check if this is a terminal status
   */
  isTerminal(): boolean {
    return this.value === 'completed' || this.value === 'failed';
  }

  /**
   * Check if work is active (claimed or in progress)
   */
  isActive(): boolean {
    return this.value === 'claimed' || this.value === 'in_progress';
  }

  /**
   * Get valid transitions from this status
   */
  validTransitions(): WorkItemStatus[] {
    const transitions: Record<StatusValue, StatusValue[]> = {
      pending: ['claimed'],
      claimed: ['in_progress', 'pending', 'failed'], // Can release back to pending
      in_progress: ['completed', 'failed', 'pending'], // Can release back to pending
      completed: [], // Terminal
      failed: ['pending'], // Can retry
    };
    return transitions[this.value].map((s) => WorkItemStatus.fromString(s));
  }

  /**
   * Check if transition to target status is valid
   */
  canTransitionTo(target: WorkItemStatus): boolean {
    return this.validTransitions().some((s) => s.equals(target));
  }

  /**
   * Check equality
   */
  equals(other: WorkItemStatus): boolean {
    return this.value === other.value;
  }
}
