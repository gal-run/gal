/**
 * HTTP Repository Adapter for Fleet Operations
 *
 * Implements IFleetRepository using HTTP calls to the API
 * Used by CLI and VS Code extension to access fleet data without direct Firestore access
 */

import type {
  FleetDeveloper,
  IFleetRepository,
  FleetRegistrationRequest,
  EnforcementStatus,
  FleetStatusResponse,
  FleetListResponse,
  FleetReportResponse,
} from '@gal/core'
import { HttpClient, type HttpClientConfig } from '../HttpClient'

export class HttpFleetRepository extends HttpClient implements IFleetRepository {
  constructor(config: HttpClientConfig) {
    super(config)
  }

  async register(
    orgName: string,
    registration: FleetRegistrationRequest
  ): Promise<string> {
    const response = await this.fetchJson<{ developerId: string; organizationId: string }>(
      `/organizations/${orgName}/fleet/register`,
      {
        method: 'POST',
        body: JSON.stringify(registration),
      }
    )
    return response.developerId
  }

  async listByOrganization(
    orgName: string,
    statusFilter?: 'compliant' | 'non-compliant' | 'all'
  ): Promise<FleetDeveloper[]> {
    const params = new URLSearchParams()
    if (statusFilter && statusFilter !== 'all') {
      params.set('status', statusFilter)
    }

    const url = `/organizations/${orgName}/fleet${params.toString() ? '?' + params.toString() : ''}`
    const response = await this.fetchJson<FleetListResponse>(url)

    return response.developers.map(dev => this.mapToFleetDeveloper(dev))
  }

  async delete(developerId: string): Promise<void> {
    await this.fetch(`/fleet/developers/${developerId}`, {
      method: 'DELETE',
    })
  }

  // ─────────────────────────────────────────────────────────────────
  // CLI-Specific Convenience Methods (not in interface)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Send a heartbeat/check-in for a developer
   */
  async fleetHeartbeat(heartbeat: {
    developerId: string
    machineId: string
    enforcementStatus: EnforcementStatus
  }): Promise<FleetStatusResponse> {
    const response = await this.fetchJson<FleetStatusResponse>(
      '/fleet/heartbeat',
      {
        method: 'POST',
        body: JSON.stringify(heartbeat),
      }
    )
    return response
  }

  /**
   * Get fleet status for a developer
   */
  async fleetStatus(developerId: string): Promise<FleetStatusResponse> {
    const response = await this.fetchJson<FleetStatusResponse>(
      `/fleet/developers/${developerId}/status`
    )
    return response
  }

  /**
   * Generate fleet compliance report (admin)
   */
  async fleetReport(orgName: string): Promise<FleetReportResponse> {
    const response = await this.fetchJson<FleetReportResponse>(
      `/organizations/${orgName}/fleet/report`
    )
    return response
  }

  /**
   * List all developers in an organization's fleet (admin)
   */
  async fleetList(
    orgName: string,
    status: 'compliant' | 'non-compliant' | 'all' = 'all'
  ): Promise<FleetListResponse> {
    const params = new URLSearchParams()
    if (status !== 'all') params.set('status', status)

    const url = `/organizations/${orgName}/fleet${params.toString() ? '?' + params.toString() : ''}`
    const response = await this.fetchJson<FleetListResponse>(url)
    return response
  }

  // ─────────────────────────────────────────────────────────────────
  // Server-Only Methods (throw descriptive errors)
  // ─────────────────────────────────────────────────────────────────

  async findById(_developerId: string): Promise<FleetDeveloper | null> {
    throw new Error('findById() is server-side only (not implemented in HTTP client)')
  }

  async findByEmailAndMachine(
    _organizationId: string,
    _email: string,
    _machineId: string
  ): Promise<FleetDeveloper | null> {
    throw new Error('findByEmailAndMachine() is server-side only (not implemented in HTTP client)')
  }

  async countByOrganization(_organizationId: string): Promise<number> {
    throw new Error('countByOrganization() is server-side only (not implemented in HTTP client)')
  }

  async findStaleDevices(
    _organizationId: string,
    _thresholdMs: number
  ): Promise<FleetDeveloper[]> {
    throw new Error('findStaleDevices() is server-side only (not implemented in HTTP client)')
  }

  async findRecentRegistrations(
    _organizationId: string,
    _sinceDate: Date
  ): Promise<FleetDeveloper[]> {
    throw new Error('findRecentRegistrations() is server-side only (not implemented in HTTP client)')
  }

  async findRecentCheckIns(
    _organizationId: string,
    _sinceDate: Date
  ): Promise<FleetDeveloper[]> {
    throw new Error('findRecentCheckIns() is server-side only (not implemented in HTTP client)')
  }

  async update(
    _developerId: string,
    _updates: Partial<FleetDeveloper>
  ): Promise<void> {
    throw new Error('update() is server-side only (not implemented in HTTP client)')
  }

  async updateCheckIn(
    _developerId: string,
    _enforcementStatus: EnforcementStatus
  ): Promise<void> {
    throw new Error('updateCheckIn() is server-side only (not implemented in HTTP client)')
  }

  // ─────────────────────────────────────────────────────────────────
  // Helper Methods
  // ─────────────────────────────────────────────────────────────────

  private mapToFleetDeveloper(data: any): FleetDeveloper {
    return {
      id: data.id,
      organizationId: data.organizationId,
      email: data.email,
      machineId: data.machineId,
      hostname: data.hostname,
      registeredAt: new Date(data.registeredAt),
      lastCheckIn: new Date(data.lastCheckIn),
      enforcementStatus: data.enforcementStatus,
      isCompliant: data.isCompliant,
    }
  }
}
