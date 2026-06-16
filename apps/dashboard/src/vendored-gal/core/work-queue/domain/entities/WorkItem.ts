/**
 * WorkItem Entity
 *
 * Rich domain entity with behavior. Encapsulates all work item business logic.
 * Immutable - all mutations return new instances.
 */

import {
  Priority,
  WorkItemStatus,
  SdlcPhase,
  SdlcLifecycleState,
  SdlcLifecycleStateValue,
  BlockerReason,
  BlockerReasonData,
  WorkItemSource,
  WorkItemType,
  PriorityLevel,
  StatusValue,
  SourceData,
} from '../value-objects';
import {
  canClaim,
  canStart,
  canComplete,
  canFail,
  canRelease,
  canRetry,
} from '../rules/StateTransitionRules';
import { isStale, DEFAULT_STALE_THRESHOLD_MS, StaleCheckContext } from '../rules/StaleDetectionRules';

export interface WorkItemResult {
  success: boolean;
  message?: string | undefined;
  details?: Record<string, unknown> | undefined;
}

export interface WorkItemProps {
  id: string;
  organizationId: string;
  priority: Priority;
  status: WorkItemStatus;
  type: WorkItemType;
  source: WorkItemSource;
  command: string;
  context?: string | undefined;
  sdlcPhase?: SdlcPhase | undefined;
  sdlcLifecycleState?: SdlcLifecycleState | undefined;
  blockerReason?: BlockerReason | undefined;
  branchName?: string | undefined;
  issueNumber?: string | undefined;
  prNumber?: string | undefined;
  parentIssueId?: string | undefined;
  claimedBy?: string | undefined;
  claimedAt?: Date | undefined;
  lastHeartbeatAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date | undefined;
  completedAt?: Date | undefined;
  result?: WorkItemResult | undefined;
  retryCount: number;
  maxRetries: number;
}

/**
 * Data for creating a new work item
 */
export interface CreateWorkItemData {
  id: string;
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

/**
 * Plain object representation for serialization
 */
export interface WorkItemData {
  id: string;
  organizationId: string;
  priority: PriorityLevel;
  status: StatusValue;
  type: string;
  source: SourceData;
  command: string;
  context?: string | undefined;
  sdlcPhase?: number | undefined;
  sdlcLifecycleState?: SdlcLifecycleStateValue | undefined;
  blockerReason?: BlockerReasonData | undefined;
  branchName?: string | undefined;
  issueNumber?: string | undefined;
  prNumber?: string | undefined;
  parentIssueId?: string | undefined;
  claimedBy?: string | undefined;
  claimedAt?: Date | undefined;
  lastHeartbeatAt?: Date | undefined;
  createdAt: Date;
  updatedAt: Date;
  startedAt?: Date | undefined;
  completedAt?: Date | undefined;
  result?: WorkItemResult | undefined;
  retryCount: number;
  maxRetries: number;
}

export class WorkItem {
  private constructor(private readonly props: WorkItemProps) {}

  /**
   * Create a new work item
   */
  static create(data: CreateWorkItemData): WorkItem {
    const now = new Date();

    const props: WorkItemProps = {
      id: data.id,
      organizationId: data.organizationId,
      priority: Priority.fromNumber(data.priority),
      status: WorkItemStatus.PENDING,
      type: WorkItemType.fromString(data.type),
      source: WorkItemSource.fromObject(data.source),
      command: data.command,
      createdAt: now,
      updatedAt: now,
      retryCount: 0,
      maxRetries: data.maxRetries ?? 3,
    };

    if (data.context !== undefined) {
      props.context = data.context;
    }
    if (data.sdlcPhase !== undefined) {
      props.sdlcPhase = SdlcPhase.fromNumber(data.sdlcPhase);
    }
    if (data.parentIssueId !== undefined) {
      props.parentIssueId = data.parentIssueId;
    }

    return new WorkItem(props);
  }

