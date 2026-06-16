/**
 * Fail Work Item Use Case
 *
 * Application logic for marking work items as failed.
 * Handles retry logic.
 */

import { WorkItem } from '../domain/entities';
import { IWorkItemRepository } from '../repositories';

export interface FailWorkItemInput {
  workItemId: string;
  errorMessage?: string;
  shouldRetry?: boolean;
}

export interface FailWorkItemOutput {
  success: boolean;
  workItem?: WorkItem;
  willRetry: boolean;
  error?: string;
}

export class FailWorkItemUseCase {
  constructor(private readonly repository: IWorkItemRepository) {}

  async execute(input: FailWorkItemInput): Promise<FailWorkItemOutput> {
    // Find work item
    const workItem = await this.repository.findById(input.workItemId);
    if (!workItem) {
      return { success: false, willRetry: false, error: 'Work item not found' };
    }

    // Check if should retry
    const canRetry = workItem.retryCount < workItem.maxRetries;
    const shouldRetry = input.shouldRetry !== false && canRetry;

    if (shouldRetry) {
      // Retry - release back to pending with incremented retry count
      const retryResult = workItem.retry();
      if (!retryResult.success) {
        // Can't retry, mark as failed
        const failResult = workItem.fail(input.errorMessage);
        if (!failResult.success) {
          return { success: false, willRetry: false, error: failResult.error };
        }
        await this.repository.save(failResult.workItem);
        return { success: true, workItem: failResult.workItem, willRetry: false };
      }

      await this.repository.save(retryResult.workItem);
      return { success: true, workItem: retryResult.workItem, willRetry: true };
    } else {
      // No retry - mark as failed
      const failResult = workItem.fail(input.errorMessage);
      if (!failResult.success) {
        return { success: false, willRetry: false, error: failResult.error };
      }

      await this.repository.save(failResult.workItem);
      return { success: true, workItem: failResult.workItem, willRetry: false };
    }
  }
}
