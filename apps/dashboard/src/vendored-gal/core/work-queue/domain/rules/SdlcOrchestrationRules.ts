/**
 * SDLC Orchestration Rules
 *
 * Pure business logic for SDLC phase progression.
 * Handles auto-creation of next phase work items.
 */

import { SdlcPhase, WorkItemStatus, Priority, WorkItemSource } from '../value-objects';

export interface PhaseCompletionContext {
  currentPhase: SdlcPhase;
  parentIssueId: string;
  organizationId: string;
  source: WorkItemSource;
  priority: Priority;
}

export interface NextPhaseWorkItem {
  organizationId: string;
  priority: Priority;
  type: 'sdlc_task';
  source: WorkItemSource;
  command: string;
  sdlcPhase: SdlcPhase;
  parentIssueId: string;
}

/**
 * Determine if next phase should be auto-created
 */
export function shouldCreateNextPhase(
  currentPhase: SdlcPhase,
  completionStatus: WorkItemStatus
): boolean {
  // Only create next phase on successful completion
  if (!completionStatus.equals(WorkItemStatus.COMPLETED)) {
    return false;
  }

  // No next phase after deploy
  if (currentPhase.isLast()) {
    return false;
  }

  return true;
}

/**
 * Create next phase work item data
 */
export function createNextPhaseWorkItem(
  context: PhaseCompletionContext
): NextPhaseWorkItem | null {
  const nextPhase = context.currentPhase.next();

  if (!nextPhase) {
    return null;
  }

  const command = nextPhase.getCommand() + ' ' + context.parentIssueId;

  return {
    organizationId: context.organizationId,
    priority: context.priority,
    type: 'sdlc_task',
    source: context.source,
    command,
    sdlcPhase: nextPhase,
    parentIssueId: context.parentIssueId,
  };
}

/**
 * Calculate SDLC progress status from work items
 */
export function calculateSdlcProgress(
  workItems: Array<{ sdlcPhase?: number | undefined; status: string }>
): {
  status: 'not_started' | 'in_progress' | 'completed' | 'failed';
  currentPhase: number | null;
  completedPhases: number[];
  failedPhases: number[];
} {
  if (workItems.length === 0) {
    return {
      status: 'not_started',
      currentPhase: null,
      completedPhases: [],
      failedPhases: [],
    };
  }

  const completedPhases: number[] = [];
  const failedPhases: number[] = [];
  let currentPhase: number | null = null;
  let hasInProgress = false;

  for (const item of workItems) {
    if (!item.sdlcPhase) continue;

    const status = WorkItemStatus.fromString(item.status);

    if (status.equals(WorkItemStatus.COMPLETED)) {
      completedPhases.push(item.sdlcPhase);
    } else if (status.equals(WorkItemStatus.FAILED)) {
      failedPhases.push(item.sdlcPhase);
    } else if (status.isActive()) {
      hasInProgress = true;
      currentPhase = item.sdlcPhase;
    } else if (status.equals(WorkItemStatus.PENDING)) {
      if (currentPhase === null) {
        currentPhase = item.sdlcPhase;
      }
    }
  }

  // Determine overall status
  let status: 'not_started' | 'in_progress' | 'completed' | 'failed';

  if (failedPhases.length > 0 && !hasInProgress) {
    status = 'failed';
  } else if (completedPhases.includes(7)) {
    status = 'completed';
  } else if (hasInProgress || completedPhases.length > 0 || currentPhase !== null) {
    status = 'in_progress';
  } else {
    status = 'not_started';
  }

  return {
    status,
    currentPhase,
    completedPhases: [...new Set(completedPhases)].sort(),
    failedPhases: [...new Set(failedPhases)].sort(),
  };
}

/**
 * Get the command to start SDLC for an issue
 */
export function getStartSdlcCommand(issueNumber: number | string): string {
  return SdlcPhase.SPECIFY.getCommand() + ' ' + issueNumber;
}

/**
 * Check if all phases are complete
 */
export function isSdlcComplete(completedPhases: number[]): boolean {
  return completedPhases.includes(7);
}

/**
 * Get phases that still need to be done
 */
export function getRemainingPhases(completedPhases: number[]): SdlcPhase[] {
  return SdlcPhase.all().filter(
    (phase) => !completedPhases.includes(phase.toNumber())
  );
}
