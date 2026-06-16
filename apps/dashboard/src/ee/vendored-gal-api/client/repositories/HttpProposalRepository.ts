/**
 * HTTP Repository Adapter for Proposal Operations
 *
 * Implements IProposalRepository using HTTP calls to the API
 * Used by CLI and VS Code extension to access proposal data without direct Firestore access
 */

import type { IProposalRepository } from '@gal/core'
import type { ConfigProposal, ConfigVersion } from '@gal/types'
import { HttpClient, type HttpClientConfig } from '../HttpClient'

export class HttpProposalRepository extends HttpClient implements IProposalRepository {
  constructor(config: HttpClientConfig) {
    super(config)
  }

  async listConfigProposals(
    orgName: string,
    filters?: {
      status?: 'pending' | 'approved' | 'rejected'
      scope?: 'org' | 'project'
    }
  ): Promise<ConfigProposal[]> {
    const params = new URLSearchParams()
    if (filters?.status) params.set('status', filters.status)
    if (filters?.scope) params.set('scope', filters.scope)

    const response = await this.fetchJson<{
      proposals: Array<{
        id: string
        scope: 'org' | 'project'
        scopeId: string
        proposedBy: string
        proposedAt: string
        content: Record<string, unknown>
        basedOnVersion?: number
        status: 'pending' | 'approved' | 'rejected' | 'withdrawn'
        reviewedBy?: string
        reviewedAt?: string
        reviewComment?: string
      }>
      total: number
    }>(
      `/api/orgs/${encodeURIComponent(orgName)}/proposals${params.toString() ? '?' + params.toString() : ''}`
    )

    return response.proposals.map(p => this.mapToConfigProposal(p))
  }

  // ─────────────────────────────────────────────────────────────────
  // CLI-Specific Convenience Methods (not in interface)
  // ─────────────────────────────────────────────────────────────────

  /**
   * Propose organization-level config changes
   */
  async proposeOrgConfig(
    orgName: string,
    params: {
      content: Record<string, unknown>
      description?: string
    }
  ): Promise<{
    id: string
    status: 'pending'
    diff: {
      added: Record<string, unknown>
      modified: Record<string, { old: unknown; new: unknown }>
      removed: Record<string, unknown>
    }
    createdAt: string
  }> {
    const response = await this.fetchJson<{
      id: string
      status: 'pending'
      diff: {
        added: Record<string, unknown>
        modified: Record<string, { old: unknown; new: unknown }>
        removed: Record<string, unknown>
      }
      createdAt: string
    }>(
      `/api/orgs/${encodeURIComponent(orgName)}/proposals`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    )
    return response
  }

  /**
   * Propose project-level config changes
   */
  async proposeProjectConfig(
    orgName: string,
    repoName: string,
    params: {
      content: Record<string, unknown>
      description?: string
    }
  ): Promise<{
    id: string
    status: 'pending'
    diff: {
      added: Record<string, unknown>
      modified: Record<string, { old: unknown; new: unknown }>
      removed: Record<string, unknown>
    }
    createdAt: string
  }> {
    const response = await this.fetchJson<{
      id: string
      status: 'pending'
      diff: {
        added: Record<string, unknown>
        modified: Record<string, { old: unknown; new: unknown }>
        removed: Record<string, unknown>
      }
      createdAt: string
    }>(
      `/api/orgs/${encodeURIComponent(orgName)}/repos/${encodeURIComponent(repoName)}/proposals`,
      {
        method: 'POST',
        body: JSON.stringify(params),
      }
    )
    return response
  }

  /**
   * Get merged config (org + project)
   */
  async getMergedConfig(
    orgName: string,
    repoName?: string
  ): Promise<{
    org: { version: number; content: Record<string, unknown> }
    project?: { version: number; content: Record<string, unknown> }
    merged: Record<string, unknown>
  }> {
    const path = repoName
      ? `/api/orgs/${encodeURIComponent(orgName)}/repos/${encodeURIComponent(repoName)}/config`
      : `/api/orgs/${encodeURIComponent(orgName)}/config`

    const response = await this.fetchJson<{
      org: { version: number; content: Record<string, unknown> }
      project?: { version: number; content: Record<string, unknown> }
      merged: Record<string, unknown>
    }>(path)
    return response
  }

  // ─────────────────────────────────────────────────────────────────
  // Server-Only Methods (throw descriptive errors)
  // ─────────────────────────────────────────────────────────────────

  async getConfigProposal(_id: string): Promise<ConfigProposal | null> {
    throw new Error('getConfigProposal() is server-side only (not implemented in HTTP client)')
  }

  async createConfigProposal(
    _proposal: Omit<ConfigProposal, 'id'>
  ): Promise<string> {
    throw new Error('createConfigProposal() is server-side only (not implemented in HTTP client)')
  }

  async updateConfigProposal(
    _id: string,
    _updates: Partial<ConfigProposal>
  ): Promise<void> {
    throw new Error('updateConfigProposal() is server-side only (not implemented in HTTP client)')
  }

  async deleteConfigProposal(_id: string): Promise<void> {
    throw new Error('deleteConfigProposal() is server-side only (not implemented in HTTP client)')
  }

  async approveProposalAtomically(
    _proposalId: string,
    _newVersion: Omit<ConfigVersion, 'id'>,
    _proposalUpdate: {
      status: 'approved' | 'rejected'
      reviewedBy: string
      reviewedAt: Date
      reviewComment?: string
    }
  ): Promise<{ versionNumber: number; proposal: ConfigProposal }> {
    throw new Error('approveProposalAtomically() is server-side only (not implemented in HTTP client)')
  }

  // ─────────────────────────────────────────────────────────────────
  // Helper Methods
  // ─────────────────────────────────────────────────────────────────

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private mapToConfigProposal(data: any): ConfigProposal {
    return {
      id: data.id,
      scope: data.scope,
      scopeId: data.scopeId,
      proposedBy: data.proposedBy,
      proposedAt: new Date(data.proposedAt),
      content: data.content,
      basedOnVersion: data.basedOnVersion,
      status: data.status,
      reviewedBy: data.reviewedBy,
      reviewedAt: data.reviewedAt ? new Date(data.reviewedAt) : undefined,
      reviewComment: data.reviewComment,
    }
  }
}
