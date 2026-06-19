'use client'

import { useState } from 'react';
import { FileText, ExternalLink } from 'lucide-react';
import { OnboardingCard } from './OnboardingCard';
import type { OnboardingStepStatus } from '@gal/types';
import { GAL_TERMS_URL, GAL_PRIVACY_URL } from '@gal/types';
import { api } from '../../lib/api';

export interface LegalAcceptanceCardProps {
  status: OnboardingStepStatus;
  onComplete: () => void;
  onSkip: () => void;
}

export function LegalAcceptanceCard({ status, onComplete, onSkip }: LegalAcceptanceCardProps) {
  const [agreed, setAgreed] = useState(false);

  const handleComplete = async () => {
    await api.acceptTerms('1.0');
    onComplete();
  };

  return (
    <OnboardingCard
      title="Review & Accept Terms"
      description="Required to use GAL"
      icon={<FileText className="w-6 h-6 text-[var(--accent)]" />}
      status={status}
      onComplete={handleComplete}
      onSkip={onSkip}
      completeLabel="Accept & Continue"
      completeDisabled={!agreed}
    >
      <div className="space-y-4">
        <p className="text-sm text-[var(--text-secondary)]">
          Please review the following documents before continuing:
        </p>

        <div className="space-y-2">
          <a
            href={GAL_TERMS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-[var(--accent)] hover:underline"
          >
            Terms of Service
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <div className="space-y-2">
          <a
            href={GAL_PRIVACY_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-[var(--accent)] hover:underline"
          >
            Privacy Policy
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>

        <label className="flex items-start gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 w-4 h-4 rounded accent-[var(--accent)]"
          />
          <span className="text-sm text-[var(--text-secondary)]">
            I have read and agree to the Terms of Service and Privacy Policy
          </span>
        </label>
      </div>
    </OnboardingCard>
  );
}
