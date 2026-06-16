/**
 * WorkItemType Value Object
 *
 * Immutable value object representing the type of work to be performed.
 */

export type TypeValue = 'pr_review' | 'implement' | 'bug_fix' | 'sdlc_task';

export class WorkItemType {
  private constructor(private readonly value: TypeValue) {}

  static readonly PR_REVIEW = new WorkItemType('pr_review');
  static readonly IMPLEMENT = new WorkItemType('implement');
  static readonly BUG_FIX = new WorkItemType('bug_fix');
  static readonly SDLC_TASK = new WorkItemType('sdlc_task');

  /**
   * Create type from string value
   */
  static fromString(value: string): WorkItemType {
    if (!this.isValid(value)) {
      throw new Error(
        `Invalid work item type: ${value}. Must be one of: pr_review, implement, bug_fix, sdlc_task`
      );
    }
    return new WorkItemType(value as TypeValue);
  }

  /**
   * Check if value is valid type
   */
  static isValid(value: string): value is TypeValue {
    return ['pr_review', 'implement', 'bug_fix', 'sdlc_task'].includes(value);
  }

  /**
   * Get all types
   */
  static all(): WorkItemType[] {
    return [
      WorkItemType.PR_REVIEW,
      WorkItemType.IMPLEMENT,
      WorkItemType.BUG_FIX,
      WorkItemType.SDLC_TASK,
    ];
  }

  /**
   * Get string value
   */
  toString(): TypeValue {
    return this.value;
  }

  /**
   * Get human-readable label
   */
  toLabel(): string {
    const labels: Record<TypeValue, string> = {
      pr_review: 'PR Review',
      implement: 'Implementation',
      bug_fix: 'Bug Fix',
      sdlc_task: 'SDLC Task',
    };
    return labels[this.value];
  }

  /**
   * Check if this is SDLC-related work
   */
  isSdlc(): boolean {
    return this.value === 'sdlc_task';
  }

  /**
   * Check if this is PR-related work
   */
  isPR(): boolean {
    return this.value === 'pr_review';
  }

  /**
   * Check equality
   */
  equals(other: WorkItemType): boolean {
    return this.value === other.value;
  }
}
