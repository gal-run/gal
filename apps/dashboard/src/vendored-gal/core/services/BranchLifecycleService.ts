import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface BranchInfo {
  name: string;
  isDirty: boolean;
  isUnmerged: boolean;
  author: string;
  lastCommitDate: string;
  prStatus: 'OPEN' | 'CLOSED' | 'MERGED' | 'NO_PR';
  commitsAhead: number;
  commitsBehind: number;
}

export interface WorktreeInfo {
  path: string;
  branch: string;
  isDirty: boolean;
  isLocked: boolean;
  isRemovable: boolean;
}

export interface CleanupPolicy {
  allowDirty: boolean;
  allowUnmerged: boolean;
  allowForeignOwner: boolean;
  requireExplicitForce: boolean;
}

export interface CleanupReport {
  safeToDelete: BranchInfo[];
  unsafeToDelete: Array<{
    branch: BranchInfo;
    reasons: string[];
  }>;
  totalBranches: number;
  safeCount: number;
  unsafeCount: number;
}

/**
 * Safe branch and worktree lifecycle management service
 * Implements safety rules to prevent accidental deletion of uncommitted or foreign WIP
 */
export class BranchLifecycleService {
  private currentUser: string = '';
  private currentBranch: string = '';

  /**
   * Initialize service by detecting current git user and branch
   */
  async initialize(): Promise<void> {
    try {
      const { stdout: user } = await execAsync('git config user.email');
      this.currentUser = user.trim();
    } catch {
      this.currentUser = 'unknown';
    }

    try {
      const { stdout: branch } = await execAsync('git branch --show-current');
      this.currentBranch = branch.trim();
    } catch {
      this.currentBranch = 'main';
    }
  }

  /**
   * Get comprehensive branch information
   */
  async getBranchInfo(branchName: string): Promise<BranchInfo> {
    const [isDirty, isUnmerged, author, lastCommitDate, prStatus, commits] =
      await Promise.all([
        this.isBranchDirty(branchName),
        this.isBranchUnmerged(branchName),
        this.getBranchAuthor(branchName),
        this.getLastCommitDate(branchName),
        this.getPRStatus(branchName),
        this.getBranchCommitStats(branchName),
      ]);

    return {
      name: branchName,
      isDirty,
      isUnmerged,
      author,
      lastCommitDate,
      prStatus,
      commitsAhead: commits.ahead,
      commitsBehind: commits.behind,
    };
  }

  /**
   * Check if branch has uncommitted changes
   */
  private async isBranchDirty(branchName: string): Promise<boolean> {
    try {
      // Check if current branch
      if (branchName === this.currentBranch) {
        const { stdout } = await execAsync('git status --porcelain');
        return stdout.trim().length > 0;
      }

      // For non-current branches, check if worktree exists with uncommitted changes
      const worktrees = await this.listWorktrees();
      const worktree = worktrees.find((w) => w.branch === branchName);

      if (worktree) {
        const { stdout } = await execAsync(
          `git -C "${worktree.path}" status --porcelain`
        );
        return stdout.trim().length > 0;
      }

      return false;
    } catch {
      return false;
    }
  }

  /**
   * Check if branch has unmerged commits
   */
  private async isBranchUnmerged(branchName: string): Promise<boolean> {
    try {
      // Check against main branch
      const { stdout } = await execAsync(
        `git log main..${branchName} --oneline`
      );
      return stdout.trim().length > 0;
    } catch {
      return true; // Assume unmerged if can't determine
    }
  }

  /**
   * Get branch author (last committer)
   */
  private async getBranchAuthor(branchName: string): Promise<string> {
    try {
      const { stdout } = await execAsync(
        `git log -1 --format='%ae' ${branchName}`
      );
      return stdout.trim();
    } catch {
      return 'unknown';
    }
  }

