/**
 * Stale Detection Rules
 *
 * Pure business logic for detecting stale/abandoned work items.
 * Items without heartbeat should be released back to the queue.
 */

import { WorkItemStatus } from '../value-objects';

export interface StaleCheckContext {
  status: WorkItemStatus;
  claimedAt?: Date | undefined;
  lastHeartbeatAt?: Date | undefined;
  now?: Date | undefined;
}

export interface StaleCheckResult {
  isStale: boolean;
  reason?: string | undefined;
  staleDurationMs?: number | undefined;
}

/**
 * Default stale threshold (5 minutes)
 */
export const DEFAULT_STALE_THRESHOLD_MS = 5 * 60 * 1000;

/**
 * Check if a work item is stale (no heartbeat)
 */
export function isStale(
  context: StaleCheckContext,
  staleThresholdMs: number = DEFAULT_STALE_THRESHOLD_MS
): StaleCheckResult {
  const now = context.now || new Date();

  // Only active items can be stale
  if (!context.status.isActive()) {
    return { isStale: false };
  }

  // Must have a claim time or heartbeat
  const lastActivity = context.lastHeartbeatAt || context.claimedAt;
  if (!lastActivity) {
    return { isStale: false };
  }

  const timeSinceActivity = now.getTime() - lastActivity.getTime();

  if (timeSinceActivity >= staleThresholdMs) {
    return {
      isStale: true,
      reason: `No heartbeat for ${Math.round(timeSinceActivity / 1000)}s (threshold: ${staleThresholdMs / 1000}s)`,
      staleDurationMs: timeSinceActivity,
    };
  }

  return { isStale: false };
}

/**
 * Find stale items from a list
 */
export function findStaleItems<T extends {
  id: string;
  status: string;
  claimedAt?: Date;
  lastHeartbeatAt?: Date;
}>(
  items: T[],
  staleThresholdMs: number = DEFAULT_STALE_THRESHOLD_MS,
  now: Date = new Date()
): Array<{ item: T; result: StaleCheckResult }> {
  const staleItems: Array<{ item: T; result: StaleCheckResult }> = [];

  for (const item of items) {
    const result = isStale(
      {
        status: WorkItemStatus.fromString(item.status),
        claimedAt: item.claimedAt,
        lastHeartbeatAt: item.lastHeartbeatAt,
        now,
      },
      staleThresholdMs
    );

    if (result.isStale) {
      staleItems.push({ item, result });
    }
  }

  return staleItems;
}

/**
 * Check if heartbeat is needed
 */
export function needsHeartbeat(
  lastHeartbeatAt: Date | undefined,
  heartbeatIntervalMs: number = 60000, // 1 minute default
  now: Date = new Date()
): boolean {
  if (!lastHeartbeatAt) {
    return true;
  }

  const timeSinceHeartbeat = now.getTime() - lastHeartbeatAt.getTime();
  return timeSinceHeartbeat >= heartbeatIntervalMs;
}

/**
 * Calculate time until item becomes stale
 */
export function timeUntilStale(
  lastActivity: Date,
  staleThresholdMs: number = DEFAULT_STALE_THRESHOLD_MS,
  now: Date = new Date()
): number {
  const elapsed = now.getTime() - lastActivity.getTime();
  return Math.max(0, staleThresholdMs - elapsed);
}
