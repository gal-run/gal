import type { ScanResult } from '../domain/scan-result'
import type { AgentPlatform, DiscoveredConfigItem, DiscoveredConfigsCache } from '@gal/types'

/**
 * ScanResult repository interface
 * Implementations: FirestoreScanResultRepository (API), HttpScanResultRepository (CLI/Dashboard)
 */
export interface IScanResultRepository {
  // ─────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────

  /**
   * Find scan results for an organization
   */
  findByOrganization(orgName: string): Promise<ScanResult[]>

  /**
   * Find scan results for a specific repository
   */
  findByRepository(orgName: string, repoName: string): Promise<ScanResult[]>

  /**
   * Find latest scan result for a repository and platform
   */
  findLatestByRepo(
    orgName: string,
    repoName: string,
    platform: AgentPlatform
  ): Promise<ScanResult | null>

  /**
   * Find all scan results for a specific platform
   */
  findByPlatform(orgName: string, platform: AgentPlatform): Promise<ScanResult[]>

  /**
   * Check if a repository has been scanned recently (within last 24 hours)
   */
  hasRecentScan(
    orgName: string,
    repoName: string,
    platform: AgentPlatform
  ): Promise<boolean>

  // ─────────────────────────────────────────────────────────────────
  // Commands
  // ─────────────────────────────────────────────────────────────────

  /**
   * Save scan results for an organization
   */
  saveScanResults(orgName: string, results: ScanResult[]): Promise<void>

  /**
   * Save a single scan result
   */
  saveScanResult(orgName: string, result: ScanResult): Promise<void>

  /**
   * Delete scan results for a repository
   */
  deleteByRepository(orgName: string, repoName: string): Promise<void>

  /**
   * Delete all scan results for an organization
   */
  deleteByOrganization(orgName: string): Promise<void>

  // ─────────────────────────────────────────────────────────────────
  // Discovered Configs Cache (Performance Optimization)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get discovered configs from cache
   *
   * Returns null ONLY if cache doesn't exist (no data to show).
   * Returns data with isStale=true if cache is expired (data exists but may be outdated).
   * Returns data with isStale=false if cache is fresh.
   *
   * @param orgName Organization name
   * @param maxAgeMs Maximum age in milliseconds before cache is considered stale (default: 24 hours)
   */
  getDiscoveredConfigsCache(
    orgName: string,
    maxAgeMs?: number
  ): Promise<DiscoveredConfigsCache | null>

  /**
   * Save discovered configs cache after a scan
   * Handles Firestore 1MB document limit by storing metadata only for very large orgs
   *
   * @param orgName Organization name
   * @param configs Discovered config items to cache
   */
  saveDiscoveredConfigsCache(
    orgName: string,
    configs: DiscoveredConfigItem[]
  ): Promise<void>

  /**
   * Fetch content for specific config items from the content subcollection.
   * Used when the main cache is metadataOnly (org exceeded the 900KB Firestore limit).
   *
   * @param orgName Organization name
   * @param items Items to fetch content for (repo + path pairs)
   * @returns Map of "repo:path" → { content, hash }
   */
  getDiscoveredConfigsContentBatch(
    orgName: string,
    items: { repo: string; path: string }[]
  ): Promise<Map<string, { content: string; hash: string }>>

  /**
   * Invalidate (delete) the discovered configs cache for an organization
   * Called at start of sync to ensure fresh data
   *
   * @param orgName Organization name
   */
  invalidateDiscoveredConfigsCache(orgName: string): Promise<void>
}
