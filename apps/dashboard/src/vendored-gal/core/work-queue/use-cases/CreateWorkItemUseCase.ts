/**
 * Create Work Item Use Case
 *
 * Application logic for creating new work items.
 * Handles duplicate detection and validation.
 */

import { WorkItem } from '../domain/entities';
import { WorkItemSource, SdlcPhase, SourceData } from '../domain/value-objects';
import { canCreateWorkItem } from '../domain/rules/DuplicateDetectionRules';
import { IWorkItemRepository } from '../repositories';

export interface CreateWorkItemInput {
  organizationId: string;
  priority: number;
  type: string;
  source: SourceData;
  command: string;
  context?: string | undefined;
  sdlcPhase?: number | undefined;
  parentIssueId?: string | undefined;
  maxRetries?: number | undefined;
}

export interface CreateWorkItemOutput {
  success: boolean;
  workItem?: WorkItem | undefined;
  error?: string | undefined;
  existingItemId?: string | undefined;
}

export class CreateWorkItemUseCase {
  constructor(private readonly repository: IWorkItemRepository) {}

  async execute(input: CreateWorkItemInput): Promise<CreateWorkItemOutput> {
    // Validate organization
    if (!input.organizationId) {
      return { success: false, error: 'Organization ID is required' };
    }

    // Build source value object
    const source = WorkItemSource.fromObject(input.source);

    // Check for duplicates
    const existingItems = await this.findPotentialDuplicates(input);
    const duplicateCheck = canCreateWorkItem(
      {
        organizationId: input.organizationId,
        source,
        sdlcPhase: input.sdlcPhase ? SdlcPhase.fromNumber(input.sdlcPhase) : undefined,
        command: input.command,
      },
      existingItems.map((item) => ({
        id: item.id,
        organizationId: item.organizationId,
        source: item.source.toObject(),
        sdlcPhase: item.sdlcPhase?.toNumber(),
        command: item.command,
        status: item.status.toString(),
      }))
    );

    if (!duplicateCheck.canCreate) {
      const output: CreateWorkItemOutput = { success: false };
      if (duplicateCheck.reason !== undefined) output.error = duplicateCheck.reason;
      if (duplicateCheck.existingItemId !== undefined) output.existingItemId = duplicateCheck.existingItemId;
      return output;
    }

    // Generate ID
    const id = this.generateId(input);

    // Create work item
    const workItem = WorkItem.create({
      id,
      organizationId: input.organizationId,
      priority: input.priority,
      type: input.type,
      source: input.source,
      command: input.command,
      context: input.context,
      sdlcPhase: input.sdlcPhase,
      parentIssueId: input.parentIssueId,
      maxRetries: input.maxRetries,
    });

    // Persist
    await this.repository.save(workItem);

    return { success: true, workItem };
  }

  private async findPotentialDuplicates(input: CreateWorkItemInput): Promise<WorkItem[]> {
    if (input.source.type === 'github_issue' && input.source.issueNumber) {
      return this.repository.findBySource(
        input.organizationId,
        'github_issue',
        input.source.issueNumber
      );
    }

    if (input.source.type === 'github_pr' && input.source.prNumber) {
      return this.repository.findBySource(
        input.organizationId,
        'github_pr',
        input.source.prNumber
      );
    }

    return [];
  }

  private generateId(input: CreateWorkItemInput): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    // Include sdlcPhase in ID to differentiate phases for the same source
    const phaseSuffix = input.sdlcPhase ? `_p${input.sdlcPhase}` : '';

    if (input.source.issueNumber) {
      return `wi_${input.organizationId}_issue${input.source.issueNumber}${phaseSuffix}_${timestamp}`;
    }
    if (input.source.prNumber) {
      return `wi_${input.organizationId}_pr${input.source.prNumber}${phaseSuffix}_${timestamp}`;
    }
    return `wi_${input.organizationId}_${random}_${timestamp}`;
  }
}