  /**
   * Reconstitute from plain object (for deserialization)
   */
  static fromData(data: WorkItemData): WorkItem {
    const props: WorkItemProps = {
      id: data.id,
      organizationId: data.organizationId,
      priority: Priority.fromNumber(data.priority),
      status: WorkItemStatus.fromString(data.status),
      type: WorkItemType.fromString(data.type),
      source: WorkItemSource.fromObject(data.source),
      command: data.command,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      retryCount: data.retryCount,
      maxRetries: data.maxRetries,
    };

    if (data.context !== undefined) props.context = data.context;
    if (data.sdlcPhase !== undefined) props.sdlcPhase = SdlcPhase.fromNumber(data.sdlcPhase);
    if (data.sdlcLifecycleState !== undefined) props.sdlcLifecycleState = SdlcLifecycleState.fromString(data.sdlcLifecycleState);
    if (data.blockerReason !== undefined) props.blockerReason = BlockerReason.fromData(data.blockerReason);
    if (data.branchName !== undefined) props.branchName = data.branchName;
    if (data.issueNumber !== undefined) props.issueNumber = data.issueNumber;
    if (data.prNumber !== undefined) props.prNumber = data.prNumber;
    if (data.parentIssueId !== undefined) props.parentIssueId = data.parentIssueId;
    if (data.claimedBy !== undefined) props.claimedBy = data.claimedBy;
    if (data.claimedAt !== undefined) props.claimedAt = data.claimedAt;
    if (data.lastHeartbeatAt !== undefined) props.lastHeartbeatAt = data.lastHeartbeatAt;
    if (data.startedAt !== undefined) props.startedAt = data.startedAt;
    if (data.completedAt !== undefined) props.completedAt = data.completedAt;
    if (data.result !== undefined) props.result = data.result;

    return new WorkItem(props);
  }

  // Getters
  get id(): string {
    return this.props.id;
  }

  get organizationId(): string {
    return this.props.organizationId;
  }

  get priority(): Priority {
    return this.props.priority;
  }

  get status(): WorkItemStatus {
    return this.props.status;
  }

  get type(): WorkItemType {
    return this.props.type;
  }

  get source(): WorkItemSource {
    return this.props.source;
  }

  get command(): string {
    return this.props.command;
  }

  get context(): string | undefined {
    return this.props.context;
  }

  get sdlcPhase(): SdlcPhase | undefined {
    return this.props.sdlcPhase;
  }

  get sdlcLifecycleState(): SdlcLifecycleState | undefined {
    return this.props.sdlcLifecycleState;
  }

  get blockerReason(): BlockerReason | undefined {
    return this.props.blockerReason;
  }

  get branchName(): string | undefined {
    return this.props.branchName;
  }

  get issueNumber(): string | undefined {
    return this.props.issueNumber;
  }

  get prNumber(): string | undefined {
    return this.props.prNumber;
  }

  get parentIssueId(): string | undefined {
    return this.props.parentIssueId;
  }

  get claimedBy(): string | undefined {
    return this.props.claimedBy;
  }

  get claimedAt(): Date | undefined {
    return this.props.claimedAt;
  }

  get lastHeartbeatAt(): Date | undefined {
    return this.props.lastHeartbeatAt;
  }

  get createdAt(): Date {
    return this.props.createdAt;
  }

  get updatedAt(): Date {
    return this.props.updatedAt;
  }

  get startedAt(): Date | undefined {
    return this.props.startedAt;
  }

  get completedAt(): Date | undefined {
    return this.props.completedAt;
  }

  get result(): WorkItemResult | undefined {
    return this.props.result;
  }

  get retryCount(): number {
    return this.props.retryCount;
  }

  get maxRetries(): number {
    return this.props.maxRetries;
  }

  /**
   * Check if item is SDLC task
   */
  isSdlcTask(): boolean {
    return this.props.type.isSdlc() && this.props.sdlcPhase !== undefined;
  }

  /**
   * Check if item is stale (no heartbeat)
   */
  isStale(now: Date = new Date(), thresholdMs: number = DEFAULT_STALE_THRESHOLD_MS): boolean {
    const context: StaleCheckContext = {
      status: this.props.status,
      now,
    };
    if (this.props.claimedAt) {
      context.claimedAt = this.props.claimedAt;
    }
    if (this.props.lastHeartbeatAt) {
      context.lastHeartbeatAt = this.props.lastHeartbeatAt;
    }
    return isStale(context, thresholdMs).isStale;
  }

  /**
   * Claim this work item
   */
  claim(agentId: string): { success: true; workItem: WorkItem } | { success: false; error: string } {
    const result = canClaim(this.props.status);
    if (!result.allowed) {
      return { success: false, error: result.reason! };
    }

    const now = new Date();
    const newProps: WorkItemProps = {
      ...this.props,
      status: WorkItemStatus.CLAIMED,
      claimedBy: agentId,
      claimedAt: now,
      lastHeartbeatAt: now,
      updatedAt: now,
    };

    return {
      success: true,
      workItem: new WorkItem(newProps),
    };
  }

