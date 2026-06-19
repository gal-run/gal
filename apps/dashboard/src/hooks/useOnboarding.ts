'use client'

import { useState, useEffect, useCallback } from 'react';
import type { OnboardingStatus, OnboardingStep } from '@gal/types';
import { isDemoMode } from '@/lib/demo-guard';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

const DEMO_ONBOARDING_STATUS: OnboardingStatus = {
  cliStatus: 'completed',
  cliCompletedAt: new Date('2026-03-10T09:00:00Z'),
  extensionStatus: 'completed',
  extensionCompletedAt: new Date('2026-03-10T09:05:00Z'),
  githubStatus: 'completed',
  githubCompletedAt: new Date('2026-03-10T09:10:00Z'),
  configStatus: 'completed',
  configCompletedAt: new Date('2026-03-10T09:15:00Z'),
  overallStatus: 'completed',
  completedAt: new Date('2026-03-10T09:15:00Z'),
  skippedAt: null,
  updatedAt: new Date('2026-03-10T09:15:00Z'),
}

interface UseOnboardingReturn {
  status: OnboardingStatus | null;
  loading: boolean;
  error: string | null;
  updateStep: (step: OnboardingStep, stepStatus: 'completed' | 'skipped') => Promise<void>;
  completeOnboarding: () => Promise<void>;
  skipOnboarding: () => Promise<void>;
  refresh: () => Promise<void>;
}

export function useOnboarding(): UseOnboardingReturn {
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = useCallback(async () => {
    if (isDemoMode()) {
      setStatus(DEMO_ONBOARDING_STATUS);
      setError(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/onboarding/status`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to fetch onboarding status');
      }

      const data = await response.json();

      // Convert date strings to Date objects
      const statusWithDates: OnboardingStatus = {
        ...data,
        cliCompletedAt: data.cliCompletedAt ? new Date(data.cliCompletedAt) : null,
        extensionCompletedAt: data.extensionCompletedAt ? new Date(data.extensionCompletedAt) : null,
        githubCompletedAt: data.githubCompletedAt ? new Date(data.githubCompletedAt) : null,
        configCompletedAt: data.configCompletedAt ? new Date(data.configCompletedAt) : null,
        completedAt: data.completedAt ? new Date(data.completedAt) : null,
        skippedAt: data.skippedAt ? new Date(data.skippedAt) : null,
        updatedAt: new Date(data.updatedAt),
      };

      setStatus(statusWithDates);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch onboarding status');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  const updateStep = useCallback(async (step: OnboardingStep, stepStatus: 'completed' | 'skipped') => {
    if (isDemoMode()) {
      setStatus((current) => {
        const next = current ? { ...current } : { ...DEMO_ONBOARDING_STATUS };
        const completedAt = stepStatus === 'completed' ? new Date() : null;

        if (step === 'cli') {
          next.cliStatus = stepStatus;
          next.cliCompletedAt = completedAt;
        } else if (step === 'extension') {
          next.extensionStatus = stepStatus;
          next.extensionCompletedAt = completedAt;
        } else if (step === 'github') {
          next.githubStatus = stepStatus;
          next.githubCompletedAt = completedAt;
        } else if (step === 'config') {
          next.configStatus = stepStatus;
          next.configCompletedAt = completedAt;
        }

        next.updatedAt = new Date();
        return next;
      });
      return;
    }

    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/onboarding/step`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify({ step, status: stepStatus }),
      });

      if (!response.ok) {
        throw new Error('Failed to update onboarding step');
      }

      // Refresh status after update
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update step');
      throw err;
    }
  }, [fetchStatus]);

  const completeOnboarding = useCallback(async () => {
    if (isDemoMode()) {
      setStatus({
        ...DEMO_ONBOARDING_STATUS,
        completedAt: new Date(),
        updatedAt: new Date(),
      });
      return;
    }

    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/onboarding/complete`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to complete onboarding');
      }

      // Refresh status after completion
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to complete onboarding');
      throw err;
    }
  }, [fetchStatus]);

  const skipOnboarding = useCallback(async () => {
    if (isDemoMode()) {
      setStatus({
        ...DEMO_ONBOARDING_STATUS,
        overallStatus: 'skipped',
        skippedAt: new Date(),
        updatedAt: new Date(),
      });
      return;
    }

    setError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/api/onboarding/skip`, {
        method: 'POST',
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error('Failed to skip onboarding');
      }

      // Refresh status after skipping
      await fetchStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to skip onboarding');
      throw err;
    }
  }, [fetchStatus]);

  const refresh = useCallback(async () => {
    await fetchStatus();
  }, [fetchStatus]);

  return {
    status,
    loading,
    error,
    updateStep,
    completeOnboarding,
    skipOnboarding,
    refresh,
  };
}
