/**
 * Onboarding Types
 *
 * Feature: Guided Setup Flow After Sign-In (GitHub Issue #1044)
 * Spec: openspec/specs/1044-onboarding-flow/spec.md
 * Data Model: openspec/specs/1044-onboarding-flow/data-model.md
 */

export type OnboardingStepStatus = 'pending' | 'completed' | 'skipped';
export type OnboardingOverallStatus = 'not_started' | 'in_progress' | 'completed' | 'skipped';
export type OnboardingStep = 'cli' | 'extension' | 'github' | 'config';

export interface OnboardingStatus {
  cliStatus: OnboardingStepStatus;
  cliCompletedAt: Date | null;
  extensionStatus: OnboardingStepStatus;
  extensionCompletedAt: Date | null;
  githubStatus: OnboardingStepStatus;
  githubCompletedAt: Date | null;
  configStatus: OnboardingStepStatus;
  configCompletedAt: Date | null;
  overallStatus: OnboardingOverallStatus;
  completedAt: Date | null;
  skippedAt: Date | null;
  updatedAt: Date;
}

export interface OnboardingStepUpdateRequest {
  step: OnboardingStep;
  status: 'completed' | 'skipped';
}

export interface OnboardingStepUpdateResponse {
  step: OnboardingStep;
  status: OnboardingStepStatus;
  completedAt: string | null;
  overallStatus: OnboardingOverallStatus;
}

export interface OnboardingVerifyCliResponse {
  verified: boolean;
  lastSyncAt: string | null;
  cliVersion: string | null;
}

export interface OnboardingSkipResponse {
  overallStatus: OnboardingOverallStatus;
  skippedAt: string;
  skippedSteps: OnboardingStep[];
}

export interface OnboardingCompleteResponse {
  overallStatus: OnboardingOverallStatus;
  completedAt: string;
}
