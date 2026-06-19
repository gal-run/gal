/**
 * MAL Signal Hooks Types (#1320)
 *
 * Types for signal emission and processing hooks for agent sessions.
 */

export interface MalSignalConfig {
  enabledTypes: string[];
  retentionDays: number;
}

export interface MalSignalSummary {
  totalCount: number;
  byType: Record<string, number>;
  recentSignals: number;
}

export interface MalSignalPayload {
  type: string;
  source: string;
  pattern?: string;
  context?: string;
  severity?: 'low' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, unknown>;
}

export interface MalSignalRecord {
  id: string;
  orgName: string;
  type: string;
  source: string;
  pattern?: string;
  context?: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  metadata?: Record<string, unknown>;
  ingestedAt: string;
  ingestedBy: string;
}

export interface MalSignalStats {
  totalSignals: number;
  byType: Record<string, number>;
  bySeverity: Record<string, number>;
  last24h: number;
  last7d: number;
}
