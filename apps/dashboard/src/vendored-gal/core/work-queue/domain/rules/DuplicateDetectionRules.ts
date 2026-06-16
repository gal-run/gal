/**
 * Duplicate Detection Rules
 *
 * Pure business logic for detecting duplicate work items.
 * Prevents creating redundant work for the same issue/command/phase.
 */

import { WorkItemSource, SdlcPhase, WorkItemStatus } from '../value-objects';

export interface DuplicateCheckCriteria {
  organizationId: string;
  source: WorkItemSource;
  sdlcPhase?: SdlcPhase | undefined;
  command?: string | undefined;
}

export interface ExistingWorkItem {
  id: string;
  organizationId: string;
  source: {
    type: string;
    repository?: string | undefined;
    issueNumber?: number | undefined;
    prNumber?: number | undefined;
  };
  sdlcPhase?: number | undefined;
  command: string;
  status: string;
}

/**
 * Check if a work item would be a duplicate of existing items
 */
export function isDuplicate(
  criteria: DuplicateCheckCriteria,
  existingItems: ExistingWorkItem[]
): { isDuplicate: boolean; existingItemId?: string | undefined; reason?: string | undefined } {
  for (const existing of existingItems) {
    // Must be same organization
    if (existing.organizationId !== criteria.organizationId) {
      continue;
    }

    // Check if same source
    if (!isSameSource(criteria.source, existing.source)) {
      continue;
    }

    // For SDLC tasks, check phase
    if (criteria.sdlcPhase && existing.sdlcPhase) {
      if (criteria.sdlcPhase.toNumber() === existing.sdlcPhase) {
        // Same source, same phase - check if still active
        const status = WorkItemStatus.fromString(existing.status);
        if (!status.isTerminal()) {
          return {
            isDuplicate: true,
            existingItemId: existing.id,
            reason: `Active work item exists for same source and SDLC phase ${criteria.sdlcPhase.toNumber()}`,
          };
        }
      }
    }

    // For non-SDLC, check command similarity
    if (!criteria.sdlcPhase && criteria.command) {
      if (existing.command === criteria.command) {
        const status = WorkItemStatus.fromString(existing.status);
        if (!status.isTerminal()) {
          return {
            isDuplicate: true,
            existingItemId: existing.id,
            reason: `Active work item exists with same command: ${criteria.command}`,
          };
        }
      }
    }
  }

  return { isDuplicate: false };
}

/**
 * Check if two sources refer to the same entity
 */
function isSameSource(
  source: WorkItemSource,
  existing: { type: string; repository?: string | undefined; issueNumber?: number | undefined; prNumber?: number | undefined }
): boolean {
  if (source.getType() !== existing.type) {
    return false;
  }

  if (source.isGitHubIssue()) {
    return (
      source.getRepository() === existing.repository &&
      source.getIssueNumber() === existing.issueNumber
    );
  }

  if (source.isGitHubPR()) {
    return (
      source.getRepository() === existing.repository &&
      source.getPrNumber() === existing.prNumber
    );
  }

  // Manual sources are never duplicates of each other
  return false;
}

/**
 * Generate a unique key for duplicate detection
 */
export function generateDuplicateKey(
  organizationId: string,
  source: WorkItemSource,
  sdlcPhase?: SdlcPhase
): string {
  const sourceKey = source.toUniqueKey();
  const phaseKey = sdlcPhase ? `:phase${sdlcPhase.toNumber()}` : '';
  return `${organizationId}:${sourceKey}${phaseKey}`;
}

/**
 * Check if work item can be created (not a duplicate)
 */
export function canCreateWorkItem(
  criteria: DuplicateCheckCriteria,
  existingItems: ExistingWorkItem[]
): { canCreate: boolean; reason?: string | undefined; existingItemId?: string | undefined } {
  const result = isDuplicate(criteria, existingItems);

  if (result.isDuplicate) {
    const returnValue: { canCreate: boolean; reason?: string | undefined; existingItemId?: string | undefined } = {
      canCreate: false,
    };
    if (result.reason !== undefined) returnValue.reason = result.reason;
    if (result.existingItemId !== undefined) returnValue.existingItemId = result.existingItemId;
    return returnValue;
  }

  return { canCreate: true };
}
