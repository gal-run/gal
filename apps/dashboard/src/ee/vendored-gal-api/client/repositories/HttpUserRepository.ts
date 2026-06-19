/**
 * HTTP Repository Adapter for Users
 *
 * Implements IUserRepository using HTTP calls to the API.
 * Shared across Dashboard, CLI, and VS Code clients.
 */

import { User, type IUserRepository } from '@gal/core'
import { HttpClient, type HttpClientConfig } from '../HttpClient'

interface UserApiResponse {
  githubId: number
  login: string
  email?: string | null
  name?: string | null
  avatarUrl?: string
  organizations?: string[]
  adminOrganizations?: string[]
  providers?: UserProviderApiResponse[]
  createdAt?: string
  updatedAt?: string
}

interface UserProviderApiResponse {
  type: 'github' | 'google' | 'email'
  providerId: string
  email: string
  displayName?: string
  avatarUrl?: string
  accessToken?: string
  refreshToken?: string
  connectedAt: string | Date
}

export class HttpUserRepository extends HttpClient implements IUserRepository {
  constructor(config: HttpClientConfig) {
    super(config)
  }

  // ─────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────

  async findByGithubId(githubId: number): Promise<User | null> {
    try {
      const response = await this.fetch(`/users/${githubId}`)
      const data = (await response.json()) as { user: UserApiResponse }

      return this.mapToUser(data.user)
    } catch (error: unknown) {
      const err = error as Error
      if (err.message?.includes('404')) {
        return null
      }
      throw err
    }
  }

  async findByLogin(login: string): Promise<User | null> {
    try {
      const response = await this.fetch(`/users/login/${login}`)
      const data = (await response.json()) as { user: UserApiResponse }

      return this.mapToUser(data.user)
    } catch (error: unknown) {
      const err = error as Error
      if (err.message?.includes('404')) {
        return null
      }
      throw err
    }
  }

  async findByEmail(email: string): Promise<User | null> {
    try {
      const response = await this.fetch(`/users/email/${encodeURIComponent(email)}`)
      const data = (await response.json()) as { user: UserApiResponse }

      return this.mapToUser(data.user)
    } catch (error: unknown) {
      const err = error as Error
      if (err.message?.includes('404')) {
        return null
      }
      throw err
    }
  }

  async findByOrganization(orgName: string): Promise<User[]> {
    const response = await this.fetch(`/organizations/${orgName}/users`)
    const data = (await response.json()) as { users: UserApiResponse[] }

    return data.users.map((user) => this.mapToUser(user))
  }

  async findAdminsByOrganization(orgName: string): Promise<User[]> {
    const response = await this.fetch(`/organizations/${orgName}/admins`)
    const data = (await response.json()) as { users: UserApiResponse[] }

    return data.users.map((user) => this.mapToUser(user))
  }

  async exists(githubId: number): Promise<boolean> {
    const user = await this.findByGithubId(githubId)
    return user !== null
  }

  // ─────────────────────────────────────────────────────────────────
  // Commands
  // ─────────────────────────────────────────────────────────────────

  async create(user: User): Promise<void> {
    await this.fetch('/users', {
      method: 'POST',
      body: JSON.stringify({
        githubId: user.githubId,
        login: user.login,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        organizations: user.organizations,
        adminOrganizations: user.adminOrganizations,
      }),
    })
  }

  async update(user: User): Promise<void> {
    await this.fetch(`/users/${user.githubId}`, {
      method: 'PUT',
      body: JSON.stringify({
        login: user.login,
        email: user.email,
        name: user.name,
        avatarUrl: user.avatarUrl,
        organizations: user.organizations,
        adminOrganizations: user.adminOrganizations,
      }),
    })
  }

  async delete(githubId: number): Promise<void> {
    await this.fetch(`/users/${githubId}`, {
      method: 'DELETE',
    })
  }

  async updateLastActivity(githubId: number): Promise<void> {
    await this.fetch(`/users/${githubId}/activity`, {
      method: 'PUT',
    })
  }

  // ─────────────────────────────────────────────────────────────────
  // Helpers
  // ─────────────────────────────────────────────────────────────────

  private mapToUser(data: UserApiResponse): User {
    const providers = Array.isArray(data.providers) ? data.providers : []
    return new User(
      data.githubId,
      data.login,
      data.email || null,
      data.name || null,
      data.avatarUrl || '',
      data.organizations || [],
      data.adminOrganizations || [],
      data.createdAt ? new Date(data.createdAt) : new Date(),
      data.updatedAt ? new Date(data.updatedAt) : new Date(),
      providers as User['providers']
    )
  }
}