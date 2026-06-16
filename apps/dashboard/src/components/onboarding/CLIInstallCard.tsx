'use client'

import { useState } from 'react';
import { Terminal, Copy, Check, ExternalLink } from 'lucide-react';
import { OnboardingCard } from './OnboardingCard';
import type { OnboardingStepStatus } from '@gal/types';
import { getCliInstallCommand } from '@/lib/config';

// npm logo SVG
const NpmIcon = () => (
  <svg viewBox="0 0 256 256" className="w-5 h-5">
    <rect fill="#C12127" width="256" height="256" rx="8" />
    <path fill="#fff" d="M48 48v160h80v-32h48v32h32V48H48zm64 128H80V80h32v96zm48 0h-16V80h16v96zm32 0h-16V80h16v96z" />
  </svg>
);

interface CLIInstallCardProps {
  status: OnboardingStepStatus;
  onComplete: () => void;
  onSkip: () => void;
}

export function CLIInstallCard({ status, onComplete, onSkip }: CLIInstallCardProps) {
  const [copied, setCopied] = useState(false);
  const command = getCliInstallCommand();

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-HTTPS contexts
      console.warn('Clipboard API not available');
    }
  };

  return (
    <OnboardingCard
      title="Install the CLI"
      description="Install the GAL command-line tool to sync approved configs"
      icon={<Terminal className="w-6 h-6 text-[var(--accent)]" />}
      status={status}
      onComplete={onComplete}
      onSkip={onSkip}
      completeLabel="Done"
    >
      <div className="space-y-4">
        {/* Supported package managers */}
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span>Supported:</span>
          <div className="flex items-center gap-1 px-2 py-1 bg-[var(--bg-tertiary)] rounded">
            <NpmIcon />
            <span>npm</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 bg-[var(--bg-tertiary)] rounded">
            <span className="text-sm">📦</span>
            <span>pnpm</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 bg-[var(--bg-tertiary)] rounded">
            <span className="text-sm">🧶</span>
            <span>yarn</span>
          </div>
        </div>

        {/* Install command */}
        <div>
          <p className="text-sm text-[var(--text-secondary)] mb-2">
            Run this command in your terminal:
          </p>
          <div className="flex items-center gap-2 bg-[var(--bg-tertiary)] p-3 rounded-lg font-mono text-sm">
            <code className="flex-1 text-[var(--text-primary)]">{command}</code>
            <button
              onClick={copyCommand}
              className="p-2 hover:bg-[var(--bg-secondary)] rounded transition-colors"
              aria-label="Copy command"
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

        {/* pnpm registry link */}
        <a
          href="https://www.npmjs.com/package/@scheduler-systems/gal-run"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 text-sm text-[var(--accent)] hover:underline"
        >
          View on npm
          <ExternalLink className="w-3 h-3" />
        </a>

        <p className="text-xs text-[var(--text-muted)]">
          After installation, verify by running: <code className="bg-[var(--bg-tertiary)] px-1 py-0.5 rounded">gal --version</code>
        </p>
      </div>
    </OnboardingCard>
  );
}
