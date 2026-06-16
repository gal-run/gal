/**
 * Git Merge Policy Enforcement - Branch Protection
 *
 * GAL-23: Enforces merge policies and branch protection rules
 *
 * Features:
 * - Required reviewers enforcement
 * - CI status checks
 * - Branch naming conventions
 * - Merge strategy enforcement
 */

export interface MergePolicyConfig {
  protectedBranches: BranchProtection[];
  defaultPolicy: MergePolicy;
  enforceConventions: boolean;
  requireLinearHistory: boolean;
}

export interface BranchProtection {
  pattern: string;
  policy: MergePolicy;
  allowedMergers?: string[]; // GitHub usernames
  allowForcePush: boolean;
  allowDeletion: boolean;
}

export interface MergePolicy {
  requiredReviewers: number;
  requiredChecks: string[];
  requireUpToDate: boolean;
  allowedMergeStrategies: ('merge' | 'squash' | 'rebase')[];
  requireSignedCommits: boolean;
  requireLinearHistory: boolean;
  dismissStaleReviews: boolean;
  requireCodeOwnerReviews: boolean;
  restrictions?: {
    users: string[];
    teams: string[];
  };
}

export interface MergeRequest {
  sourceBranch: string;
  targetBranch: string;
  author: string;
  reviewers: ReviewerStatus[];
  checks: CheckStatus[];
  commits: number;
  isBehindTarget: boolean;
  hasConflicts: boolean;
  mergeStrategy?: 'merge' | 'squash' | 'rebase';
}

export interface ReviewerStatus {
  username: string;
  status: 'approved' | 'changes_requested' | 'pending' | 'dismissed';
  isCodeOwner: boolean;
}

export interface CheckStatus {
  name: string;
  status: 'success' | 'failure' | 'pending' | 'skipped';
  required: boolean;
}

export interface MergeValidation {
  allowed: boolean;
  blockers: MergeBlocker[];
  warnings: string[];
  policy: MergePolicy;
}

export interface MergeBlocker {
  type: 'reviews' | 'checks' | 'branch' | 'conflicts' | 'strategy' | 'permissions';
  message: string;
  details?: string;
}

// Default policies
const DEFAULT_POLICY: MergePolicy = {
  requiredReviewers: 1,
  requiredChecks: ['ci'],
  requireUpToDate: true,
  allowedMergeStrategies: ['squash'],
  requireSignedCommits: false,
  requireLinearHistory: true,
  dismissStaleReviews: true,
  requireCodeOwnerReviews: false,
};

const STRICT_POLICY: MergePolicy = {
  requiredReviewers: 2,
  requiredChecks: ['ci', 'security', 'tests'],
  requireUpToDate: true,
  allowedMergeStrategies: ['squash'],
  requireSignedCommits: true,
  requireLinearHistory: true,
  dismissStaleReviews: true,
  requireCodeOwnerReviews: true,
};

/**
 * Merge Policy Enforcer
 */
export class MergePolicyEnforcer {
  private config: MergePolicyConfig;

  constructor(config: Partial<MergePolicyConfig> = {}) {
    this.config = {
      protectedBranches: config.protectedBranches || [
        { pattern: 'main', policy: STRICT_POLICY, allowForcePush: false, allowDeletion: false },
        { pattern: 'master', policy: STRICT_POLICY, allowForcePush: false, allowDeletion: false },
        { pattern: 'develop', policy: DEFAULT_POLICY, allowForcePush: false, allowDeletion: false },
        { pattern: 'release/*', policy: DEFAULT_POLICY, allowForcePush: false, allowDeletion: false },
      ],
      defaultPolicy: config.defaultPolicy || DEFAULT_POLICY,
      enforceConventions: config.enforceConventions ?? true,
      requireLinearHistory: config.requireLinearHistory ?? true,
    };
  }

