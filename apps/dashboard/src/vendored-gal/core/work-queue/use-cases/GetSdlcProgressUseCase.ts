/**
 * Get SDLC Progress Use Case
 *
 * Application logic for calculating SDLC progress for an issue.
 */

import { WorkItem } from '../domain/entities';
import { calculateSdlcProgress } from '../domain/rules/SdlcOrchestrationRules';
import { IWorkItemRepository } from '../repositories';

export interface GetSdlcProgressInput {
  organizationId: string;
  parentIssueId: string;
}

export interface SdlcProgressOutput {
  parentIssueId: string;
  status: 'not_started' | 'in_progress' | 'completed' | 'failed';
  currentPhase: number | null;
  completedPhases: number[];
  failedPhases: number[];
  workItems: WorkItem[];
}

export class GetSdlcProgressUseCase {
  constructor(private readonly repository: IWorkItemRepository) {}

  async execute(input: GetSdlcProgressInput): Promise<SdlcProgressOutput> {
    // Find all work items for this issue
    const workItems = await this.repository.findByParentIssue(
      input.organizationId,
      input.parentIssueId
    );

    // Calculate progress
    const progress = calculateSdlcProgress(
      workItems.map((item) => ({
        sdlcPhase: item.sdlcPhase?.toNumber(),
        status: item.status.toString(),
      }))
    );

    return {
      parentIssueId: input.parentIssueId,
      ...progress,
      workItems,
    };
  }
}
