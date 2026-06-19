'use client'

/**
 * Core Services Context for Dashboard
 *
 * Provides React context for accessing core business logic services
 * Uses HTTP repository adapters to communicate with API
 */

import { createContext, useContext, useMemo, type ReactNode } from 'react'
import {
  TeamService,
  type IOrganizationRepository,
} from '@gal/core'

import { HttpOrganizationRepository, type HttpClientConfig } from '@gal/api/client'

const API_BASE_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000'

// ─────────────────────────────────────────────────────────────────
// Context Type
// ─────────────────────────────────────────────────────────────────

interface CoreServices {
  // Core Services
  teamService: TeamService

  // Repositories (for direct access when needed)
  organizationRepository: IOrganizationRepository
}

const CoreServicesContext = createContext<CoreServices | null>(null)

// ─────────────────────────────────────────────────────────────────
// Provider
// ─────────────────────────────────────────────────────────────────

interface CoreServicesProviderProps {
  children: ReactNode
  authToken?: string // Optional: will use cookies if not provided
}

export function CoreServicesProvider({
  children,
  authToken,
}: CoreServicesProviderProps) {
  const services = useMemo(() => {
    // Configure HTTP client
    const httpConfig: HttpClientConfig = {
      apiUrl: API_BASE_URL,
      authToken,
      credentials: 'include',
      timeoutMs: 10000,
    }

    // Initialize HTTP repository adapters
    const orgRepository = new HttpOrganizationRepository(httpConfig)

    // Initialize core services with HTTP adapters
    const teamService = new TeamService(orgRepository)

    return {
      teamService,
      organizationRepository: orgRepository,
    }
  }, [authToken])

  return (
    <CoreServicesContext.Provider value={services}>
      {children}
    </CoreServicesContext.Provider>
  )
}

/**
 * Access TeamService for team member management
 *
 * Provides:
 * - listTeamMembers, addTeamMember, removeTeamMember
 * - updateRole (with last owner protection)
 * - Business rules (seat limits, role validation)
 */
export function useTeamService(): TeamService {
  const context = useContext(CoreServicesContext)
  if (!context) {
    throw new Error('useTeamService must be used within CoreServicesProvider')
  }
  return context.teamService
}

/**
 * Access repositories directly (when business logic is not needed)
 *
 * Use this sparingly - prefer services for operations with business logic
 */
export function useCoreRepositories() {
  const context = useContext(CoreServicesContext)
  if (!context) {
    throw new Error(
      'useCoreRepositories must be used within CoreServicesProvider'
    )
  }
  return {
    organizationRepository: context.organizationRepository,
  }
}

/**
 * Access all core services (use specific hooks above when possible)
 */
export function useCoreServices(): CoreServices {
  const context = useContext(CoreServicesContext)
  if (!context) {
    throw new Error('useCoreServices must be used within CoreServicesProvider')
  }
  return context
}
