/**
 * SDLC Telemetry Value Object
 *
 * Structured telemetry for tracking SDLC stage transitions,
 * performance metrics, and debugging information.
 */

import type {
  SdlcLifecycleStateValue,
  SdlcStageTransition,
  SdlcStageMetrics,
  SdlcProgressSnapshot,
} from '@gal/types';
import { SdlcLifecycleState } from './SdlcLifecycleState';

// Re-export types for convenience
export type {
  SdlcStageTransition,
  SdlcStageMetrics,
  SdlcProgressSnapshot,
};

export class SdlcTelemetry {
  /**
   * Create a stage transition event
   */
  static createTransition(
    workItemId: string,
    fromState: SdlcLifecycleState | null,
    toState: SdlcLifecycleState,
    durationMs?: number,
    metadata?: Record<string, unknown>,
    sessionId?: string
  ): SdlcStageTransition {
    return {
      workItemId,
      sessionId,
      fromState: fromState?.toString() ?? null,
      toState: toState.toString(),
      timestamp: new Date(),
      durationMs,
      metadata,
    };
  }

  /**
   * Create stage metrics snapshot
   */
  static createMetrics(
    workItemId: string,
    currentState: SdlcLifecycleState,
    timeInStateMs: number,
    transitionCount: number,
    isBlocked: boolean,
    lastTransitionAt: Date,
    totalBlockedTimeMs?: number
  ): SdlcStageMetrics {
    return {
      workItemId,
      currentState: currentState.toString(),
      timeInStateMs,
      transitionCount,
      isBlocked,
      totalBlockedTimeMs,
      lastTransitionAt,
      snapshotAt: new Date(),
    };
  }

  /**
   * Create progress snapshot for dashboard
   */
  static createProgressSnapshot(
    workItemId: string,
    organizationId: string,
    currentState: SdlcLifecycleState | null,
    completedStates: SdlcLifecycleState[],
    blockerType: string | null,
    isBlocked: boolean,
    issueNumber?: string,
    prNumber?: string,
    branchName?: string
  ): SdlcProgressSnapshot {
    return {
      workItemId,
      organizationId,
      currentState: currentState?.toString() ?? null,
      completedStates: completedStates.map((s) => s.toString()),
      blockerType,
      isBlocked,
      issueNumber,
      prNumber,
      branchName,
      timestamp: new Date(),
    };
  }

  /**
   * Calculate average time per state from transitions
   */
  static calculateAverageStateTime(
    transitions: SdlcStageTransition[]
  ): Map<SdlcLifecycleStateValue, number> {
    const stateTimes = new Map<SdlcLifecycleStateValue, number[]>();

    for (const transition of transitions) {
      if (transition.fromState != null && transition.durationMs != null) {
        const times = stateTimes.get(transition.fromState) ?? [];
        times.push(transition.durationMs);
        stateTimes.set(transition.fromState, times);
      }
    }

    const averages = new Map<SdlcLifecycleStateValue, number>();
    for (const [state, times] of stateTimes) {
      const avg = times.reduce((sum, t) => sum + t, 0) / times.length;
      averages.set(state, Math.round(avg));
    }

    return averages;
  }

  /**
   * Identify bottleneck states (longest average duration)
   */
  static identifyBottlenecks(
    transitions: SdlcStageTransition[],
    topN: number = 3
  ): Array<{ state: SdlcLifecycleStateValue; avgDurationMs: number }> {
    const averages = this.calculateAverageStateTime(transitions);
    return Array.from(averages.entries())
      .map(([state, avgDurationMs]) => ({ state, avgDurationMs }))
      .sort((a, b) => b.avgDurationMs - a.avgDurationMs)
      .slice(0, topN);
  }
}
