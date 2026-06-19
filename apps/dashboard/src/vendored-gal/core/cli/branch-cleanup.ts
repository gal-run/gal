#!/usr/bin/env node
import { BranchLifecycleService } from '../services/BranchLifecycleService';
import { exec } from 'child_process';
import { promisify } from 'util';
import { createLogger } from '@gal/telemetry';

const logger = createLogger('branch-cleanup');

const execAsync = promisify(exec);

interface CleanupOptions {
  dryRun: boolean;
  aggressive: boolean;
  includeStashes: boolean;
  force: boolean;
}

async function getAllLocalBranches(): Promise<string[]> {
  try {
    const { stdout } = await execAsync('git branch');
    return stdout
      .split('\n')
      .map((b) => b.replace(/^[* ]+/, '').trim())
      .filter((b) => b && !['main', 'dev-local'].includes(b));
  } catch {
    return [];
  }
}

async function main() {
  const args = process.argv.slice(2);

  const options: CleanupOptions = {
    dryRun: args.includes('--dry-run'),
    aggressive: args.includes('--aggressive'),
    includeStashes: args.includes('--include-stashes'),
    force: args.includes('--force'),
  };

  logger.info('🧹 Git Branch Pruning Tool (Safe Mode)');
  logger.info('═══════════════════════════════════════════════════════════');
  logger.info('');

  if (options.dryRun) {
    logger.info('🔍 DRY RUN MODE - No changes will be made');
    logger.info('');
  }

  // Step 1: Fetch and prune remote references
  logger.info('📡 FETCHING & PRUNING REMOTE REFERENCES');
  logger.info('──────────────────────────────────────────────────────────');

  if (options.dryRun) {
    logger.info('Would run: git fetch --prune --prune-tags origin');
    logger.info('Would run: git remote prune origin');
  } else {
    logger.info('Fetching latest refs and pruning deleted remotes...');
    await execAsync('git fetch --prune --prune-tags origin');
    await execAsync('git remote prune origin');
    logger.info('✅ Remote references updated and pruned');
  }

  logger.info('');

  // Step 2: Initialize service and get branches
  const service = new BranchLifecycleService();
  await service.initialize();

  const branches = await getAllLocalBranches();

  logger.info('🔍 ANALYZING ALL LOCAL BRANCHES');
  logger.info('──────────────────────────────────────────────────────────');
  logger.info(`Found ${branches.length} local branches (excluding protected)`);
  logger.info('');

  // Step 3: Generate cleanup report
  const policy = options.aggressive
    ? BranchLifecycleService.getAggressivePolicy()
    : BranchLifecycleService.getDefaultPolicy();

  const report = await service.generateCleanupReport(branches, policy);

  logger.info('📋 Branch Analysis:');
  logger.info('');

  // Display safe to delete branches
  if (report.safeToDelete.length > 0) {
    logger.info('✅ Safe to delete:');
    for (const branch of report.safeToDelete) {
      logger.info(
        `  🟢 ${branch.name} (${branch.prStatus}, ${branch.commitsAhead} ahead, ${branch.commitsBehind} behind)`
      );
    }
    logger.info('');
  }

  // Display unsafe branches with reasons
  if (report.unsafeToDelete.length > 0) {
    logger.info('⚠️ Cannot delete (safety checks failed):');
    for (const { branch, reasons } of report.unsafeToDelete) {
      logger.info(`  ❌ ${branch.name}:`);
      for (const reason of reasons) {
        logger.info(`     - ${reason}`);
      }
    }
    logger.info('');
  }

  // Step 4: Execute deletions if not dry run
  if (!options.dryRun && report.safeToDelete.length > 0) {
    logger.info('🧹 CLEANING BRANCHES');
    logger.info('──────────────────────────────────────────────────────────');

    let deletedCount = 0;
    let failedCount = 0;

    for (const branch of report.safeToDelete) {
      const result = await service.deleteBranch(branch.name, options.force);

      if (result.success) {
        logger.info(`✅ ${result.message}`);
        deletedCount++;
      } else {
        logger.info(`❌ ${result.message}`);
        failedCount++;
      }
    }

    logger.info('');
    logger.info(
      `✅ Cleaned ${deletedCount} branches${failedCount > 0 ? ` (${failedCount} failed)` : ''}`
    );
    logger.info('');
  } else if (!options.dryRun && report.safeToDelete.length === 0) {
    logger.info('✅ No branches need cleanup');
    logger.info('');
  }

  // Step 5: Worktree cleanup (if aggressive)
  if (options.aggressive) {
    logger.info('⚡ AGGRESSIVE CLEANUP MODE');
    logger.info('──────────────────────────────────────────────────────────');

    const worktrees = await service.listWorktrees();

    // Skip main worktree
    const cleanableWorktrees = worktrees.slice(1);

    if (cleanableWorktrees.length > 0) {
      logger.info('🗂️ Worktree status:');
      for (const wt of cleanableWorktrees) {
        const status = wt.isDirty
          ? '❌ Has uncommitted changes'
          : wt.isLocked
            ? '🔒 Locked'
            : '✅ Clean';
        logger.info(`  ${wt.path} (${wt.branch}): ${status}`);
      }
      logger.info('');

      // Only remove clean worktrees
      const removableWorktrees = cleanableWorktrees.filter((wt) =>
        options.force ? true : wt.isRemovable
      );

      if (removableWorktrees.length > 0 && !options.dryRun) {
        logger.info('Removing clean worktrees...');
        for (const wt of removableWorktrees) {
          const result = await service.removeWorktree(wt.path, options.force);
          logger.info(
            result.success
              ? `✅ ${result.message}`
              : `❌ ${result.message}`
          );
        }
        logger.info('');
      } else if (options.dryRun && removableWorktrees.length > 0) {
        logger.info(
          `Would remove ${removableWorktrees.length} clean worktrees`
        );
        logger.info('');
      }
    } else {
      logger.info('✅ No additional worktrees found');
      logger.info('');
    }

    // Git garbage collection
    logger.info('🗑️ Running git cleanup...');
    if (options.dryRun) {
      logger.info('Would run: git worktree prune');
      logger.info('Would run: git gc --prune=now');
    } else {
      await execAsync('git worktree prune');
      await execAsync('git gc --prune=now');
      logger.info('✅ Git cleanup complete');
    }
    logger.info('');
  }

  // Step 6: Stash cleanup (if requested)
  if (options.includeStashes) {
    logger.info('💾 STASH CLEANUP');
    logger.info('──────────────────────────────────────────────────────────');

    const { stdout: stashList } = await execAsync(
      'git stash list --oneline'
    ).catch(() => ({ stdout: '' }));
    const stashCount = stashList.trim().split('\n').filter(Boolean).length;

    if (stashCount > 0) {
      logger.info(`Found ${stashCount} stashes:`);
      logger.info(stashList.trim());
      logger.info('');
      logger.info('⚠️ Stashes contain potentially important work!');
      logger.info('Review each stash before deletion:');
      logger.info('  git stash show stash@{N} --stat');
      logger.info('  git stash drop stash@{N}  # if safe to delete');
      logger.info('  git stash clear          # delete ALL (dangerous!)');
    } else {
      logger.info('✅ No stashes found');
    }
    logger.info('');
  }

  // Step 7: Summary report
  logger.info('📊 CLEANUP SUMMARY');
  logger.info('═══════════════════════════════════════════════════════════');

  if (options.dryRun) {
    logger.info('🔍 DRY RUN COMPLETED - No changes were made');
  } else {
    logger.info('🧹 CLEANUP COMPLETED');
  }

  logger.info('');
  logger.info('Safety Statistics:');
  logger.info(`  ✅ Safe to delete: ${report.safeCount} branches`);
  logger.info(`  ⚠️ Protected: ${report.unsafeCount} branches`);
  logger.info('');

  // Health metrics
  const { stdout: allBranches } = await execAsync('git branch');
  const branchCount = allBranches.split('\n').filter(Boolean).length;

  logger.info('📈 Git Repository Health:');
  logger.info(`  📋 Local branches: ${branchCount}`);

  const worktrees = await service.listWorktrees();
  if (worktrees.length > 1) {
    logger.info(`  🗂️ Active worktrees: ${worktrees.length - 1}`);
  }

  logger.info('');
  logger.info('💡 RECOMMENDATIONS:');

  if (report.unsafeCount > 0) {
    logger.info('');
    logger.info('  ⚠️ UNSAFE BRANCHES DETECTED');
    logger.info(
      '  Some branches have uncommitted changes or are owned by other users.'
    );
    logger.info('  Review the list above before using --force to delete them.');
  }

  if (branchCount > 20) {
    logger.info(
      `  ⚠️ High branch count (${branchCount}) - consider more frequent pruning`
    );
  }

  logger.info('');
  logger.info('  ✅ Run this tool regularly to maintain a clean repository');
  logger.info('  💡 Use --dry-run to preview changes safely');
  logger.info('  🔒 Protected branches: main, dev-local (never deleted)');
  logger.info('');
}

main().catch((error) => {
  logger.error('❌ Error:', error.message);
  process.exit(1);
});
