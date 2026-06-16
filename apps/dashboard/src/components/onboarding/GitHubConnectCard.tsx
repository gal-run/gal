'use client'

import { useEffect } from 'react';
import { Github, CheckCircle2 } from 'lucide-react';
import { OnboardingCard } from './OnboardingCard';
import type { OnboardingStepStatus } from '@gal/types';
import { api } from '@/lib/api';

// GitHub logo SVG
const GitHubIcon = ({ className }: { className?: string }) => (
  <svg viewBox="0 0 256 256" className={className}>
    <rect fill="var(--brand-github)" width="256" height="256" rx="20" />
    <path
      fill="var(--brand-github-text)"
      d="M128.001 30c-54.134 0-98 43.866-98 98 0 43.295 28.069 80.013 67.022 92.972 4.9.9 6.688-2.128 6.688-4.725 0-2.328-.085-8.496-.128-16.673-27.273 5.928-33.025-13.147-33.025-13.147-4.46-11.326-10.889-14.341-10.889-14.341-8.9-6.085.672-5.962.672-5.962 9.845.693 15.028 10.109 15.028 10.109 8.747 14.985 22.951 10.654 28.545 8.147.888-6.337 3.423-10.654 6.225-13.103-21.769-2.476-44.66-10.885-44.66-48.447 0-10.704 3.824-19.454 10.094-26.321-.992-2.485-4.373-12.458.992-25.963 0 0 8.232-2.637 26.959 10.053 7.819-2.174 16.204-3.261 24.535-3.3 8.331.039 16.717 1.126 24.548 3.3 18.703-12.69 26.923-10.053 26.923-10.053 5.378 13.505 1.997 23.478 1.005 25.963 6.283 6.867 10.082 15.617 10.082 26.321 0 37.655-22.928 45.932-44.76 48.357 3.522 3.024 6.656 9.006 6.656 18.147 0 13.103-.118 23.67-.118 26.881 0 2.622 1.763 5.676 6.738 4.713C197.967 207.975 226 171.277 226 128c0-54.134-43.866-98-97.999-98z"
    />
  </svg>
);

interface GitHubConnectCardProps {
  status: OnboardingStepStatus;
  onComplete: () => void;
  onSkip: () => void;
  isConnected?: boolean;
}

export function GitHubConnectCard({ status, onComplete, onSkip: _onSkip, isConnected }: GitHubConnectCardProps) {
  const handleConnect = () => {
    const installUrl = api.getGitHubAppInstallUrl('/onboarding');
    window.location.href = installUrl;
  };

  // Auto-complete when already connected
  useEffect(() => {
    if (isConnected && status === 'pending') {
      onComplete();
    }
  }, [isConnected, status, onComplete]);

  return (
    <OnboardingCard
      title="Connect GitHub"
      description="Connect your GitHub account to sync configurations"
      icon={<Github className="w-6 h-6 text-[var(--accent)]" />}
      status={isConnected ? 'completed' : status}
      autoDetect
    >
      <div className="space-y-4">
        {/* Supported git providers */}
        <div className="flex items-center gap-2 text-xs text-[var(--text-muted)]">
          <span>Supported providers:</span>
          <div className="flex items-center gap-1 px-2 py-1 bg-[var(--bg-tertiary)] rounded">
            <GitHubIcon className="w-4 h-4" />
            <span>GitHub</span>
          </div>
          <div className="flex items-center gap-1 px-2 py-1 bg-[var(--bg-tertiary)] rounded opacity-50">
            <span className="text-sm">🦊</span>
            <span>GitLab</span>
            <span className="text-[10px] bg-[var(--accent-bg)] text-[var(--accent)] px-1 rounded">Soon</span>
          </div>
        </div>

        {/* GitHub connection card */}
        <div className="p-4 bg-[var(--bg-tertiary)]/50 rounded-lg border border-[var(--border-subtle)]">
          <div className="flex items-center gap-3 mb-3">
            <GitHubIcon className="w-8 h-8" />
            <div>
              <p className="font-medium text-[var(--text-primary)]">GitHub</p>
              <p className="text-xs text-[var(--text-muted)]">
                {isConnected ? 'Connected' : 'Automatic setup'}
              </p>
            </div>
          </div>

          {isConnected ? (
            <div className="flex items-center gap-2 text-sm text-[var(--status-success)] bg-[var(--status-success-light)] px-3 py-2 rounded-lg">
              <CheckCircle2 className="w-4 h-4" />
              <span>GitHub connected successfully</span>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-sm text-[var(--text-secondary)]">
                Install the GAL GitHub App to enable configuration discovery and sync.
              </p>
              <button
                onClick={handleConnect}
                className="inline-flex items-center gap-2 rounded-lg bg-[var(--brand-github)] px-4 py-2 font-medium text-[var(--brand-github-text)] transition-opacity hover:opacity-90"
              >
                <Github className="w-4 h-4" />
                Install GitHub App
              </button>
            </div>
          )}
        </div>
      </div>
    </OnboardingCard>
  );
}
