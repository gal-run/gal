/**
 * State Transition Rules
 *
 * Pure business logic for work item state transitions.
 * No external dependencies - operates only on domain types.
 */

import { WorkItemStatus } from '../value-objects';

export interface TransitionResult {
  allowed: boolean;
  reason?: string | undefined;
}

/**
 * Validate state transition
 */
export function canTransition(
  from: WorkItemStatus,
  to: WorkItemStatus
): TransitionResult {
  if (from.equals(to)) {
    return { allowed: false, reason: 'Already in this status' };
  }

  if (!from.canTransitionTo(to)) {
    return {
      allowed: false,
      reason: `Cannot transition from ${from.toString()} to ${to.toString()}`,
    };
  }

  return { allowed: true };
}

/**
 * Validate claim transition
 */
export function canClaim(status: WorkItemStatus): TransitionResult {
  if (!status.canBeClaimed()) {
    return {
      allowed: false,
      reason: `Cannot claim work item with status: ${status.toString()}`,
    };
  }
  return { allowed: true };
}

/**
 * Validate start transition
 */
export function canStart(status: WorkItemStatus): TransitionResult {
  if (!status.canBeStarted()) {
    return {
      allowed: false,
      reason: `Cannot start work item with status: ${status.toString()}. Must be claimed first.`,
    };
  }
  return { allowed: true };
}

/**
 * Validate complete transition
 */
export function canComplete(status: WorkItemStatus): TransitionResult {
  if (!status.canBeCompleted()) {
    return {
      allowed: false,
      reason: `Cannot complete work item with status: ${status.toString()}. Must be in_progress.`,
    };
  }
  return { allowed: true };
}

/**
 * Validate fail transition
 */
export function canFail(status: WorkItemStatus): TransitionResult {
  if (!status.canBeFailed()) {
    return {
      allowed: false,
      reason: `Cannot fail work item with status: ${status.toString()}`,
    };
  }
  return { allowed: true };
}

/**
 * Validate release transition (back to pending)
 */
export function canRelease(status: WorkItemStatus): TransitionResult {
  if (!status.canBeReleased()) {
    return {
      allowed: false,
      reason: `Cannot release work item with status: ${status.toString()}`,
    };
  }
  return { allowed: true };
}

/**
 * Check if work item can be retried after failure
 */
export function canRetry(
  status: WorkItemStatus,
  retryCount: number,
  maxRetries: number
): TransitionResult {
  if (!status.equals(WorkItemStatus.FAILED)) {
    return {
      allowed: false,
      reason: 'Can only retry failed work items',
    };
  }

  if (retryCount >= maxRetries) {
    return {
      allowed: false,
      reason: `Max retries (${maxRetries}) exceeded`,
    };
  }

  return { allowed: true };
}

/**
 * Get the next status after a valid transition
 */
export function getNextStatus(
  action: 'claim' | 'start' | 'complete' | 'fail' | 'release' | 'retry'
): WorkItemStatus {
  switch (action) {
    case 'claim':
      return WorkItemStatus.CLAIMED;
    case 'start':
      return WorkItemStatus.IN_PROGRESS;
    case 'complete':
      return WorkItemStatus.COMPLETED;
    case 'fail':
      return WorkItemStatus.FAILED;
    case 'release':
    case 'retry':
      return WorkItemStatus.PENDING;
  }
}