  /**
   * Start working on this item
   */
  start(): { success: true; workItem: WorkItem } | { success: false; error: string } {
    const result = canStart(this.props.status);
    if (!result.allowed) {
      return { success: false, error: result.reason! };
    }

    const now = new Date();
    const newProps: WorkItemProps = {
      ...this.props,
      status: WorkItemStatus.IN_PROGRESS,
      startedAt: now,
      lastHeartbeatAt: now,
      updatedAt: now,
    };

    return {
      success: true,
      workItem: new WorkItem(newProps),
    };
  }

  /**
   * Complete this work item
   */
  complete(
    resultData?: WorkItemResult
  ): { success: true; workItem: WorkItem } | { success: false; error: string } {
    const result = canComplete(this.props.status);
    if (!result.allowed) {
      return { success: false, error: result.reason! };
    }

    const now = new Date();
    const newProps: WorkItemProps = {
      ...this.props,
      status: WorkItemStatus.COMPLETED,
      completedAt: now,
      updatedAt: now,
      result: resultData ?? { success: true },
    };

    return {
      success: true,
      workItem: new WorkItem(newProps),
    };
  }

  /**
   * Fail this work item
   */
  fail(
    errorMessage?: string
  ): { success: true; workItem: WorkItem } | { success: false; error: string } {
    const result = canFail(this.props.status);
    if (!result.allowed) {
      return { success: false, error: result.reason! };
    }

    const now = new Date();
    const failResult: WorkItemResult = { success: false };
    if (errorMessage !== undefined) {
      failResult.message = errorMessage;
    }

    const newProps: WorkItemProps = {
      ...this.props,
      status: WorkItemStatus.FAILED,
      completedAt: now,
      updatedAt: now,
      result: failResult,
    };

    return {
      success: true,
      workItem: new WorkItem(newProps),
    };
  }

  /**
   * Release this work item back to pending
   */
  release(): { success: true; workItem: WorkItem } | { success: false; error: string } {
    const result = canRelease(this.props.status);
    if (!result.allowed) {
      return { success: false, error: result.reason! };
    }

    const now = new Date();
    // Create new props without the optional fields
    const newProps: WorkItemProps = {
      id: this.props.id,
      organizationId: this.props.organizationId,
      priority: this.props.priority,
      status: WorkItemStatus.PENDING,
      type: this.props.type,
      source: this.props.source,
      command: this.props.command,
      createdAt: this.props.createdAt,
      updatedAt: now,
      retryCount: this.props.retryCount,
      maxRetries: this.props.maxRetries,
    };

    // Copy optional fields that should be preserved
    if (this.props.context !== undefined) newProps.context = this.props.context;
    if (this.props.sdlcPhase !== undefined) newProps.sdlcPhase = this.props.sdlcPhase;
    if (this.props.parentIssueId !== undefined) newProps.parentIssueId = this.props.parentIssueId;

    return {
      success: true,
      workItem: new WorkItem(newProps),
    };
  }

  /**
   * Retry this failed work item
   */
  retry(): { success: true; workItem: WorkItem } | { success: false; error: string } {
    const result = canRetry(this.props.status, this.props.retryCount, this.props.maxRetries);
    if (!result.allowed) {
      return { success: false, error: result.reason! };
    }

    const now = new Date();
    // Create new props without the optional fields that should be cleared
    const newProps: WorkItemProps = {
      id: this.props.id,
      organizationId: this.props.organizationId,
      priority: this.props.priority,
      status: WorkItemStatus.PENDING,
      type: this.props.type,
      source: this.props.source,
      command: this.props.command,
      createdAt: this.props.createdAt,
      updatedAt: now,
      retryCount: this.props.retryCount + 1,
      maxRetries: this.props.maxRetries,
    };

    // Copy optional fields that should be preserved
    if (this.props.context !== undefined) newProps.context = this.props.context;
    if (this.props.sdlcPhase !== undefined) newProps.sdlcPhase = this.props.sdlcPhase;
    if (this.props.parentIssueId !== undefined) newProps.parentIssueId = this.props.parentIssueId;

    return {
      success: true,
      workItem: new WorkItem(newProps),
    };
  }

  /**
   * Update heartbeat
   */
  heartbeat(): WorkItem {
    const now = new Date();
    const newProps: WorkItemProps = {
      ...this.props,
      lastHeartbeatAt: now,
      updatedAt: now,
    };
    return new WorkItem(newProps);
  }

  /**
   * Update priority
   */
  updatePriority(newPriority: Priority): WorkItem {
    const newProps: WorkItemProps = {
      ...this.props,
      priority: newPriority,
      updatedAt: new Date(),
    };
    return new WorkItem(newProps);
  }

