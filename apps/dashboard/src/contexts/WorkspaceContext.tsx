'use client'

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useRef,
  type ReactNode,
} from 'react'
import { api } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-guard'
import type { WorkspaceType, PersonalGitHubStatus } from '@gal/types'

// localStorage key for workspace preference (fast initial load, fallback for offline)
const WORKSPACE_STORAGE_KEY = 'gal-workspace-preference'

interface WorkspaceContextType {
  /** Current workspace type (organization or personal) */
  currentWorkspace: WorkspaceType
  /** Whether user has connected personal GitHub */
  hasPersonalGitHub: boolean
  /** Connected personal GitHub username (if any) */
  personalGitHubUsername: string | null
  /** Whether personal GitHub status is loading */
  isLoading: boolean
  /** Whether workspace preference is syncing */
  isSyncing: boolean
  /** Switch to a different workspace */
  setWorkspace: (workspace: WorkspaceType) => void
  /** Refresh personal GitHub connection status */
  refreshPersonalGitHub: () => Promise<void>
  /** Connect personal GitHub (redirects to OAuth) */
  connectPersonalGitHub: () => void
  /** Disconnect personal GitHub */
  disconnectPersonalGitHub: () => Promise<void>
}

const WorkspaceContext = createContext<WorkspaceContextType | null>(null)

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  // Default to 'organization' workspace
  const [currentWorkspace, setCurrentWorkspace] =
    useState<WorkspaceType>('organization')
  const [hasPersonalGitHub, setHasPersonalGitHub] = useState(false)
  const [personalGitHubUsername, setPersonalGitHubUsername] = useState<
    string | null
  >(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isSyncing, setIsSyncing] = useState(false)

  // Track if we've loaded from API to prevent duplicate calls
  const hasLoadedFromApi = useRef(false)
  // Track if initial load is complete (both localStorage and API)
  const isInitialized = useRef(false)

  // Load saved workspace from localStorage on mount (fast initial value)
  useEffect(() => {
    const saved = localStorage.getItem(WORKSPACE_STORAGE_KEY)
    if (saved === 'personal' || saved === 'organization') {
      setCurrentWorkspace(saved)
    }
  }, [])

  // Load workspace preference from API (authoritative source, cross-device sync)
  const loadWorkspacePreference = useCallback(async () => {
    if (hasLoadedFromApi.current) return

    if (isDemoMode()) {
      setCurrentWorkspace('organization')
      localStorage.setItem(WORKSPACE_STORAGE_KEY, 'organization')
      hasLoadedFromApi.current = true
      return
    }

    try {
      const preference = await api.getWorkspacePreference()

      // Only update if API returned a saved preference (not default)
      if (!preference.isDefault) {
        setCurrentWorkspace(preference.workspace)
        localStorage.setItem(WORKSPACE_STORAGE_KEY, preference.workspace)

        if (process.env.NODE_ENV === 'development') {
          console.log('[WorkspaceContext] Loaded preference from API:', preference.workspace)
        }
      }

      hasLoadedFromApi.current = true
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[WorkspaceContext] Failed to load preference from API:', error)
      }
      // Fall back to localStorage value (already set)
      hasLoadedFromApi.current = true
    }
  }, [])

  // Refresh personal GitHub connection status
  const refreshPersonalGitHub = useCallback(async () => {
    if (isDemoMode()) {
      setHasPersonalGitHub(true)
      setPersonalGitHubUsername('demo-user')
      setIsLoading(false)
      isInitialized.current = true
      return
    }

    setIsLoading(true)
    try {
      const status: PersonalGitHubStatus = await api.getPersonalGitHubStatus()
      setHasPersonalGitHub(status.connected)
      setPersonalGitHubUsername(status.username || null)

      // If personal workspace selected but no personal GitHub, revert to org (T036)
      if (currentWorkspace === 'personal' && !status.connected) {
        setCurrentWorkspace('organization')
        localStorage.setItem(WORKSPACE_STORAGE_KEY, 'organization')

        // Also sync to API to persist the fallback
        try {
          await api.saveWorkspacePreference('organization')
        } catch {
          // Silent fail - localStorage is already updated
        }

        if (process.env.NODE_ENV === 'development') {
          console.log('[WorkspaceContext] Reverted to org workspace - personal GitHub disconnected')
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[WorkspaceContext] Failed to check personal GitHub:', error)
      }
      setHasPersonalGitHub(false)
      setPersonalGitHubUsername(null)
    } finally {
      setIsLoading(false)
      isInitialized.current = true
    }
  }, [currentWorkspace])

  // Check personal GitHub status and load API preference on mount
  useEffect(() => {
    const initialize = async () => {
      // Load workspace preference from API first
      await loadWorkspacePreference()
      // Then check personal GitHub status (may update workspace if disconnected)
      await refreshPersonalGitHub()
    }

    initialize()
  }, [loadWorkspacePreference, refreshPersonalGitHub])

  // Set workspace and persist to both localStorage and API (T033, T034)
  const setWorkspace = useCallback(
    async (workspace: WorkspaceType) => {
      if (isDemoMode()) {
        setCurrentWorkspace(workspace)
        localStorage.setItem(WORKSPACE_STORAGE_KEY, workspace)
        return
      }

      // Don't allow personal workspace if no personal GitHub
      if (workspace === 'personal' && !hasPersonalGitHub) {
        if (process.env.NODE_ENV === 'development') {
          console.warn(
            '[WorkspaceContext] Cannot switch to personal workspace without connected GitHub'
          )
        }
        return
      }

      // Optimistically update state and localStorage
      setCurrentWorkspace(workspace)
      localStorage.setItem(WORKSPACE_STORAGE_KEY, workspace)

      // Sync to API for cross-device persistence (T034)
      setIsSyncing(true)
      try {
        const result = await api.saveWorkspacePreference(workspace)

        if (!result.success) {
          if (process.env.NODE_ENV === 'development') {
            console.warn('[WorkspaceContext] Failed to sync preference to API:', result.error)
          }
          // State is already updated optimistically, so no rollback needed
          // The preference will be synced on next successful API call
        } else if (process.env.NODE_ENV === 'development') {
          console.log('[WorkspaceContext] Synced preference to API:', workspace)
        }
      } catch (error) {
        if (process.env.NODE_ENV === 'development') {
          console.warn('[WorkspaceContext] Error syncing preference to API:', error)
        }
        // Silent fail - localStorage has the value for offline support
      } finally {
        setIsSyncing(false)
      }
    },
    [hasPersonalGitHub]
  )

  // Redirect to personal GitHub OAuth
  const connectPersonalGitHub = useCallback(() => {
    if (isDemoMode()) return

    // Redirect to personal OAuth endpoint
    const redirectUrl = encodeURIComponent(
      `${window.location.origin}/settings?tab=github`
    )
    window.location.href = `${api.baseUrl}/auth/github/personal?redirect=${redirectUrl}`
  }, [])

  // Disconnect personal GitHub
  const disconnectPersonalGitHub = useCallback(async () => {
    if (isDemoMode()) {
      setCurrentWorkspace('organization')
      localStorage.setItem(WORKSPACE_STORAGE_KEY, 'organization')
      return
    }

    try {
      await api.disconnectPersonalGitHub()
      setHasPersonalGitHub(false)
      setPersonalGitHubUsername(null)

      // If in personal workspace, revert to org (T036)
      if (currentWorkspace === 'personal') {
        setCurrentWorkspace('organization')
        localStorage.setItem(WORKSPACE_STORAGE_KEY, 'organization')

        // Sync the fallback to API
        try {
          await api.saveWorkspacePreference('organization')
        } catch {
          // Silent fail - localStorage is already updated
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('[WorkspaceContext] Failed to disconnect personal GitHub:', error)
      }
      throw error
    }
  }, [currentWorkspace])

  const value: WorkspaceContextType = {
    currentWorkspace,
    hasPersonalGitHub,
    personalGitHubUsername,
    isLoading,
    isSyncing,
    setWorkspace,
    refreshPersonalGitHub,
    connectPersonalGitHub,
    disconnectPersonalGitHub,
  }

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  )
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext)
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider')
  }
  return context
}
