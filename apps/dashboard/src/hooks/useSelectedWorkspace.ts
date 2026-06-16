'use client'

import { useEffect, useState } from 'react'
import {
  getSelectedWorkspace,
  getSelectedWorkspaceType,
  subscribeWorkspaceChanged,
  type WorkspaceAccountType,
} from '@/lib/organizationEvents'

/**
 * Track the currently selected workspace (account name) from the sidebar WorkspaceSwitcher.
 * Auto-updates when the user switches workspaces.
 */
export function useSelectedWorkspace(): string | null {
  // Keep the initial render SSR-safe. The persisted workspace is hydrated after
  // mount so server and client HTML do not diverge before React attaches.
  const [selectedWorkspace, setSelectedWorkspace] = useState<string | null>(null)

  useEffect(() => {
    setSelectedWorkspace(getSelectedWorkspace())
  }, [])

  useEffect(() => {
    return subscribeWorkspaceChanged((accountName) => {
      setSelectedWorkspace(accountName)
    })
  }, [])

  return selectedWorkspace
}

/**
 * Track both the selected workspace name and its account type.
 * Returns whether the selected workspace is a personal account.
 */
export function useIsPersonalWorkspace(): boolean {
  // Use the same two-pass hydration as useSelectedWorkspace to avoid dashboard
  // shell mismatches when a stored workspace selection exists in the browser.
  const [isPersonal, setIsPersonal] = useState(false)

  useEffect(() => {
    setIsPersonal(getSelectedWorkspaceType() === 'User')
  }, [])

  useEffect(() => {
    return subscribeWorkspaceChanged((_accountName, accountType) => {
      setIsPersonal(accountType === 'User')
    })
  }, [])

  return isPersonal
}

/**
 * Returns the raw account type of the currently selected workspace.
 * Mirrors getSelectedWorkspaceType() but as a reactive hook.
 */
export function useSelectedWorkspaceType(): WorkspaceAccountType | null {
  const [workspaceType, setWorkspaceType] = useState<WorkspaceAccountType | null>(null)

  useEffect(() => {
    setWorkspaceType(getSelectedWorkspaceType())
  }, [])

  useEffect(() => {
    return subscribeWorkspaceChanged((_accountName, accountType) => {
      setWorkspaceType(accountType ?? null)
    })
  }, [])

  return workspaceType
}
