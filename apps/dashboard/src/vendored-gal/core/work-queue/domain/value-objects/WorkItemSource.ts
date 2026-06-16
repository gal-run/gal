/**
 * WorkItemSource Value Object
 *
 * Immutable value object representing the source of a work item.
 * Provides traceability back to GitHub issues/PRs.
 */

export type SourceType = 'github_issue' | 'github_pr' | 'manual';

export interface SourceData {
  type: SourceType;
  url?: string | undefined;
  issueNumber?: number | undefined;
  prNumber?: number | undefined;
  repository?: string | undefined;
}

export class WorkItemSource {
  private constructor(
    private readonly type: SourceType,
    private readonly url?: string,
    private readonly issueNumber?: number,
    private readonly prNumber?: number,
    private readonly repository?: string
  ) {}

  /**
   * Create source from GitHub issue
   */
  static fromGitHubIssue(
    repository: string,
    issueNumber: number,
    url?: string
  ): WorkItemSource {
    return new WorkItemSource(
      'github_issue',
      url || `https://github.com/${repository}/issues/${issueNumber}`,
      issueNumber,
      undefined,
      repository
    );
  }

  /**
   * Create source from GitHub PR
   */
  static fromGitHubPR(
    repository: string,
    prNumber: number,
    url?: string
  ): WorkItemSource {
    return new WorkItemSource(
      'github_pr',
      url || `https://github.com/${repository}/pull/${prNumber}`,
      undefined,
      prNumber,
      repository
    );
  }

  /**
   * Create manual source
   */
  static manual(): WorkItemSource {
    return new WorkItemSource('manual');
  }

  /**
   * Create from plain object (for deserialization)
   */
  static fromObject(data: SourceData): WorkItemSource {
    return new WorkItemSource(
      data.type,
      data.url,
      data.issueNumber,
      data.prNumber,
      data.repository
    );
  }

  /**
   * Get source type
   */
  getType(): SourceType {
    return this.type;
  }

  /**
   * Get URL
   */
  getUrl(): string | undefined {
    return this.url;
  }

  /**
   * Get issue number (if GitHub issue)
   */
  getIssueNumber(): number | undefined {
    return this.issueNumber;
  }

  /**
   * Get PR number (if GitHub PR)
   */
  getPrNumber(): number | undefined {
    return this.prNumber;
  }

  /**
   * Get repository (owner/repo format)
   */
  getRepository(): string | undefined {
    return this.repository;
  }

  /**
   * Check if source is from GitHub
   */
  isGitHub(): boolean {
    return this.type === 'github_issue' || this.type === 'github_pr';
  }

  /**
   * Check if source is a GitHub issue
   */
  isGitHubIssue(): boolean {
    return this.type === 'github_issue';
  }

  /**
   * Check if source is a GitHub PR
   */
  isGitHubPR(): boolean {
    return this.type === 'github_pr';
  }

  /**
   * Check if source is manual
   */
  isManual(): boolean {
    return this.type === 'manual';
  }

  /**
   * Get GitHub identifier (issue or PR number)
   */
  getGitHubIdentifier(): number | undefined {
    return this.issueNumber || this.prNumber;
  }

  /**
   * Convert to plain object (for serialization)
   */
  toObject(): SourceData {
    const data: SourceData = { type: this.type };
    if (this.url !== undefined) data.url = this.url;
    if (this.issueNumber !== undefined) data.issueNumber = this.issueNumber;
    if (this.prNumber !== undefined) data.prNumber = this.prNumber;
    if (this.repository !== undefined) data.repository = this.repository;
    return data;
  }

  /**
   * Check equality
   */
  equals(other: WorkItemSource): boolean {
    return (
      this.type === other.type &&
      this.url === other.url &&
      this.issueNumber === other.issueNumber &&
      this.prNumber === other.prNumber &&
      this.repository === other.repository
    );
  }

  /**
   * Generate unique key for duplicate detection
   */
  toUniqueKey(): string {
    if (this.isGitHubIssue() && this.repository && this.issueNumber) {
      return `github_issue:${this.repository}:${this.issueNumber}`;
    }
    if (this.isGitHubPR() && this.repository && this.prNumber) {
      return `github_pr:${this.repository}:${this.prNumber}`;
    }
    return `manual:${Date.now()}`;
  }
}
