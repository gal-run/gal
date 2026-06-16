/**
 * Delete Work Item Use Case
 *
 * Application logic for deleting work items.
 * Includes safety checks to prevent deleting active work.
 */

import { IWorkItemRepository } from '../repositories';

export interface DeleteWorkItemInput {
  workItemId: string;
  force?: boolean | undefined; // Allow deleting active items
}

export interface DeleteWorkItemOutput {
  success: boolean;
  error?: string | undefined;
}

export class DeleteWorkItemUseCase {
  constructor(private readonly repository: IWorkItemRepository) {}

  async execute(input: DeleteWorkItemInput): Promise<DeleteWorkItemOutput> {
    // Find work item
    const workItem = await this.repository.findById(input.workItemId);
    if (!workItem) {
      return { success: false, error: 'Work item not found' };
    }

    // Safety check: don't delete active work without force flag
    if (workItem.status.isActive() && !input.force) {
      return {
        success: false,
        error: 'Cannot delete active work item. Use force=true to override.',
      };
    }

    // Delete
    await this.repository.delete(input.workItemId);

    return { success: true };
  }
}
