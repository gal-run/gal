/**
 * HTTP Repository Adapter for Invite Operations
 *
 * Implements IInviteRepository using HTTP calls to the API
 * Used by CLI and VS Code extension to access invite data without direct Firestore access
 */

import type { Invite, IInviteRepository } from '@gal/core'
import { HttpClient, type HttpClientConfig } from '../HttpClient'

export class HttpInviteRepository extends HttpClient implements IInviteRepository {
  constructor(config: HttpClientConfig) {
    super(config)
  }

  // ─────────────────────────────────────────────────────────────────
  // CLI-Specific Convenience Methods (not in interface)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Validate an invite code without using it
   */
  async validateInvite(code: string): Promise<{
    valid: boolean
    error?: string
    invite?: {
      code: string
      organizationName: string
      expiresAt: string
      maxUses: number
      currentUses: number
    }
    organization?: {
      id: string
      name: string
      planTier: string
      seatsUsed: number
      seatsLimit: number
      seatsAvailable: number
    }
  }> {
    const response = await this.fetchJson<{
      valid: boolean
      error?: string
      invite?: {
        code: string
        organizationName: string
        expiresAt: string
        maxUses: number
        currentUses: number
      }
      organization?: {
        id: string
        name: string
        planTier: string
        seatsUsed: number
        seatsLimit: number
        seatsAvailable: number
      }
    }>(`/invites/${encodeURIComponent(code)}/validate`)
    return response
  }

  /**
   * Use an invite code to join an organization
   */
  async useInvite(
    code: string,
    request: {
      email: string
      machineId: string
      hostname?: string
    }
  ): Promise<{
    success: boolean
    error?: string
    developerId?: string
    organizationName?: string
    policyVersion?: string
  }> {
    const response = await this.fetchJson<{
      success: boolean
      error?: string
      developerId?: string
      organizationName?: string
      policyVersion?: string
    }>(`/invites/${encodeURIComponent(code)}/use`, {
      method: 'POST',
      body: JSON.stringify(request),
    })
    return response
  }

  // ─────────────────────────────────────────────────────────────────
  // Server-Only Methods (throw descriptive errors)
  // ─────────────────────────────────────────────────────────────────

  async findByCode(_code: string): Promise<Invite | null> {
    throw new Error('findByCode() is server-side only (not implemented in HTTP client)')
  }

  async findById(_inviteId: string): Promise<Invite | null> {
    throw new Error('findById() is server-side only (not implemented in HTTP client)')
  }

  async findByOrganization(_organizationName: string): Promise<Invite[]> {
    throw new Error('findByOrganization() is server-side only (not implemented in HTTP client)')
  }

  async findActiveByOrganization(_organizationName: string): Promise<Invite[]> {
    throw new Error('findActiveByOrganization() is server-side only (not implemented in HTTP client)')
  }

  async create(_invite: Invite): Promise<string> {
    throw new Error('create() is server-side only (not implemented in HTTP client)')
  }

  async incrementUsage(_inviteId: string, _usedByEmail: string): Promise<void> {
    throw new Error('incrementUsage() is server-side only (not implemented in HTTP client)')
  }

  async revoke(_inviteId: string): Promise<void> {
    throw new Error('revoke() is server-side only (not implemented in HTTP client)')
  }

  async codeExists(_code: string): Promise<boolean> {
    throw new Error('codeExists() is server-side only (not implemented in HTTP client)')
  }
}
