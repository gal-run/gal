/**
 * Start Work Item Use Case
 *
 * Application logic for starting work on a claimed item.
 */

import { WorkItem } from '../domain/entities';
import { IWorkItemRepository } from '../repositories';

export interface StartWorkItemInput {
  workItemId: string;
}

export interface StartWorkItemOutput {
  success: boolean;
  workItem?: WorkItem;
  error?: string;
}

export class StartWorkItemUseCase {
  constructor(private readonly repository: IWorkItemRepository) {}

  async execute(input: StartWorkItemInput): Promise<StartWorkItemOutput> {
    // Find work item
    const workItem = await this.repository.findById(input.workItemId);
    if (!workItem) {
      return { success: false, error: 'Work item not found' };
    }

    // Start the work item
    const startResult = workItem.start();
    if (!startResult.success) {
      return { success: false, error: startResult.error };
    }

    // Save
    await this.repository.save(startResult.workItem);

    return { success: true, workItem: startResult.workItem };
  }
}
