'use client'

import { Search, FolderSearch, GitBranch, ArrowRight } from 'lucide-react';
import Link from 'next/link';
import { OnboardingCard } from './OnboardingCard';
import type { OnboardingStepStatus } from '@gal/types';

interface DiscoveryCardProps {
  status: OnboardingStepStatus;
  onComplete: () => void;
  onSkip: () => void;
  discoveredCount?: number;
}

export function DiscoveryCard({ status, onComplete, onSkip, discoveredCount = 0 }: DiscoveryCardProps) {
  const hasDiscovered = discoveredCount > 0;

  return (
    <OnboardingCard
      title="Discover Existing Configurations"
      description="Scan your GitHub repositories for coding-agent configurations"
      icon={<Search className="w-6 h-6 text-[var(--accent)]" />}
      status={hasDiscovered ? 'completed' : status}
      onComplete={onComplete}
      onSkip={onSkip}
      completeLabel="Done"
      autoDetect={hasDiscovered}
    >
      <div className="space-y-4">
        {/* What discovery does */}
        <div className="p-4 bg-[var(--bg-tertiary)]/50 rounded-lg border border-[var(--border-subtle)]">
          <div className="flex items-start gap-3">
            <FolderSearch className="w-5 h-5 text-[var(--accent)] mt-0.5" />
            <div>
              <p className="text-sm font-medium text-[var(--text-primary)] mb-1">
                Auto-Discovery will scan for:
              </p>
              <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
                <li className="flex items-center gap-2">
                  <GitBranch className="w-3 h-3" />
                  Instruction files like AGENTS.md, CLAUDE.md, and .cursorrules
                </li>
                <li className="flex items-center gap-2">
                  <GitBranch className="w-3 h-3" />
                  Agent settings directories such as .claude/ and .cursor/
                </li>
                <li className="flex items-center gap-2">
                  <GitBranch className="w-3 h-3" />
                  Custom commands, hooks, and related governance files
                </li>
              </ul>
            </div>
          </div>
        </div>

        {hasDiscovered ? (
          <div className="p-4 bg-[var(--accent-bg)] rounded-lg">
            <p className="text-sm text-[var(--accent)]">
              ✓ Found <strong>{discoveredCount}</strong> configurations across your repositories
            </p>
          </div>
        ) : (
          <p className="text-sm text-[var(--text-secondary)]">
            Discovery helps you find the coding-agent configurations your team is already using,
            so you can fold the best patterns into your approved workspace config.
          </p>
        )}

        {/* Action */}
        <Link
          href="/discovery"
          className="inline-flex items-center gap-2 px-4 py-2 bg-[var(--accent)] text-[var(--text-on-accent)] rounded-lg hover:bg-[var(--accent-light)] transition-colors font-medium"
        >
          <Search className="w-4 h-4" />
          <span>{hasDiscovered ? 'View Discovered Configs' : 'Run Discovery'}</span>
          <ArrowRight className="w-4 h-4" />
        </Link>

        <p className="text-xs text-[var(--text-muted)]">
          You can run discovery again anytime from the Discovery page.
        </p>
      </div>
    </OnboardingCard>
  );
}
