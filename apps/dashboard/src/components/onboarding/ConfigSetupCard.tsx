'use client'

import { Settings, ChevronRight, FileCode, FileText, Terminal } from 'lucide-react';
import { OnboardingCard } from './OnboardingCard';
import type { OnboardingStepStatus } from '@gal/types';
import Link from 'next/link';

interface ConfigSetupCardProps {
  status: OnboardingStepStatus;
  onComplete: () => void;
  onSkip: () => void;
}

export function ConfigSetupCard({ status, onComplete, onSkip }: ConfigSetupCardProps) {
  return (
    <OnboardingCard
      title="Set Up Approved Config"
      description="Define the approved coding-agent configuration for your workspace"
      icon={<Settings className="w-6 h-6 text-[var(--accent)]" />}
      status={status}
      onComplete={onComplete}
      onSkip={onSkip}
      completeLabel="Done"
    >
      <div className="space-y-4">
        {/* Config types supported */}
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--text-muted)]">
          <span>Config types:</span>
          <div className="flex items-center gap-1 px-2 py-1 bg-[var(--bg-tertiary)] rounded">
            <FileText className="w-3 h-3" />
            <span>instructions</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 bg-[var(--bg-tertiary)] rounded">
            <FileCode className="w-3 h-3" />
            <span>settings</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 bg-[var(--bg-tertiary)] rounded">
            <Terminal className="w-3 h-3" />
            <span>commands &amp; hooks</span>
          </div>
        </div>

        {/* Config setup card */}
        <div className="p-4 bg-[var(--bg-tertiary)]/50 rounded-lg border border-[var(--border-subtle)]">
          <div className="flex items-center gap-3 mb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[var(--accent-bg)]">
              <Settings className="w-4 h-4 text-[var(--accent)]" />
            </div>
            <div>
              <p className="font-medium text-[var(--text-primary)]">Approved Workspace Config</p>
              <p className="text-xs text-[var(--text-muted)]">Workspace-approved settings</p>
            </div>
          </div>

          <p className="text-sm text-[var(--text-secondary)] mb-3">
            Review and publish the instructions, settings, commands, and hooks GAL should distribute across your workspace.
          </p>

          <Link
            href="/approved-config"
            className="inline-flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 font-medium text-[var(--text-on-accent)] transition-colors hover:bg-[var(--accent-light)]"
          >
            <span>Open Config</span>
            <ChevronRight className="w-4 h-4" />
          </Link>
        </div>

        <p className="text-xs text-[var(--text-muted)]">
          You can also access this later from the sidebar navigation.
        </p>
      </div>
    </OnboardingCard>
  );
}
