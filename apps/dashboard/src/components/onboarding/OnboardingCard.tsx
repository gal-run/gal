'use client'

import { type ReactNode } from 'react';
import { CheckCircle2, Clock, XCircle } from 'lucide-react';
import type { OnboardingStepStatus } from '@gal/types';

interface OnboardingCardProps {
  title: string;
  description: string;
  icon: ReactNode;
  status: OnboardingStepStatus;
  children: ReactNode;
  onComplete?: () => void;
  onSkip?: () => void;
  /** Hide manual buttons - use for steps with auto-detection */
  autoDetect?: boolean;
  /** Custom label for complete button */
  completeLabel?: string;
  /** Disable the complete button (e.g. until a prerequisite is checked) */
  completeDisabled?: boolean;
}

export function OnboardingCard({
  title,
  description,
  icon,
  status,
  children,
  onComplete,
  onSkip,
  autoDetect,
  completeLabel,
  completeDisabled,
}: OnboardingCardProps) {
  const getStatusIcon = () => {
    switch (status) {
      case 'completed':
        return <CheckCircle2 className="w-5 h-5 text-[var(--status-success)]" />;
      case 'skipped':
        return <XCircle className="w-5 h-5 text-[var(--text-secondary)]" />;
      case 'pending':
        return <Clock className="w-5 h-5 text-[var(--accent)]" />;
    }
  };

  const getStatusLabel = () => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'skipped':
        return 'Skipped';
      case 'pending':
        return 'Pending';
    }
  };

  return (
    <div className="glass-card p-6 transition-all duration-200">
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="icon-container green">
            {icon}
          </div>
          <div>
            <h3 className="text-lg font-semibold text-[var(--text-primary)]">{title}</h3>
            <p className="text-sm text-[var(--text-muted)] mt-1">{description}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {getStatusIcon()}
          <span className="text-sm text-[var(--text-secondary)]">{getStatusLabel()}</span>
        </div>
      </div>

      <div className="mb-4">
        {children}
      </div>

      {status === 'pending' && !autoDetect && (onComplete || onSkip) && (
        <div className="flex gap-3">
          {onComplete && (
            <button
              onClick={onComplete}
              disabled={completeDisabled}
              className="px-4 py-2 bg-[var(--accent)] text-[var(--text-on-accent)] rounded-lg hover:bg-[var(--accent-light)] transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {completeLabel || 'Mark complete'}
            </button>
          )}
          {onSkip && (
            <button
              onClick={onSkip}
              className="px-4 py-2 bg-[var(--bg-tertiary)] text-[var(--text-secondary)] rounded-lg hover:bg-[var(--bg-tertiary)]/80 transition-colors"
            >
              Skip
            </button>
          )}
        </div>
      )}
    </div>
  );
}
