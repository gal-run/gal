'use client'

import { useState } from 'react';
import Link from 'next/link';
import { Code, Copy, Check, ArrowRight } from 'lucide-react';
import { OnboardingCard } from './OnboardingCard';
import { VSCODE_EXTENSION_ID, VSCODE_INSTALL_GUIDE_PATH } from '@/lib/config';
import type { OnboardingStepStatus } from '@gal/types';

// VS Code logo SVG
const VSCodeIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 256 256" className={className}>
    <path fill="var(--brand-vscode)" d="M191.97 0L191.97 256L256 212.4L256 43.6L191.97 0Z" />
    <path fill="var(--brand-vscode)" d="M0 128L50.16 170.82L50.16 85.18L0 128Z" />
    <path fill="var(--brand-vscode)" d="M141.39 128L191.97 87.4L191.97 0L50.16 85.18L141.39 128L50.16 170.82L191.97 256L191.97 168.6L141.39 128Z" />
    <path fill="var(--brand-vscode-accent)" d="M191.97 256L256 212.4L256 43.6L191.97 87.4L191.97 168.6L141.39 128L191.97 87.4L191.97 0L50.16 85.18L141.39 128L50.16 170.82L191.97 256Z" opacity="0.25" />
  </svg>
);

// JetBrains logo SVG (for future support)
const JetBrainsIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 256 256" className={className}>
    <rect fill="#000" width="256" height="256" rx="20" />
    <path fill="#fff" d="M48 184h80v16H48v-16zm0-128h160v16H48V56z" />
    <text fill="#fff" fontSize="48" fontFamily="system-ui" x="48" y="140">JB</text>
  </svg>
);

interface ExtensionInstallCardProps {
  status: OnboardingStepStatus;
  onComplete: () => void;
  onSkip: () => void;
}

export function ExtensionInstallCard({ status, onComplete, onSkip }: ExtensionInstallCardProps) {
  const [copied, setCopied] = useState(false);
  const cliCommand = `code --install-extension ${VSCODE_EXTENSION_ID}`;

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(cliCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for non-HTTPS contexts
      console.warn('Clipboard API not available');
    }
  };

  return (
    <OnboardingCard
      title="Install VS Code Extension"
      description="Get the GAL extension for IDE-based sync and configuration visibility"
      icon={<Code className="w-6 h-6 text-[var(--accent)]" />}
      status={status}
      onComplete={onComplete}
      onSkip={onSkip}
      completeLabel="Done"
    >
      <div className="space-y-4">
        {/* Supported IDEs */}
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span>Supported IDEs:</span>
          <div className="flex items-center gap-1 px-2 py-1 bg-[var(--bg-tertiary)] rounded">
            <VSCodeIcon className="w-4 h-4" />
            <span>VS Code</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 bg-[var(--bg-tertiary)] rounded opacity-50">
            <JetBrainsIcon className="w-4 h-4" />
            <span>JetBrains</span>
            <span className="text-[10px] bg-[var(--accent-bg)] text-[var(--accent)] px-1 rounded">Soon</span>
          </div>
        </div>

        {/* VS Code install options */}
        <div className="p-4 bg-[var(--bg-tertiary)]/50 rounded-lg border border-[var(--border-subtle)]">
          <div className="flex items-center gap-3 mb-3">
            <VSCodeIcon className="w-8 h-8" />
            <div>
              <p className="font-medium text-[var(--text-primary)]">Visual Studio Code</p>
              <p className="text-xs text-[var(--text-muted)]">Automatic setup</p>
            </div>
          </div>

          <div className="space-y-3">
            <Link
              href={VSCODE_INSTALL_GUIDE_PATH}
              className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-vscode)] px-4 py-2 text-sm font-medium text-[var(--brand-vscode-text)] transition-opacity hover:opacity-90"
            >
              <span>Open install guide</span>
              <ArrowRight className="w-4 h-4" />
            </Link>

            <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
              <span>or via CLI:</span>
              <code className="bg-[var(--bg-tertiary)] px-2 py-1 rounded flex-1">{cliCommand}</code>
              <button
                onClick={copyCommand}
                className="p-1 hover:bg-[var(--bg-secondary)] rounded transition-colors"
                aria-label="Copy command"
                title="Copy command"
              >
                {copied ? (
                  <Check className="w-3 h-3 text-[var(--status-success)]" />
                ) : (
                  <Copy className="w-3 h-3 text-[var(--text-muted)]" />
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </OnboardingCard>
  );
}
