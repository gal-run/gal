/**
 * Legacy Work Item Repository Interface
 *
 * Uses @gal/types plain data interfaces for API backward compatibility.
 * The SAL Clean Architecture uses IWorkItemRepository with domain entities.
 *
 * This interface is for adapters that work with plain data types:
 * - FirestoreWorkItemRepository (API)
 * - InMemoryWorkItemRepository (testing)
 */

import type {
  WorkItem,
  WorkItemPriority,
  WorkItemStatus,
  ClaimWorkItemResponse,
} from '@gal/types';

export interface LegacyFindOptions {
  status?: WorkItemStatus | undefined;
  priority?: WorkItemPriority | undefined;
  limit?: number | undefined;
}

export interface ILegacyWorkItemRepository {
  /**
   * Find all work items (limited)
   */
  findAll(limit?: number): Promise<WorkItem[]>;

  /**
   * Find work item by ID
   */
  findById(id: string): Promise<WorkItem | null>;

  /**
   * Find work items by organization
   */
  findByOrganization(
    organizationId: string,
    options?: LegacyFindOptions
  ): Promise<WorkItem[]>;

  /**
   * Find pending work items ordered by priority
   */
  findPendingByPriority(organizationId: string, limit?: number): Promise<WorkItem[]>;

  /**
   * Find stale claimed items (no heartbeat within threshold)
   */
  findStaleClaimedItems(heartbeatTimeoutMs: number, limit?: number): Promise<WorkItem[]>;

  /**
   * Create a new work item
   */
  create(workItem: WorkItem): Promise<void>;

  /**
   * Update an existing work item
   */
  update(workItem: WorkItem): Promise<void>;

  /**
   * Update work item status
   */
  updateStatus(id: string, status: WorkItemStatus): Promise<void>;

  /**
   * Delete a work item
   */
  delete(id: string): Promise<void>;

  /**
   * Atomically claim a work item
   */
  claim(workItemId: string, agentId: string): Promise<ClaimWorkItemResponse>;

  /**
   * Release a claimed work item back to pending
   */
  release(workItemId: string): Promise<void>;

  /**
   * Update heartbeat timestamp
   */
  heartbeat(workItemId: string, agentId: string): Promise<void>;
}
