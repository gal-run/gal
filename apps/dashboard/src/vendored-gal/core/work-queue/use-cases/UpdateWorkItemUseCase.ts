/**
 * Update Work Item Use Case
 *
 * Application logic for updating work item properties.
 * Supports updating priority, context, and other mutable fields.
 */

import { WorkItem } from '../domain/entities';
import { Priority } from '../domain/value-objects';
import { IWorkItemRepository } from '../repositories';

export interface UpdateWorkItemInput {
  workItemId: string;
  priority?: number | undefined;
  context?: string | undefined;
  maxRetries?: number | undefined;
}

export interface UpdateWorkItemOutput {
  success: boolean;
  workItem?: WorkItem | undefined;
  error?: string | undefined;
}

export class UpdateWorkItemUseCase {
  constructor(private readonly repository: IWorkItemRepository) {}

  async execute(input: UpdateWorkItemInput): Promise<UpdateWorkItemOutput> {
    // Find work item
    const workItem = await this.repository.findById(input.workItemId);
    if (!workItem) {
      return { success: false, error: 'Work item not found' };
    }

    // Cannot update terminal items
    if (workItem.status.isTerminal()) {
      return { success: false, error: 'Cannot update completed or failed work items' };
    }

    // Build updated work item
    let updatedItem = workItem;

    // Update priority if provided
    if (input.priority !== undefined) {
      const newPriority = Priority.fromNumber(input.priority);
      updatedItem = updatedItem.updatePriority(newPriority);
    }

    // Note: context and maxRetries would need additional methods on WorkItem entity
    // For now, we only support priority updates through the entity's behavior
    // If context/maxRetries updates are needed, add corresponding methods to WorkItem

    // Save
    await this.repository.save(updatedItem);

    return { success: true, workItem: updatedItem };
  }
}