  /**
   * Get last commit date
   */
  private async getLastCommitDate(branchName: string): Promise<string> {
    try {
      const { stdout } = await execAsync(
        `git log -1 --format='%ai' ${branchName}`
      );
      return stdout.trim();
    } catch {
      return '';
    }
  }

  /**
   * Get PR status for branch
   */
  private async getPRStatus(
    branchName: string
  ): Promise<'OPEN' | 'CLOSED' | 'MERGED' | 'NO_PR'> {
    try {
      const { stdout } = await execAsync(
        `gh pr list --state all --head "${branchName}" --json state --jq '.[0].state // "NO_PR"'`
      );
      const status = stdout.trim();

      if (status === 'OPEN' || status === 'CLOSED' || status === 'MERGED') {
        return status as 'OPEN' | 'CLOSED' | 'MERGED';
      }

      return 'NO_PR';
    } catch {
      return 'NO_PR';
    }
  }

  /**
   * Get commits ahead/behind main
   */
  private async getBranchCommitStats(
    branchName: string
  ): Promise<{ ahead: number; behind: number }> {
    try {
      const { stdout: ahead } = await execAsync(
        `git rev-list --count main..${branchName}`
      );
      const { stdout: behind } = await execAsync(
        `git rev-list --count ${branchName}..main`
      );

      return {
        ahead: parseInt(ahead.trim(), 10) || 0,
        behind: parseInt(behind.trim(), 10) || 0,
      };
    } catch {
      return { ahead: 0, behind: 0 };
    }
  }

  /**
   * List all worktrees with their status
   */
  async listWorktrees(): Promise<WorktreeInfo[]> {
    try {
      const { stdout } = await execAsync('git worktree list --porcelain');
      const worktrees: WorktreeInfo[] = [];
      const lines = stdout.split('\n');

      let currentWorktree: Partial<WorktreeInfo> = {};

      for (const line of lines) {
        if (line.startsWith('worktree ')) {
          if (currentWorktree.path) {
            worktrees.push(currentWorktree as WorktreeInfo);
          }
          currentWorktree = { path: line.substring(9) };
        } else if (line.startsWith('branch ')) {
          currentWorktree.branch = line
            .substring(7)
            .replace('refs/heads/', '');
        } else if (line.startsWith('locked')) {
          currentWorktree.isLocked = true;
        }
      }

      if (currentWorktree.path) {
        worktrees.push(currentWorktree as WorktreeInfo);
      }

      // Check dirty status and removability for each
      for (const wt of worktrees) {
        wt.isDirty = await this.isWorktreeDirty(wt.path);
        wt.isLocked = wt.isLocked || false;
        wt.isRemovable = !wt.isDirty && !wt.isLocked;
      }

      return worktrees;
    } catch {
      return [];
    }
  }

