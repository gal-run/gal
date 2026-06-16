/**
 * Work Item Repository Interface (Port)
 *
 * Defines the contract for work item persistence.
 * Implementations are in the adapters layer (Firestore, InMemory, etc.)
 */

import { WorkItem } from '../domain/entities';
import { WorkItemStatus, Priority, SdlcPhase } from '../domain/value-objects';

export interface FindOptions {
  organizationId?: string | undefined;
  status?: WorkItemStatus | WorkItemStatus[] | undefined;
  priority?: Priority | undefined;
  sdlcPhase?: SdlcPhase | undefined;
  parentIssueId?: string | undefined;
  claimedBy?: string | undefined;
  limit?: number | undefined;
  orderBy?: 'priority' | 'createdAt' | 'updatedAt' | undefined;
  orderDirection?: 'asc' | 'desc' | undefined;
}

export interface IWorkItemRepository {
  /**
   * Save a work item (create or update)
   */
  save(workItem: WorkItem): Promise<void>;

  /**
   * Find work item by ID
   */
  findById(id: string): Promise<WorkItem | null>;

  /**
   * Find work items matching criteria
   */
  find(options: FindOptions): Promise<WorkItem[]>;

  /**
   * Find all work items for an organization
   */
  findByOrganization(organizationId: string): Promise<WorkItem[]>;

  /**
   * Find pending work items ordered by priority
   */
  findPending(organizationId: string, limit?: number): Promise<WorkItem[]>;

  /**
   * Find active (claimed/in_progress) work items
   */
  findActive(organizationId: string): Promise<WorkItem[]>;

  /**
   * Find stale work items (no heartbeat within threshold)
   */
  findStale(organizationId: string, thresholdMs: number): Promise<WorkItem[]>;

  /**
   * Find work items by parent issue ID
   */
  findByParentIssue(organizationId: string, parentIssueId: string): Promise<WorkItem[]>;

  /**
   * Find work items by source (for duplicate detection)
   */
  findBySource(
    organizationId: string,
    sourceType: string,
    sourceIdentifier: string | number
  ): Promise<WorkItem[]>;

  /**
   * Delete a work item
   */
  delete(id: string): Promise<void>;

  /**
   * Delete all work items for an organization
   */
  deleteByOrganization(organizationId: string): Promise<void>;

  /**
   * Count work items matching criteria
   */
  count(options: FindOptions): Promise<number>;

  /**
   * Atomic claim operation (prevent race conditions)
   * Returns the claimed work item if successful, null if already claimed
   */
  atomicClaim(id: string, agentId: string): Promise<WorkItem | null>;
}
