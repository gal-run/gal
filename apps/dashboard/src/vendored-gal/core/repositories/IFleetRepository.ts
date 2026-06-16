/**
 * Fleet Repository Interface (GAL-99)
 *
 * Repository for managing fleet developer devices and compliance tracking.
 * Implementations: FirestoreFleetRepository (API)
 */

/**
 * Fleet Developer - Represents a registered developer device
 */
export interface FleetDeveloper {
  id: string
  organizationId: string
  email: string
  machineId: string
  hostname?: string
  registeredAt: Date
  lastCheckIn: Date
  enforcementStatus: EnforcementStatus
  isCompliant: boolean
}

/**
 * Enforcement Status - Tracks enforcement tool installation and configuration
 */
export type EnforcementMode = 'off' | 'warn' | 'block' | 'unknown'

export interface EnforcementRuntimeStatus {
  srtInstalled?: boolean
  srtSettingsPresent?: boolean
  compiledRulesPresent?: boolean
  preToolUseHookPresent?: boolean
  srtActive?: boolean
}

export interface EnforcementStatus {
  installed: boolean
  version: string
  policyVersion: string
  platforms: string[]
  mode?: EnforcementMode
  runtime?: EnforcementRuntimeStatus
}

/**
 * Fleet Registration Request - Data needed to register a new device
 */
export interface FleetRegistrationRequest {
  email: string
  machineId: string
  hostname?: string
  enforcementStatus: EnforcementStatus
}

/**
 * Fleet Heartbeat Request - Data sent during check-in
 */
export interface FleetHeartbeatRequest {
  developerId: string
  machineId: string
  enforcementStatus: EnforcementStatus
}

/**
 * Fleet Status Response - Current enrollment and compliance status
 */
export interface FleetStatusResponse {
  enrolled: boolean
  developerId?: string
  organizationId?: string
  lastCheckIn?: Date
  enforcementStatus?: EnforcementStatus
  isCompliant?: boolean
  nextCheckInDue?: Date
}

/**
 * Fleet List Response - Summary of all developers in fleet
 */
export interface FleetListResponse {
  developers: FleetDeveloper[]
  summary: {
    total: number
    compliant: number
    nonCompliant: number
    installedCount: number
    avgPlatforms: number
  }
}

/**
 * Fleet Report Response - Comprehensive compliance report
 */
export interface FleetReportResponse {
  organizationId: string
  organizationName: string
  generatedAt: Date
  summary: {
    totalDevelopers: number
    compliantDevelopers: number
    nonCompliantDevelopers: number
    complianceRate: number
    enforcementCoverage: number
  }
  platformBreakdown: Record<string, number>
  recentActivity: {
    registrations24h: number
    checkIns24h: number
    staleDevices: number
  }
  developers: FleetDeveloper[]
}

export interface IFleetRepository {
  // ─────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────

  /**
   * Get developer by ID
   */
  findById(developerId: string): Promise<FleetDeveloper | null>

  /**
   * Find developer by email and machine ID
   */
  findByEmailAndMachine(
    organizationId: string,
    email: string,
    machineId: string
  ): Promise<FleetDeveloper | null>

  /**
   * List all developers in an organization's fleet
   * @param statusFilter - Filter by compliance status
   */
  listByOrganization(
    organizationId: string,
    statusFilter?: 'compliant' | 'non-compliant' | 'all'
  ): Promise<FleetDeveloper[]>

  /**
   * Count developers in an organization
   */
  countByOrganization(organizationId: string): Promise<number>

  /**
   * Find stale devices (no check-in within threshold)
   */
  findStaleDevices(
    organizationId: string,
    thresholdMs: number
  ): Promise<FleetDeveloper[]>

  /**
   * Find recently registered devices (within time window)
   */
  findRecentRegistrations(
    organizationId: string,
    sinceDate: Date
  ): Promise<FleetDeveloper[]>

  /**
   * Find recent check-ins (within time window)
   */
  findRecentCheckIns(
    organizationId: string,
    sinceDate: Date
  ): Promise<FleetDeveloper[]>

  // ─────────────────────────────────────────────────────────────────
  // Commands
  // ─────────────────────────────────────────────────────────────────

  /**
   * Register a new developer device
   * @returns Developer ID
   */
  register(
    organizationId: string,
    registration: FleetRegistrationRequest
  ): Promise<string>

  /**
   * Update existing developer registration
   */
  update(
    developerId: string,
    updates: Partial<FleetDeveloper>
  ): Promise<void>

  /**
   * Update check-in timestamp and enforcement status
   */
  updateCheckIn(
    developerId: string,
    enforcementStatus: EnforcementStatus
  ): Promise<void>

  /**
   * Remove developer from fleet
   */
  delete(developerId: string): Promise<void>
}
