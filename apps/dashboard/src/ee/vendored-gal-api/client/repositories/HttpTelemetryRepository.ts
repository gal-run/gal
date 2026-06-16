/**
 * HTTP Repository Adapter for Telemetry Operations
 *
 * Implements ITelemetryRepository using HTTP calls to the API
 * Used by CLI and VS Code extension to send telemetry without direct Firestore access
 */

import type {
  ITelemetryRepository,
  TelemetryEvent,
  TelemetryQueryOptions,
  InstallationStats,
  OverallStats,
  TelemetryMetrics,
  TimeRange,
  FeedbackPayload,
} from '@gal/core'
import type { EnhancedTelemetryEvent } from '@gal/types'
import { HttpClient, type HttpClientConfig } from '../HttpClient'

export class HttpTelemetryRepository extends HttpClient implements ITelemetryRepository {
  constructor(config: HttpClientConfig) {
    super(config)
  }

  async storeEvents(events: TelemetryEvent[], schemaVersion?: string): Promise<number> {
    const response = await this.fetchJson<{ stored: number }>(
      '/telemetry/events',
      {
        method: 'POST',
        body: JSON.stringify({ events, schemaVersion }),
      }
    )
    return response.stored
  }

  async storeFeedback(feedback: FeedbackPayload): Promise<string> {
    const response = await this.fetchJson<{ id: string }>(
      '/telemetry/feedback',
      {
        method: 'POST',
        body: JSON.stringify(feedback),
      }
    )
    return response.id
  }

  // ─────────────────────────────────────────────────────────────────
  // Server-Only Methods (throw descriptive errors)
  // ─────────────────────────────────────────────────────────────────

  async updateInstallationStats(
    _installationId: string,
    _eventCounts: Partial<Record<string, number>>
  ): Promise<void> {
    throw new Error('updateInstallationStats() is server-side only (not implemented in HTTP client)')
  }

  async getRecentEvents(
    _installationId: string,
    _options?: TelemetryQueryOptions
  ): Promise<EnhancedTelemetryEvent[]> {
    throw new Error('getRecentEvents() is server-side only (not implemented in HTTP client)')
  }

  async getInstallationStats(_installationId: string): Promise<InstallationStats | null> {
    throw new Error('getInstallationStats() is server-side only (not implemented in HTTP client)')
  }

  async getOverallStats(): Promise<OverallStats> {
    throw new Error('getOverallStats() is server-side only (not implemented in HTTP client)')
  }

  async queryEvents(_options: TelemetryQueryOptions): Promise<EnhancedTelemetryEvent[]> {
    throw new Error('queryEvents() is server-side only (not implemented in HTTP client)')
  }

  async getMetrics(_timeRange: TimeRange): Promise<TelemetryMetrics> {
    throw new Error('getMetrics() is server-side only (not implemented in HTTP client)')
  }
}