  /**
   * Update SDLC lifecycle state
   */
  updateLifecycleState(
    newState: SdlcLifecycleState
  ): { success: true; workItem: WorkItem } | { success: false; error: string } {
    // Validate transition if current state exists
    if (this.props.sdlcLifecycleState && !this.props.sdlcLifecycleState.canTransitionTo(newState)) {
      return {
        success: false,
        error: `Cannot transition from ${this.props.sdlcLifecycleState.toString()} to ${newState.toString()}`,
      };
    }

    const newProps: WorkItemProps = {
      ...this.props,
      sdlcLifecycleState: newState,
      updatedAt: new Date(),
    };

    return {
      success: true,
      workItem: new WorkItem(newProps),
    };
  }

  /**
   * Set blocker reason
   */
  setBlocker(blocker: BlockerReason): WorkItem {
    const newProps: WorkItemProps = {
      ...this.props,
      blockerReason: blocker,
      updatedAt: new Date(),
    };
    return new WorkItem(newProps);
  }

  /**
   * Clear blocker reason
   */
  clearBlocker(): WorkItem {
    const newProps: WorkItemProps = {
      ...this.props,
      blockerReason: undefined,
      updatedAt: new Date(),
    };
    return new WorkItem(newProps);
  }

  /**
   * Update branch name
   */
  updateBranchName(branchName: string): WorkItem {
    const newProps: WorkItemProps = {
      ...this.props,
      branchName,
      updatedAt: new Date(),
    };
    return new WorkItem(newProps);
  }

  /**
   * Update issue number
   */
  updateIssueNumber(issueNumber: string): WorkItem {
    const newProps: WorkItemProps = {
      ...this.props,
      issueNumber,
      updatedAt: new Date(),
    };
    return new WorkItem(newProps);
  }

  /**
   * Update PR number
   */
  updatePRNumber(prNumber: string): WorkItem {
    const newProps: WorkItemProps = {
      ...this.props,
      prNumber,
      updatedAt: new Date(),
    };
    return new WorkItem(newProps);
  }

  /**
   * Validate SDLC lifecycle requirements
   */
  validateLifecycleRequirements(): { valid: true } | { valid: false; errors: string[] } {
    if (!this.props.sdlcLifecycleState) {
      return { valid: true }; // No state to validate
    }

    const errors: string[] = [];

    if (this.props.sdlcLifecycleState.requiresBranchName() && !this.props.branchName) {
      errors.push('Branch name is required for this lifecycle state');
    }

    if (this.props.sdlcLifecycleState.requiresIssueLink() && !this.props.issueNumber) {
      errors.push('Issue number is required for this lifecycle state');
    }

    if (this.props.sdlcLifecycleState.requiresPRLink() && !this.props.prNumber) {
      errors.push('PR number is required for this lifecycle state');
    }

    if (errors.length > 0) {
      return { valid: false, errors };
    }

    return { valid: true };
  }

  /**
   * Convert to plain object for serialization
   */
  toData(): WorkItemData {
    const data: WorkItemData = {
      id: this.props.id,
      organizationId: this.props.organizationId,
      priority: this.props.priority.toNumber(),
      status: this.props.status.toString(),
      type: this.props.type.toString(),
      source: this.props.source.toObject(),
      command: this.props.command,
      createdAt: this.props.createdAt,
      updatedAt: this.props.updatedAt,
      retryCount: this.props.retryCount,
      maxRetries: this.props.maxRetries,
    };

    if (this.props.context !== undefined) data.context = this.props.context;
    if (this.props.sdlcPhase !== undefined) data.sdlcPhase = this.props.sdlcPhase.toNumber();
    if (this.props.sdlcLifecycleState !== undefined) data.sdlcLifecycleState = this.props.sdlcLifecycleState.toString();
    if (this.props.blockerReason !== undefined) data.blockerReason = this.props.blockerReason.toData();
    if (this.props.branchName !== undefined) data.branchName = this.props.branchName;
    if (this.props.issueNumber !== undefined) data.issueNumber = this.props.issueNumber;
    if (this.props.prNumber !== undefined) data.prNumber = this.props.prNumber;
    if (this.props.parentIssueId !== undefined) data.parentIssueId = this.props.parentIssueId;
    if (this.props.claimedBy !== undefined) data.claimedBy = this.props.claimedBy;
    if (this.props.claimedAt !== undefined) data.claimedAt = this.props.claimedAt;
    if (this.props.lastHeartbeatAt !== undefined) data.lastHeartbeatAt = this.props.lastHeartbeatAt;
    if (this.props.startedAt !== undefined) data.startedAt = this.props.startedAt;
    if (this.props.completedAt !== undefined) data.completedAt = this.props.completedAt;
    if (this.props.result !== undefined) data.result = this.props.result;

    return data;
  }
}
