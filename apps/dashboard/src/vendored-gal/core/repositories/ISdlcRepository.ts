import type { WorkItem } from '@gal/types'

/**
 * SDLC Repository Interface (Issue #921)
 *
 * Repository for managing SDLC phase tracking and orchestration.
 * Works with GitHub labels and work items to track issue progress
 * through the 7-phase SDLC workflow.
 *
 * SDLC Phases:
 * 1. Specify - Create specification
 * 2. Design - Create design and plan
 * 3. Test - Write failing tests
 * 4. Implement - Implement to pass tests
 * 5. Deploy-Verify - Deploy preview and manual testing
 * 6. Review - Code review and CI checks
 * 7. Merge - Approve, merge, and cleanup
 *
 * Implementations: FirestoreSdlcRepository (API)
 */
export interface ISdlcRepository {
  // ─────────────────────────────────────────────────────────────────
  // Phase Tracking
  // ─────────────────────────────────────────────────────────────────

  /**
   * Start a new SDLC phase for an issue
   * Updates GitHub label to stage:N-* and creates work item
   *
   * @param params - Phase start parameters
   * @returns Work item created for this phase
   */
  startPhase(params: {
    issueNumber: number
    phase: number
    orgId: string
    owner: string
    repo: string
    agentId?: string
    command?: string
  }): Promise<WorkItem>

  /**
   * Complete current SDLC phase and transition to next
   * Updates GitHub labels and creates next phase work item
   *
   * @param params - Phase completion parameters
   * @returns Work item for next phase, or null if final phase
   */
  completePhase(params: {
    issueNumber: number
    phase: number
    orgId: string
    owner: string
    repo: string
    agentId?: string
    result?: {
      message?: string
      details?: Record<string, unknown>
    }
  }): Promise<WorkItem | null>

  /**
   * Get current SDLC status for an issue
   * Returns completed phases, current phase, and phase history
   *
   * @param params - Status query parameters
   * @returns SDLC status with phase history
   */
  getPhaseStatus(params: {
    issueNumber: number
    orgId: string
  }): Promise<{
    issueNumber: number
    completedPhases: number[]
    currentPhase?: number
    phaseHistory: Array<{
      sdlcPhase: number
      status: string
      startedAt?: Date
      completedAt?: Date
      agentId?: string
    }>
  }>

  // ─────────────────────────────────────────────────────────────────
  // Issue Tracking
  // ─────────────────────────────────────────────────────────────────

  /**
   * List all active SDLC issues for an organization
   * Active = has at least one work item in pending/claimed/in_progress status
   *
   * @param orgId - Organization ID
   * @returns List of active issue numbers with their current phases
   */
  listActiveIssues(
    orgId: string
  ): Promise<
    Array<{
      issueNumber: number
      currentPhase?: number
      repository: string
    }>
  >

  /**
   * Get phase history for an issue
   * Returns all work items associated with the issue, ordered by phase
   *
   * @param issueNumber - GitHub issue number
   * @param orgId - Organization ID
   * @returns Phase history with work items
   */
  getIssueHistory(
    issueNumber: number,
    orgId: string
  ): Promise<
    Array<{
      phase: number
      workItemId: string
      status: string
      startedAt?: Date
      completedAt?: Date
      agentId?: string
      result?: {
        success: boolean
        message?: string
      }
    }>
  >

  // ─────────────────────────────────────────────────────────────────
  // GitHub Label Management
  // ─────────────────────────────────────────────────────────────────

  /**
   * Update GitHub issue label to reflect current phase
   * Removes old stage:* labels and adds new one
   *
   * @param params - Label update parameters
   */
  updatePhaseLabel(params: {
    issueNumber: number
    phase: number
    owner: string
    repo: string
  }): Promise<void>

  /**
   * Get phase label name for a given phase number
   * Maps phase 1-7 to stage:N-name labels
   *
   * @param phase - Phase number (1-7)
   * @returns Label name (e.g., "stage:3-test")
   */
  getPhaseLabel(phase: number): string
}
