/**
 * Linkage Validation Rules
 *
 * Validates issue/PR linkage requirements for SDLC work items.
 * Ensures proper tracking and metadata discipline.
 */

import { SdlcLifecycleState } from '../value-objects/SdlcLifecycleState';
import { BlockerReason } from '../value-objects/BlockerReason';

export interface LinkageValidationContext {
  sdlcLifecycleState?: SdlcLifecycleState;
  branchName?: string;
  issueNumber?: string;
  prNumber?: string;
}

export interface LinkageValidationResult {
  valid: boolean;
  blockers: BlockerReason[];
  warnings: string[];
}

/**
 * Branch name pattern: <issue-number>-description
 * Examples: 123-feature-name, 456-bug-fix
 */
const BRANCH_NAME_PATTERN = /^(\d+)-[a-z0-9-]+$/;

/**
 * Validate all linkage requirements for current lifecycle state
 */
export function validateLinkage(context: LinkageValidationContext): LinkageValidationResult {
  const blockers: BlockerReason[] = [];
  const warnings: string[] = [];

  if (!context.sdlcLifecycleState) {
    return { valid: true, blockers, warnings };
  }

  const state = context.sdlcLifecycleState;

  // Validate branch name requirement
  if (state.requiresBranchName()) {
    if (!context.branchName) {
      blockers.push(
        BlockerReason.create(
          'invalid_branch_name',
          'Branch name is required but not set'
        )
      );
    } else if (!validateBranchName(context.branchName)) {
      blockers.push(
        BlockerReason.create(
          'invalid_branch_name',
          `Branch name "${context.branchName}" does not match pattern: <issue>-description`,
          { branchName: context.branchName, pattern: BRANCH_NAME_PATTERN.source }
        )
      );
    }
  }

  // Validate issue link requirement
  if (state.requiresIssueLink()) {
    if (!context.issueNumber) {
      blockers.push(
        BlockerReason.create(
          'missing_issue_link',
          'Issue number is required but not set'
        )
      );
    } else {
      // Validate branch name matches issue number
      if (context.branchName) {
        const match = context.branchName.match(/^(\d+)-/);
        if (match && match[1] !== context.issueNumber) {
          warnings.push(
            `Branch name starts with ${match[1]} but issue is ${context.issueNumber}`
          );
        }
      }
    }
  }

  // Validate PR link requirement
  if (state.requiresPRLink()) {
    if (!context.prNumber) {
      blockers.push(
        BlockerReason.create(
          'missing_pr_link',
          'PR number is required but not set'
        )
      );
    }
  }

  return {
    valid: blockers.length === 0,
    blockers,
    warnings,
  };
}

/**
 * Validate branch name format
 */
export function validateBranchName(branchName: string): boolean {
  return BRANCH_NAME_PATTERN.test(branchName);
}

/**
 * Extract issue number from branch name
 */
export function extractIssueFromBranch(branchName: string): string | null {
  const match = branchName.match(/^(\d+)-/);
  return match?.[1] ?? null;
}

/**
 * Generate recommended branch name from issue number
 */
export function generateBranchName(issueNumber: string, description: string): string {
  const sanitized = description
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50); // Limit length

  return `${issueNumber}-${sanitized}`;
}

/**
 * Validate PR body contains a non-auto-close issue reference.
 */
export function validatePrBodyLinkage(prBody: string, expectedIssue: string): boolean {
  const linkagePattern = new RegExp(
    `(addresses|relates\\s+to)\\s+#${expectedIssue}\\b`,
    'i'
  );
  return linkagePattern.test(prBody);
}

/**
 * Check if PR title contains issue number
 */
export function validatePrTitleIssue(prTitle: string, expectedIssue: string): boolean {
  const titlePattern = new RegExp(`\\[#${expectedIssue}\\]|#${expectedIssue}\\b`, 'i');
  return titlePattern.test(prTitle);
}
