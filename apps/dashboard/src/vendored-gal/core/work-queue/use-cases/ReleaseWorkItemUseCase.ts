/**
 * Release Work Item Use Case
 *
 * Application logic for releasing a single work item back to pending.
 * Different from ReleaseStaleWorkItemsUseCase which handles bulk cleanup.
 */

import { WorkItem } from '../domain/entities';
import { IWorkItemRepository } from '../repositories';

export interface ReleaseWorkItemInput {
  workItemId: string;
  agentId: string;
}

export interface ReleaseWorkItemOutput {
  success: boolean;
  workItem?: WorkItem | undefined;
  error?: string | undefined;
}

export class ReleaseWorkItemUseCase {
  constructor(private readonly repository: IWorkItemRepository) {}

  async execute(input: ReleaseWorkItemInput): Promise<ReleaseWorkItemOutput> {
    // Find work item
    const workItem = await this.repository.findById(input.workItemId);
    if (!workItem) {
      return { success: false, error: 'Work item not found' };
    }

    // Verify ownership (only the claiming agent can release)
    if (workItem.claimedBy && workItem.claimedBy !== input.agentId) {
      return { success: false, error: 'Work item is claimed by another agent' };
    }

    // Release the work item
    const releaseResult = workItem.release();
    if (!releaseResult.success) {
      return { success: false, error: releaseResult.error };
    }

    // Save
    await this.repository.save(releaseResult.workItem);

    return { success: true, workItem: releaseResult.workItem };
  }
}
