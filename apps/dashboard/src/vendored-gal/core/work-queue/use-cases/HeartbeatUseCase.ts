/**
 * Heartbeat Use Case
 *
 * Application logic for updating work item heartbeat.
 */

import { WorkItem } from '../domain/entities';
import { IWorkItemRepository } from '../repositories';

export interface HeartbeatInput {
  workItemId: string;
  agentId: string;
}

export interface HeartbeatOutput {
  success: boolean;
  workItem?: WorkItem;
  error?: string;
}

export class HeartbeatUseCase {
  constructor(private readonly repository: IWorkItemRepository) {}

  async execute(input: HeartbeatInput): Promise<HeartbeatOutput> {
    // Find work item
    const workItem = await this.repository.findById(input.workItemId);
    if (!workItem) {
      return { success: false, error: 'Work item not found' };
    }

    // Verify agent owns this item
    if (workItem.claimedBy !== input.agentId) {
      return { success: false, error: 'Work item not claimed by this agent' };
    }

    // Verify item is active
    if (!workItem.status.isActive()) {
      return { success: false, error: 'Work item is not active' };
    }

    // Update heartbeat
    const updatedItem = workItem.heartbeat();
    await this.repository.save(updatedItem);

    return { success: true, workItem: updatedItem };
  }
}