  /**
   * Validate merge request
   */
  validateMerge(request: MergeRequest): MergeValidation {
    const protection = this.findProtection(request.targetBranch);
    const policy = protection?.policy || this.config.defaultPolicy;

    const blockers: MergeBlocker[] = [];
    const warnings: string[] = [];

    // Check reviews
    const reviewBlockers = this.checkReviews(request, policy);
    blockers.push(...reviewBlockers);

    // Check CI status
    const checkBlockers = this.checkCIStatus(request, policy);
    blockers.push(...checkBlockers);

    // Check branch status
    const branchBlockers = this.checkBranchStatus(request, policy);
    blockers.push(...branchBlockers);

    // Check merge strategy
    const strategyBlockers = this.checkMergeStrategy(request, policy);
    blockers.push(...strategyBlockers);

    // Check branch naming conventions
    if (this.config.enforceConventions) {
      const conventionWarnings = this.checkBranchNaming(request.sourceBranch);
      warnings.push(...conventionWarnings);
    }

    return {
      allowed: blockers.length === 0,
      blockers,
      warnings,
      policy,
    };
  }

  /**
   * Check review requirements
   */
  private checkReviews(request: MergeRequest, policy: MergePolicy): MergeBlocker[] {
    const blockers: MergeBlocker[] = [];

    // Count approved reviews
    const approvedReviews = request.reviewers.filter(r => r.status === 'approved');

    if (approvedReviews.length < policy.requiredReviewers) {
      blockers.push({
        type: 'reviews',
        message: `Requires ${policy.requiredReviewers} approval(s), has ${approvedReviews.length}`,
        details: `Reviewers: ${request.reviewers.map(r => `${r.username} (${r.status})`).join(', ')}`,
      });
    }

    // Check code owner reviews
    if (policy.requireCodeOwnerReviews) {
      const codeOwnerApproved = request.reviewers.some(r => r.isCodeOwner && r.status === 'approved');
      if (!codeOwnerApproved) {
        blockers.push({
          type: 'reviews',
          message: 'Code owner approval required',
        });
      }
    }

    // Check for changes requested
    const changesRequested = request.reviewers.filter(r => r.status === 'changes_requested');
    if (changesRequested.length > 0) {
      blockers.push({
        type: 'reviews',
        message: `Changes requested by: ${changesRequested.map(r => r.username).join(', ')}`,
      });
    }

    return blockers;
  }

  /**
   * Check CI status
   */
  private checkCIStatus(request: MergeRequest, policy: MergePolicy): MergeBlocker[] {
    const blockers: MergeBlocker[] = [];

    for (const requiredCheck of policy.requiredChecks) {
      const check = request.checks.find(c => c.name === requiredCheck || c.name.includes(requiredCheck));

      if (!check) {
        blockers.push({
          type: 'checks',
          message: `Required check "${requiredCheck}" not found`,
        });
      } else if (check.status === 'failure') {
        blockers.push({
          type: 'checks',
          message: `Required check "${check.name}" failed`,
        });
      } else if (check.status === 'pending') {
        blockers.push({
          type: 'checks',
          message: `Required check "${check.name}" is still running`,
        });
      }
    }

    return blockers;
  }

  /**
   * Check branch status
   */
  private checkBranchStatus(request: MergeRequest, policy: MergePolicy): MergeBlocker[] {
    const blockers: MergeBlocker[] = [];

    // Check for conflicts
    if (request.hasConflicts) {
      blockers.push({
        type: 'conflicts',
        message: 'Merge conflicts must be resolved',
      });
    }

    // Check if branch is up to date
    if (policy.requireUpToDate && request.isBehindTarget) {
      blockers.push({
        type: 'branch',
        message: 'Branch must be up to date with target',
        details: 'Rebase or merge the target branch into your branch',
      });
    }

    return blockers;
  }

  /**
   * Check merge strategy
   */
  private checkMergeStrategy(request: MergeRequest, policy: MergePolicy): MergeBlocker[] {
    const blockers: MergeBlocker[] = [];

    if (request.mergeStrategy && !policy.allowedMergeStrategies.includes(request.mergeStrategy)) {
      blockers.push({
        type: 'strategy',
        message: `Merge strategy "${request.mergeStrategy}" not allowed`,
        details: `Allowed strategies: ${policy.allowedMergeStrategies.join(', ')}`,
      });
    }

    // Check linear history
    if (policy.requireLinearHistory && request.commits > 1 && request.mergeStrategy === 'merge') {
      blockers.push({
        type: 'strategy',
        message: 'Linear history required - use squash or rebase',
      });
    }

    return blockers;
  }

