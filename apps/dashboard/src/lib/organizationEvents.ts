const ORGS_UPDATED_EVENT = 'gal:organizations-updated'
const WORKSPACE_CHANGED_EVENT = 'gal:workspace-changed'
const WORKSPACE_STORAGE_KEY = 'gal-selected-account'
const WORKSPACE_TYPE_STORAGE_KEY = 'gal-selected-account-type'

export type WorkspaceAccountType = 'Organization' | 'User' | 'Enterprise'

export function notifyOrganizationsUpdated(): void {
  if (typeof window === 'undefined') return
  const event =
    typeof CustomEvent === 'function'
      ? new CustomEvent(ORGS_UPDATED_EVENT)
      : new Event(ORGS_UPDATED_EVENT)
  window.dispatchEvent(event)
}

export function subscribeOrganizationsUpdated(handler: () => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const listener = () => handler()
  window.addEventListener(ORGS_UPDATED_EVENT, listener)
  return () => window.removeEventListener(ORGS_UPDATED_EVENT, listener)
}

export function notifyWorkspaceChanged(accountName: string, accountType?: WorkspaceAccountType): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage?.setItem?.(WORKSPACE_STORAGE_KEY, accountName)
    if (accountType) {
      window.localStorage?.setItem?.(WORKSPACE_TYPE_STORAGE_KEY, accountType)
    }
  } catch {
    // Ignore storage failures (private mode, blocked storage, tests).
  }
  window.dispatchEvent(new CustomEvent(WORKSPACE_CHANGED_EVENT, {
    detail: { accountName, accountType },
  }))
}

export function getSelectedWorkspace(): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage?.getItem?.(WORKSPACE_STORAGE_KEY) ?? null
  } catch {
    return null
  }
}

export function getSelectedWorkspaceType(): WorkspaceAccountType | null {
  if (typeof window === 'undefined') return null
  try {
    const val = window.localStorage?.getItem?.(WORKSPACE_TYPE_STORAGE_KEY)
    if (val === 'User') return 'User'
    if (val === 'Organization') return 'Organization'
    if (val === 'Enterprise') return 'Enterprise'
    return null
  } catch {
    return null
  }
}

export function subscribeWorkspaceChanged(handler: (accountName: string, accountType?: WorkspaceAccountType) => void): () => void {
  if (typeof window === 'undefined') return () => {}
  const listener = (e: Event) => {
    const detail = (e as CustomEvent).detail
    // Support both old (string) and new ({ accountName, accountType }) formats
    if (typeof detail === 'string') {
      handler(detail)
    } else {
      handler(detail.accountName, detail.accountType)
    }
  }
  window.addEventListener(WORKSPACE_CHANGED_EVENT, listener)
  return () => window.removeEventListener(WORKSPACE_CHANGED_EVENT, listener)
}
