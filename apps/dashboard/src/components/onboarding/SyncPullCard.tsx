'use client'

import { useState } from 'react';
import { RefreshCw, Copy, Check, Terminal, CheckCircle2 } from 'lucide-react';
import { OnboardingCard } from './OnboardingCard';
import type { OnboardingStepStatus } from '@gal/types';

interface SyncPullCardProps {
  status: OnboardingStepStatus;
  onComplete: () => void;
  onSkip: () => void;
}

export function SyncPullCard({ status, onComplete, onSkip }: SyncPullCardProps) {
  const [copied, setCopied] = useState(false);
  const command = 'gal sync --pull';

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.warn('Clipboard API not available');
    }
  };

  return (
    <OnboardingCard
      title="Pull Approved Configuration"
      description="Download your workspace's approved coding-agent configuration"
      icon={<RefreshCw className="w-6 h-6 text-[var(--accent)]" />}
      status={status}
      onComplete={onComplete}
      onSkip={onSkip}
      completeLabel="Done"
    >
      <div className="space-y-4">
        {/* What you'll get */}
        <div className="p-4 bg-[var(--bg-tertiary)]/50 rounded-lg border border-[var(--border-subtle)]">
          <p className="text-sm font-medium text-[var(--text-primary)] mb-2">
            This will download your workspace&apos;s approved configuration bundle:
          </p>
          <ul className="space-y-1 text-sm text-[var(--text-secondary)]">
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3 h-3 text-[var(--accent)]" />
              Instruction files and shared prompts
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3 h-3 text-[var(--accent)]" />
              Settings and tool permissions
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3 h-3 text-[var(--accent)]" />
              commands/ - Shared workflows and slash commands
            </li>
            <li className="flex items-center gap-2">
              <CheckCircle2 className="w-3 h-3 text-[var(--accent)]" />
              hooks/ - Lifecycle automations and guardrails
            </li>
          </ul>
        </div>

        {/* Command */}
        <div>
          <p className="text-sm text-[var(--text-secondary)] mb-2">
            Run this command in your project directory:
          </p>
          <div className="flex items-center gap-2 bg-[var(--bg-tertiary)] p-3 rounded-lg font-mono text-sm">
            <Terminal className="w-4 h-4 text-[var(--text-muted)]" />
            <code className="flex-1 text-[var(--text-primary)]">{command}</code>
            <button
              onClick={copyCommand}
              className="p-2 hover:bg-[var(--bg-secondary)] rounded transition-colors"
              title="Copy command"
            >
              {copied ? (
                <Check className="w-4 h-4 text-[var(--status-success)]" />
              ) : (
                <Copy className="w-4 h-4 text-[var(--text-muted)]" />
              )}
            </button>
          </div>
        </div>

        <p className="text-xs text-[var(--text-muted)]">
          Run this anytime to get the latest approved configuration from your workspace.
        </p>
      </div>
    </OnboardingCard>
  );
}
