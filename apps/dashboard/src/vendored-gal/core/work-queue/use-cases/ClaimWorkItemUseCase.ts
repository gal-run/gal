/**
 * Claim Work Item Use Case
 *
 * Application logic for claiming work items.
 * Handles atomic claiming to prevent race conditions.
 */

import { WorkItem } from '../domain/entities';
import { IWorkItemRepository } from '../repositories';

export interface ClaimWorkItemInput {
  workItemId?: string;
  organizationId: string;
  agentId: string;
}

export interface ClaimWorkItemOutput {
  success: boolean;
  workItem?: WorkItem;
  error?: string;
}

export class ClaimWorkItemUseCase {
  constructor(private readonly repository: IWorkItemRepository) {}

  /**
   * Claim a specific work item by ID
   */
  async claimById(input: ClaimWorkItemInput): Promise<ClaimWorkItemOutput> {
    if (!input.workItemId) {
      return { success: false, error: 'Work item ID is required' };
    }

    if (!input.agentId) {
      return { success: false, error: 'Agent ID is required' };
    }

    // Try atomic claim
    const claimed = await this.repository.atomicClaim(input.workItemId, input.agentId);

    if (!claimed) {
      return { success: false, error: 'Work item not available for claiming' };
    }

    return { success: true, workItem: claimed };
  }

  /**
   * Claim the next available work item (highest priority)
   */
  async claimNext(input: Omit<ClaimWorkItemInput, 'workItemId'>): Promise<ClaimWorkItemOutput> {
    if (!input.agentId) {
      return { success: false, error: 'Agent ID is required' };
    }

    // Get pending items ordered by priority
    const pendingItems = await this.repository.findPending(input.organizationId, 10);

    if (pendingItems.length === 0) {
      return { success: false, error: 'No pending work items available' };
    }

    // Try to claim each item until successful (handle race conditions)
    for (const item of pendingItems) {
      const claimed = await this.repository.atomicClaim(item.id, input.agentId);
      if (claimed) {
        return { success: true, workItem: claimed };
      }
    }

    return { success: false, error: 'All pending items were claimed by other agents' };
  }
}
