/**
 * Release Stale Work Items Use Case
 *
 * Application logic for releasing stale work items back to the queue.
 */

import { WorkItem } from '../domain/entities';
import { DEFAULT_STALE_THRESHOLD_MS } from '../domain/rules/StaleDetectionRules';
import { IWorkItemRepository } from '../repositories';

export interface ReleaseStaleWorkItemsInput {
  organizationId: string;
  staleThresholdMs?: number;
}

export interface ReleaseStaleWorkItemsOutput {
  success: boolean;
  releasedCount: number;
  releasedItems: WorkItem[];
  errors: Array<{ itemId: string; error: string }>;
}

export class ReleaseStaleWorkItemsUseCase {
  constructor(private readonly repository: IWorkItemRepository) {}

  async execute(input: ReleaseStaleWorkItemsInput): Promise<ReleaseStaleWorkItemsOutput> {
    const thresholdMs = input.staleThresholdMs ?? DEFAULT_STALE_THRESHOLD_MS;

    // Find stale items
    const staleItems = await this.repository.findStale(input.organizationId, thresholdMs);

    const releasedItems: WorkItem[] = [];
    const errors: Array<{ itemId: string; error: string }> = [];

    for (const item of staleItems) {
      const releaseResult = item.release();
      if (releaseResult.success) {
        await this.repository.save(releaseResult.workItem);
        releasedItems.push(releaseResult.workItem);
      } else {
        errors.push({ itemId: item.id, error: releaseResult.error });
      }
    }

    return {
      success: errors.length === 0,
      releasedCount: releasedItems.length,
      releasedItems,
      errors,
    };
  }
}
