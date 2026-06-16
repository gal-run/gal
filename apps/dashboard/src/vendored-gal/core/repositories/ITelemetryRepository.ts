import type {
  EnhancedTelemetryEvent,
  LegacyTelemetryEvent,
  TelemetryEventType,
} from '@gal/types';

/**
 * Union type for telemetry events (supports both v1 and v2 formats)
 */
export type TelemetryEvent = EnhancedTelemetryEvent | LegacyTelemetryEvent;

/**
 * Query options for retrieving telemetry events
 */
export interface TelemetryQueryOptions {
  /** Limit number of results */
  limit?: number;

  /** Filter by event types */
  eventTypes?: TelemetryEventType[];

  /** Start time for range query */
  startTime?: Date;

  /** End time for range query */
  endTime?: Date;

  /** Order by timestamp (default: desc) */
  orderBy?: 'asc' | 'desc';
}

/**
 * Time range for metrics queries
 */
export interface TimeRange {
  /** Start of time range */
  start: Date;

  /** End of time range */
  end: Date;
}

/**
 * Aggregated telemetry metrics
 */
export interface TelemetryMetrics {
  /** Total number of events in the time range */
  totalEvents: number;

  /** Events grouped by type */
  eventsByType: Record<string, number>;

  /** Number of unique installations */
  uniqueInstallations: number;

  /** Average events per installation */
  avgEventsPerInstallation: number;
}

/**
 * Installation statistics
 */
export interface InstallationStats {
  /** Installation ID */
  installationId: string;

  /** First time this installation was seen */
  firstSeen: Date;

  /** Last time this installation was seen */
  lastSeen: Date;

  /** Total events from this installation */
  totalEvents: number;

  /** Event counts by type */
  eventCounts: Record<TelemetryEventType, number>;
}

/**
 * Feedback payload structure
 */
export interface FeedbackPayload {
  installationId: string;
  userId?: string;
  rating: number;
  comment?: string;
  context?: {
    command?: string;
    errorType?: string;
    errorMessage?: string;
    cliVersion?: string;
    platform?: string;
  };
}

/**
 * Overall telemetry statistics
 */
export interface OverallStats {
  /** Total number of installations */
  totalInstallations: number;

  /** Total events across all installations */
  totalEvents: number;

  /** Events grouped by type */
  eventsByType: Record<string, number>;

  /** Number of installations active in last 24 hours */
  recentActiveInstallations: number;
}

/**
 * Telemetry repository interface
 * Implementations: FirestoreTelemetryRepository (API), HttpTelemetryRepository (CLI/Dashboard)
 */
export interface ITelemetryRepository {
  // ─────────────────────────────────────────────────────────────────
  // Commands (Event Storage)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Store a batch of telemetry events
   * Supports both v1 (legacy) and v2 (enhanced) formats
   *
   * @param events Array of events to store (max 100)
   * @param schemaVersion Optional schema version hint
   * @returns Number of events stored
   */
  storeEvents(events: TelemetryEvent[], schemaVersion?: string): Promise<number>;

  /**
   * Update aggregated statistics for an installation
   *
   * @param installationId Installation UUID
   * @param eventCounts Map of event types to counts
   */
  updateInstallationStats(
    installationId: string,
    eventCounts: Partial<Record<TelemetryEventType, number>>
  ): Promise<void>;

  /**
   * Store user feedback
   *
   * @param feedback Feedback payload
   * @returns Feedback document ID
   */
  storeFeedback(feedback: FeedbackPayload): Promise<string>;

  // ─────────────────────────────────────────────────────────────────
  // Queries (Event Retrieval)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get recent events for an installation
   * Returns events in v2 (enhanced) format
   *
   * @param installationId Installation UUID
   * @param options Query options
   * @returns Array of recent events
   */
  getRecentEvents(
    installationId: string,
    options?: TelemetryQueryOptions
  ): Promise<EnhancedTelemetryEvent[]>;

  /**
   * Get aggregated stats for an installation
   *
   * @param installationId Installation UUID
   * @returns Installation stats or null if not found
   */
  getInstallationStats(installationId: string): Promise<InstallationStats | null>;

  /**
   * Get overall telemetry statistics
   * Used for admin dashboard
   *
   * @returns Aggregated statistics across all installations
   */
  getOverallStats(): Promise<OverallStats>;

  /**
   * Query events across installations (admin only)
   *
   * @param options Query options
   * @returns Array of events matching criteria
   */
  queryEvents(options: TelemetryQueryOptions): Promise<EnhancedTelemetryEvent[]>;

  /**
   * Get aggregated metrics for a time range
   *
   * @param timeRange Time range for metrics
   * @returns Aggregated metrics
   */
  getMetrics(timeRange: TimeRange): Promise<TelemetryMetrics>;
}
