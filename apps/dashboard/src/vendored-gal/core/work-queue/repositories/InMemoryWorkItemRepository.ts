/**
 * In-Memory Work Item Repository
 *
 * Implementation of IWorkItemRepository for testing and development.
 * Stores work items in memory with no persistence.
 */

import { WorkItem } from '../domain/entities';
import { WorkItemStatus } from '../domain/value-objects';
import { IWorkItemRepository, FindOptions } from './IWorkItemRepository';

export class InMemoryWorkItemRepository implements IWorkItemRepository {
  private items: Map<string, WorkItem> = new Map();

  /**
   * Clear all items (useful for test setup)
   */
  clear(): void {
    this.items.clear();
  }

  /**
   * Get all items (useful for test assertions)
   */
  getAll(): WorkItem[] {
    return Array.from(this.items.values());
  }

  async save(workItem: WorkItem): Promise<void> {
    this.items.set(workItem.id, workItem);
  }

  async findById(id: string): Promise<WorkItem | null> {
    return this.items.get(id) ?? null;
  }

  async find(options: FindOptions): Promise<WorkItem[]> {
    let results = Array.from(this.items.values());

    // Filter by organizationId
    if (options.organizationId) {
      results = results.filter((item) => item.organizationId === options.organizationId);
    }

    // Filter by status
    if (options.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      results = results.filter((item) =>
        statuses.some((s) => item.status.equals(s))
      );
    }

    // Filter by priority
    if (options.priority) {
      results = results.filter((item) => item.priority.equals(options.priority!));
    }

    // Filter by sdlcPhase
    if (options.sdlcPhase) {
      results = results.filter(
        (item) => item.sdlcPhase && item.sdlcPhase.equals(options.sdlcPhase!)
      );
    }

    // Filter by parentIssueId
    if (options.parentIssueId) {
      results = results.filter((item) => item.parentIssueId === options.parentIssueId);
    }

    // Filter by claimedBy
    if (options.claimedBy) {
      results = results.filter((item) => item.claimedBy === options.claimedBy);
    }

    // Sort
    if (options.orderBy) {
      results.sort((a, b) => {
        let comparison = 0;
        switch (options.orderBy) {
          case 'priority':
            comparison = a.priority.compareTo(b.priority);
            break;
          case 'createdAt':
            comparison = a.createdAt.getTime() - b.createdAt.getTime();
            break;
          case 'updatedAt':
            comparison = a.updatedAt.getTime() - b.updatedAt.getTime();
            break;
        }
        return options.orderDirection === 'desc' ? -comparison : comparison;
      });
    }

    // Limit
    if (options.limit) {
      results = results.slice(0, options.limit);
    }

    return results;
  }

  async findByOrganization(organizationId: string): Promise<WorkItem[]> {
    return this.find({ organizationId });
  }

  async findPending(organizationId: string, limit?: number): Promise<WorkItem[]> {
    const options: FindOptions = {
      organizationId,
      status: WorkItemStatus.PENDING,
      orderBy: 'priority',
      orderDirection: 'asc', // Lower priority number = higher priority
    };
    if (limit !== undefined) {
      options.limit = limit;
    }
    return this.find(options);
  }

  async findActive(organizationId: string): Promise<WorkItem[]> {
    return this.find({
      organizationId,
      status: [WorkItemStatus.CLAIMED, WorkItemStatus.IN_PROGRESS],
    });
  }

  async findStale(organizationId: string, thresholdMs: number): Promise<WorkItem[]> {
    const now = new Date();
    const activeItems = await this.findActive(organizationId);

    return activeItems.filter((item) => {
      const lastActivity = item.lastHeartbeatAt ?? item.claimedAt;
      if (!lastActivity) return false;
      return now.getTime() - lastActivity.getTime() >= thresholdMs;
    });
  }

  async findByParentIssue(organizationId: string, parentIssueId: string): Promise<WorkItem[]> {
    return this.find({ organizationId, parentIssueId });
  }

  async findBySource(
    organizationId: string,
    sourceType: string,
    sourceIdentifier: string | number
  ): Promise<WorkItem[]> {
    return Array.from(this.items.values()).filter((item) => {
      if (item.organizationId !== organizationId) return false;
      if (item.source.getType() !== sourceType) return false;

      if (sourceType === 'github_issue') {
        return item.source.getIssueNumber() === sourceIdentifier;
      }
      if (sourceType === 'github_pr') {
        return item.source.getPrNumber() === sourceIdentifier;
      }
      return false;
    });
  }

  async delete(id: string): Promise<void> {
    this.items.delete(id);
  }

  async deleteByOrganization(organizationId: string): Promise<void> {
    for (const [id, item] of this.items.entries()) {
      if (item.organizationId === organizationId) {
        this.items.delete(id);
      }
    }
  }

  async count(options: FindOptions): Promise<number> {
    const results = await this.find(options);
    return results.length;
  }

  async atomicClaim(id: string, agentId: string): Promise<WorkItem | null> {
    const workItem = this.items.get(id);
    if (!workItem) return null;

    // Check if already claimed
    if (!workItem.status.canBeClaimed()) {
      return null;
    }

    // Claim the item
    const claimResult = workItem.claim(agentId);
    if (!claimResult.success) {
      return null;
    }

    // Save and return
    this.items.set(id, claimResult.workItem);
    return claimResult.workItem;
  }
}