  /**
   * Check if worktree has uncommitted changes
   */
  private async isWorktreeDirty(worktreePath: string): Promise<boolean> {
    try {
      const { stdout } = await execAsync(
        `git -C "${worktreePath}" status --porcelain`
      );
      return stdout.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * Generate cleanup report for branches
   */
  async generateCleanupReport(
    branches: string[],
    policy: CleanupPolicy
  ): Promise<CleanupReport> {
    await this.initialize();

    const branchInfos = await Promise.all(
      branches.map((b) => this.getBranchInfo(b))
    );

    const report: CleanupReport = {
      safeToDelete: [],
      unsafeToDelete: [],
      totalBranches: branches.length,
      safeCount: 0,
      unsafeCount: 0,
    };

    for (const info of branchInfos) {
      const reasons: string[] = [];

      // Check dirty status
      if (info.isDirty && !policy.allowDirty) {
        reasons.push('Has uncommitted changes');
      }

      // Check unmerged status
      if (info.isUnmerged && !policy.allowUnmerged) {
        reasons.push('Contains unmerged commits');
      }

      // Check ownership
      if (
        info.author !== this.currentUser &&
        info.author !== 'unknown' &&
        !policy.allowForeignOwner
      ) {
        reasons.push(`Owned by different user: ${info.author}`);
      }

      // Check PR status
      if (info.prStatus === 'OPEN') {
        reasons.push('Has open PR');
      }

      // Determine if safe
      if (reasons.length === 0) {
        report.safeToDelete.push(info);
        report.safeCount++;
      } else {
        report.unsafeToDelete.push({ branch: info, reasons });
        report.unsafeCount++;
      }
    }

    return report;
  }

  /**
   * Safe branch deletion with validation
   */
  async deleteBranch(
    branchName: string,
    force: boolean = false
  ): Promise<{ success: boolean; message: string }> {
    await this.initialize();

    // Protection: never delete current branch
    if (branchName === this.currentBranch) {
      return {
        success: false,
        message: `Cannot delete current branch: ${branchName}`,
      };
    }

    // Protection: never delete protected branches
    const protectedBranches = ['main', 'dev', 'dev-local'];
    if (protectedBranches.includes(branchName)) {
      return {
        success: false,
        message: `Cannot delete protected branch: ${branchName}`,
      };
    }

    // Get branch info
    const info = await this.getBranchInfo(branchName);

    // Safety checks (unless force is true)
    if (!force) {
      const reasons: string[] = [];

      if (info.isDirty) {
        reasons.push('Has uncommitted changes');
      }

      if (info.isUnmerged && info.prStatus !== 'MERGED') {
        reasons.push('Contains unmerged commits');
      }

      if (info.author !== this.currentUser && info.author !== 'unknown') {
        reasons.push(`Owned by different user: ${info.author}`);
      }

      if (info.prStatus === 'OPEN') {
        reasons.push('Has open PR');
      }

      if (reasons.length > 0) {
        return {
          success: false,
          message: `Cannot delete ${branchName}: ${reasons.join(', ')}. Use force=true to override.`,
        };
      }
    }

    // Attempt deletion
    try {
      const deleteFlag = force ? '-D' : '-d';
      await execAsync(`git branch ${deleteFlag} "${branchName}"`);

      return {
        success: true,
        message: `Successfully deleted branch: ${branchName}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to delete ${branchName}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Safe worktree removal with validation
   */
  async removeWorktree(
    worktreePath: string,
    force: boolean = false
  ): Promise<{ success: boolean; message: string }> {
    // Check if worktree exists
    const worktrees = await this.listWorktrees();
    const worktree = worktrees.find((w) => w.path === worktreePath);

    if (!worktree) {
      return {
        success: false,
        message: `Worktree not found: ${worktreePath}`,
      };
    }

    // Safety checks (unless force is true)
    if (!force) {
      if (worktree.isDirty) {
        return {
          success: false,
          message: `Cannot remove worktree with uncommitted changes: ${worktreePath}. Use force=true to override.`,
        };
      }

      if (worktree.isLocked) {
        return {
          success: false,
          message: `Cannot remove locked worktree: ${worktreePath}. Use force=true to override.`,
        };
      }
    }

    // Attempt removal
    try {
      const forceFlag = force ? '--force' : '';
      await execAsync(`git worktree remove ${forceFlag} "${worktreePath}"`);

      return {
        success: true,
        message: `Successfully removed worktree: ${worktreePath}`,
      };
    } catch (error) {
      return {
        success: false,
        message: `Failed to remove worktree ${worktreePath}: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  /**
   * Get default safe cleanup policy
   */
  static getDefaultPolicy(): CleanupPolicy {
    return {
      allowDirty: false,
      allowUnmerged: false,
      allowForeignOwner: false,
      requireExplicitForce: true,
    };
  }

  /**
   * Get aggressive cleanup policy (still with safety checks)
   */
  static getAggressivePolicy(): CleanupPolicy {
    return {
      allowDirty: false, // Still protect uncommitted work
      allowUnmerged: true, // Allow deleting unmerged branches with CLOSED/NO_PR
      allowForeignOwner: false, // Still protect other users' work
      requireExplicitForce: true,
    };
  }
}
