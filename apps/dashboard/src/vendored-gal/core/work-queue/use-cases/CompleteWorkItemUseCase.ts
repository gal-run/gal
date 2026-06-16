/**
 * Complete Work Item Use Case
 *
 * Application logic for completing work items.
 * Handles SDLC orchestration (auto-creating next phase).
 */

import { WorkItem, WorkItemResult } from '../domain/entities';
import { WorkItemStatus } from '../domain/value-objects';
import {
  shouldCreateNextPhase,
  createNextPhaseWorkItem,
} from '../domain/rules/SdlcOrchestrationRules';
import { IWorkItemRepository } from '../repositories';
import { CreateWorkItemUseCase } from './CreateWorkItemUseCase';

export interface CompleteWorkItemInput {
  workItemId: string;
  result?: WorkItemResult;
}

export interface CompleteWorkItemOutput {
  success: boolean;
  workItem?: WorkItem | undefined;
  nextPhaseWorkItem?: WorkItem | undefined;
  error?: string | undefined;
}

export class CompleteWorkItemUseCase {
  constructor(
    private readonly repository: IWorkItemRepository,
    private readonly createWorkItemUseCase: CreateWorkItemUseCase
  ) {}

  async execute(input: CompleteWorkItemInput): Promise<CompleteWorkItemOutput> {
    // Find work item
    const workItem = await this.repository.findById(input.workItemId);
    if (!workItem) {
      return { success: false, error: 'Work item not found' };
    }

    // Complete the work item
    const completeResult = workItem.complete(input.result);
    if (!completeResult.success) {
      return { success: false, error: completeResult.error };
    }

    const completedItem = completeResult.workItem;

    // Save completed item
    await this.repository.save(completedItem);

    // Check if we need to create next SDLC phase
    let nextPhaseWorkItem: WorkItem | undefined;

    if (completedItem.isSdlcTask() && completedItem.sdlcPhase && completedItem.parentIssueId) {
      if (shouldCreateNextPhase(completedItem.sdlcPhase, WorkItemStatus.COMPLETED)) {
        const nextPhaseData = createNextPhaseWorkItem({
          currentPhase: completedItem.sdlcPhase,
          parentIssueId: completedItem.parentIssueId,
          organizationId: completedItem.organizationId,
          source: completedItem.source,
          priority: completedItem.priority,
        });

        if (nextPhaseData) {
          const createResult = await this.createWorkItemUseCase.execute({
            organizationId: nextPhaseData.organizationId,
            priority: nextPhaseData.priority.toNumber(),
            type: nextPhaseData.type,
            source: nextPhaseData.source.toObject(),
            command: nextPhaseData.command,
            sdlcPhase: nextPhaseData.sdlcPhase.toNumber(),
            parentIssueId: nextPhaseData.parentIssueId,
          });

          if (createResult.success && createResult.workItem) {
            nextPhaseWorkItem = createResult.workItem;
          }
        }
      }
    }

    const output: CompleteWorkItemOutput = {
      success: true,
      workItem: completedItem,
    };
    if (nextPhaseWorkItem !== undefined) {
      output.nextPhaseWorkItem = nextPhaseWorkItem;
    }
    return output;
  }
}
