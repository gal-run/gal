import type {
  WorkItem,
  WorkItemPriority,
  WorkItemStatus,
  ClaimWorkItemResponse,
} from '@gal/types'

/**
 * Work Item Repository Interface (SAL-1)
 *
 * Repository for managing work items in the job queue.
 * Implementations: FirestoreWorkItemRepository (API)
 */
export interface IWorkItemRepository {
  // ─────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────

  /**
   * Find work item by ID
   */
  findById(id: string): Promise<WorkItem | null>

  /**
   * Find all work items for an organization
   */
  findByOrganization(
    organizationId: string,
    options?: {
      status?: WorkItemStatus
      priority?: WorkItemPriority
      limit?: number
    }
  ): Promise<WorkItem[]>

  /**
   * Find pending work items ordered by priority (P0 first, then FIFO within priority)
   */
  findPendingByPriority(
    organizationId: string,
    limit?: number
  ): Promise<WorkItem[]>

  /**
   * Find claimed items that haven't sent heartbeat within timeout (stale detection)
   */
  findStaleClaimedItems(
    heartbeatTimeoutMs: number,
    limit?: number
  ): Promise<WorkItem[]>

  /**
   * Find all work items for a parent issue (SDLC orchestration)
   */
  findByParentIssue(
    organizationId: string,
    parentIssueId: string
  ): Promise<WorkItem[]>

  /**
   * Count work items for an organization matching optional status/priority filters.
   * Used by queue telemetry so callers do not have to scan pending items just to measure depth.
   */
  count(options: {
    organizationId: string
    status?: WorkItemStatus | WorkItemStatus[]
    priority?: WorkItemPriority
    limit?: number
  }): Promise<number>

  // ─────────────────────────────────────────────────────────────────
  // Commands
  // ─────────────────────────────────────────────────────────────────

  /**
   * Create a new work item
   */
  create(workItem: WorkItem): Promise<void>

  /**
   * Update an existing work item
   */
  update(workItem: WorkItem): Promise<void>

  /**
   * Update work item status
   */
  updateStatus(id: string, status: WorkItemStatus): Promise<void>

  /**
   * Delete a work item
   */
  delete(id: string): Promise<void>

  /**
   * Atomically cancel (delete) a pending work item.
   * Returns status when not pending for conflict handling.
   */
  cancelPending(
    workItemId: string
  ): Promise<{ success: boolean; status?: WorkItemStatus; message?: string }>

  // ─────────────────────────────────────────────────────────────────
  // Atomic Operations
  // ─────────────────────────────────────────────────────────────────

  /**
   * Atomically claim a work item (prevents double-claim)
   *
   * This must be implemented using a transaction to ensure
   * only one agent can claim a pending work item.
   *
   * @param workItemId - Work item to claim
   * @param agentId - ID of agent claiming the work
   * @returns Response indicating success/failure
   */
  claim(workItemId: string, agentId: string): Promise<ClaimWorkItemResponse>

  /**
   * Release a claimed work item back to pending state
   */
  release(workItemId: string): Promise<void>

  /**
   * Update heartbeat timestamp for a claimed work item
   */
  heartbeat(workItemId: string, agentId: string): Promise<void>
}
