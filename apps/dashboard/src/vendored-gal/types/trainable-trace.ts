import type { Session, WorkItem } from './index.js';

export type TrainableTraceSchemaVersion = 'v1';

/**
 * Envelope format produced by packages/background-agent-runner when it archives
 * RTDB session events to Firebase Storage (sessions/{sessionId}/events.jsonl).
 *
 * Notes:
 * - The inner event payloads are "runtime normalized" events (tool_call, tool_result, text, etc)
 *   plus runner-added metadata (sequence, serverTimestamp).
 * - Timestamps are ISO strings because the runner serializes Date objects for Firebase.
 */
export interface ArchivedRtdbEventEnvelope {
  /** RTDB push key */
  _key: string;

  /** Event type (e.g. "tool_call", "tool_result", "text", "error", "complete", "stats") */
  type: string;

  /** ISO timestamp (string) */
  timestamp?: string;

  /** Monotonic sequence number within the session (runner-managed) */
  sequence?: number;

  /** RTDB server timestamp (ms since epoch) */
  serverTimestamp?: number;

  /** Provider-specific fields (toolName, toolInput, usage, etc) */
  [key: string]: unknown;
}

export interface TrainableTraceRedaction {
  applied: boolean;
  /** Version string for redaction rules so datasets are reproducible */
  rulesVersion: string;
}

export interface TrainableTraceSummary {
  toolCallCount: number;
  toolResultCount: number;
  errorCount: number;
  completeCount: number;
  /** Aggregated usage across stats events (best-effort). */
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  providers?: string[];
}

/**
 * Trainable trace record intended for dataset building / evaluation.
 *
 * This is NOT the same thing as anonymous CLI telemetry; it is richer and
 * should be produced only from opt-in sources and with redaction applied.
 */
export interface TrainableTraceV1 {
  schemaVersion: 'v1';
  traceId: string;
  exportedAt: string;
  organizationId: string;

  session: Session;
  workItem?: WorkItem;

  source: {
    storageBucket: string;
    eventsPath: string;
    agentSessionPath?: string;
  };

  redaction: TrainableTraceRedaction;
  summary: TrainableTraceSummary;

  events: ArchivedRtdbEventEnvelope[];
}