  /**
   * Check branch naming conventions
   */
  private checkBranchNaming(branchName: string): string[] {
    const warnings: string[] = [];

    const validPatterns = [
      /^feature\/[a-z0-9-]+$/,
      /^bugfix\/[a-z0-9-]+$/,
      /^hotfix\/[a-z0-9-]+$/,
      /^release\/[a-z0-9.-]+$/,
      /^[A-Z]+-\d+[-/][a-z0-9-]+$/, // 123-feature-description
    ];

    const isValid = validPatterns.some(pattern => pattern.test(branchName));

    if (!isValid) {
      warnings.push(`Branch name "${branchName}" doesn't follow naming conventions`);
      warnings.push('Suggested formats: feature/*, bugfix/*, hotfix/*, 123-feature-*');
    }

    return warnings;
  }

  /**
   * Find branch protection for a branch
   */
  private findProtection(branchName: string): BranchProtection | undefined {
    return this.config.protectedBranches.find(p => {
      if (p.pattern.includes('*')) {
        const regex = new RegExp('^' + p.pattern.replace('*', '.*') + '$');
        return regex.test(branchName);
      }
      return p.pattern === branchName;
    });
  }

  /**
   * Check if branch is protected
   */
  isProtected(branchName: string): boolean {
    return this.findProtection(branchName) !== undefined;
  }

  /**
   * Get policy for branch
   */
  getPolicy(branchName: string): MergePolicy {
    const protection = this.findProtection(branchName);
    return protection?.policy || this.config.defaultPolicy;
  }

  /**
   * Add branch protection
   */
  addProtection(protection: BranchProtection): void {
    this.config.protectedBranches.push(protection);
  }

  /**
   * Remove branch protection
   */
  removeProtection(pattern: string): void {
    this.config.protectedBranches = this.config.protectedBranches.filter(
      p => p.pattern !== pattern
    );
  }

  /**
   * Format validation result
   */
  formatValidation(validation: MergeValidation): string {
    const lines: string[] = [];

    lines.push('═'.repeat(50));
    lines.push('        MERGE POLICY CHECK');
    lines.push('═'.repeat(50));
    lines.push('');

    if (validation.allowed) {
      lines.push('✅ Merge allowed');
    } else {
      lines.push('❌ Merge blocked');
      lines.push('');
      lines.push('Blockers:');
      for (const blocker of validation.blockers) {
        lines.push(`  • [${blocker.type.toUpperCase()}] ${blocker.message}`);
        if (blocker.details) {
          lines.push(`    → ${blocker.details}`);
        }
      }
    }

    if (validation.warnings.length > 0) {
      lines.push('');
      lines.push('Warnings:');
      for (const warning of validation.warnings) {
        lines.push(`  ⚠️  ${warning}`);
      }
    }

    lines.push('');
    lines.push('Policy:');
    lines.push(`  Required reviewers: ${validation.policy.requiredReviewers}`);
    lines.push(`  Required checks: ${validation.policy.requiredChecks.join(', ')}`);
    lines.push(`  Allowed strategies: ${validation.policy.allowedMergeStrategies.join(', ')}`);

    lines.push('═'.repeat(50));

    return lines.join('\n');
  }

  /**
   * Generate GitHub branch protection rules API payload
   */
  generateGitHubProtectionPayload(policy: MergePolicy): Record<string, any> {
    return {
      required_status_checks: {
        strict: policy.requireUpToDate,
        contexts: policy.requiredChecks,
      },
      enforce_admins: true,
      required_pull_request_reviews: {
        dismiss_stale_reviews: policy.dismissStaleReviews,
        require_code_owner_reviews: policy.requireCodeOwnerReviews,
        required_approving_review_count: policy.requiredReviewers,
      },
      restrictions: policy.restrictions ? {
        users: policy.restrictions.users,
        teams: policy.restrictions.teams,
      } : null,
      required_linear_history: policy.requireLinearHistory,
      required_signatures: policy.requireSignedCommits,
      allow_force_pushes: false,
      allow_deletions: false,
    };
  }
}

export default MergePolicyEnforcer;
