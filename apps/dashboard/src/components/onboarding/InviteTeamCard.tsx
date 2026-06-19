'use client'

import { useState } from 'react';
import { UserPlus, Copy, Check, Link as LinkIcon } from 'lucide-react';
import { OnboardingCard } from './OnboardingCard';
import type { OnboardingStepStatus } from '@gal/types';

interface InviteTeamCardProps {
  status: OnboardingStepStatus;
  onComplete: () => void;
  onSkip: () => void;
  inviteLink?: string;
  workspaceName?: string;
}

export function InviteTeamCard({ status, onComplete, onSkip, inviteLink, workspaceName }: InviteTeamCardProps) {
  const [copied, setCopied] = useState(false);

  // Generate invite link using current domain
  const displayLink = inviteLink || `${window.location.origin}/invite/${workspaceName || 'workspace'}`;

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(displayLink);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      console.warn('Clipboard API not available');
    }
  };

  return (
    <OnboardingCard
      title="Invite Your Team"
      description="Share your approved configuration with team members"
      icon={<UserPlus className="w-6 h-6 text-[var(--accent)]" />}
      status={status}
      onComplete={onComplete}
      onSkip={onSkip}
      completeLabel="Done"
    >
      <div className="space-y-4">
        <p className="text-sm text-[var(--text-secondary)]">
          Share this invite link with your team members. They'll be able to join your workspace and pull the approved configuration.
        </p>

        {/* Share link */}
        <div>
          <label className="block text-sm text-[var(--text-muted)] mb-2 flex items-center gap-2">
            <LinkIcon className="w-4 h-4" />
            Invite link
          </label>
          <div className="flex items-center gap-2 bg-[var(--bg-tertiary)] p-3 rounded-lg">
            <code className="flex-1 text-sm text-[var(--text-primary)] truncate">
              {displayLink}
            </code>
            <button
              onClick={copyLink}
              className="px-4 py-2 bg-[var(--accent)] text-[var(--text-on-accent)] rounded-lg hover:bg-[var(--accent-light)] transition-colors font-medium text-sm flex items-center gap-2"
              title="Copy link to clipboard"
            >
              {copied ? (
                <>
                  <Check className="w-4 h-4" />
                  Copied!
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  Copy Link
                </>
              )}
            </button>
          </div>
        </div>

        <p className="text-xs text-[var(--text-muted)]">
          Team members will be able to pull the approved configuration after joining.
        </p>
      </div>
    </OnboardingCard>
  );
}
