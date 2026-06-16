'use client'

import { useState } from 'react';
import { Users, ArrowRight, CheckCircle2 } from 'lucide-react';
import { OnboardingCard } from './OnboardingCard';
import type { OnboardingStepStatus } from '@gal/types';

interface JoinWorkspaceCardProps {
  status: OnboardingStepStatus;
  onComplete: (workspaceId?: string) => void;
  onSkip: () => void;
  currentWorkspace?: string;
}

export function JoinWorkspaceCard({ status, onComplete, onSkip: _onSkip, currentWorkspace }: JoinWorkspaceCardProps) {
  const [inviteCode, setInviteCode] = useState('');

  const handleJoin = () => {
    if (!inviteCode.trim()) return;
    // Workspace joining is handled by GitHub App installation
    // This just marks the onboarding step as acknowledged
    onComplete(inviteCode);
  };

  const hasWorkspace = !!currentWorkspace;

  return (
    <OnboardingCard
      title="Join Your Team's Workspace"
      description="Enter the invite code from your admin to join your workspace"
      icon={<Users className="w-6 h-6 text-[var(--accent)]" />}
      status={hasWorkspace ? 'completed' : status}
      autoDetect={hasWorkspace}
    >
      <div className="space-y-4">
        {hasWorkspace ? (
          <div className="p-4 bg-[var(--status-success-light)] border border-[var(--status-success-text)]/30 rounded-lg">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-[var(--status-success)]" />
              <div>
                <p className="font-medium text-[var(--text-primary)]">Already in a workspace</p>
                <p className="text-sm text-[var(--text-muted)]">{currentWorkspace}</p>
              </div>
            </div>
          </div>
        ) : (
          <>
            <p className="text-sm text-[var(--text-secondary)]">
              Ask your admin for an invite link or code. If you don't have one, you can create your own workspace.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-sm text-[var(--text-muted)] mb-1">
                  Invite Code
                </label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="Enter invite code..."
                    className="flex-1 px-4 py-2 bg-[var(--bg-tertiary)] border border-[var(--border-subtle)] rounded-lg text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:border-[var(--accent)]"
                  />
                  <button
                    onClick={handleJoin}
                    disabled={!inviteCode.trim()}
                    className="px-4 py-2 bg-[var(--accent)] text-[var(--text-on-accent)] rounded-lg hover:bg-[var(--accent-light)] transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    Join
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <p className="text-xs text-[var(--text-muted)]">
                Don't have an invite? <button className="text-[var(--accent)] hover:underline">Create a new workspace</button>
              </p>
            </div>
          </>
        )}
      </div>
    </OnboardingCard>
  );
}
