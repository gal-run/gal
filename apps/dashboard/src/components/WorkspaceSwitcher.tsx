'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { Building2, User, ChevronDown, Check, Landmark } from 'lucide-react'
import { api, type Organization } from '@/lib/api'
import { loadWorkspaceSwitcherBootstrap } from '@/lib/dashboard-startup'
import { subscribeOrganizationsUpdated, notifyWorkspaceChanged, getSelectedWorkspace, type WorkspaceAccountType } from '@/lib/organizationEvents'
import { isDemoMode } from '@/lib/demo-guard'
import { DEMO_ORGANIZATION } from '@/lib/demo-data'

/**
 * Represents one row in the dropdown — either a non-selectable enterprise header
 * or a selectable account (User / Organization / Enterprise).
 */
type DropdownRow =
  | { kind: 'enterprise-header'; slug: string }
  | { kind: 'account'; account: Organization; indented: boolean }

/**
 * Build the ordered list of rows to render in the dropdown.
 *
 * Layout:
 *   Enterprise: <slug>          (non-selectable header)
 *     └ <org with that slug>    (indented)
 *     └ <org with that slug>
 *   <org without enterpriseSlug>
 *   <personal account>
 */
function buildDropdownRows(accounts: Organization[]): DropdownRow[] {
  const rows: DropdownRow[] = []

  // Collect unique enterprise slugs in insertion order
  const enterpriseSlugs: string[] = []
  const slugSet = new Set<string>()
  for (const acc of accounts) {
    if (acc.enterpriseSlug && !slugSet.has(acc.enterpriseSlug)) {
      enterpriseSlugs.push(acc.enterpriseSlug)
      slugSet.add(acc.enterpriseSlug)
    }
  }

  // Add enterprise groups first
  for (const slug of enterpriseSlugs) {
    rows.push({ kind: 'enterprise-header', slug })
    for (const acc of accounts) {
      if (acc.enterpriseSlug === slug) {
        rows.push({ kind: 'account', account: acc, indented: true })
      }
    }
  }

  // Then accounts that don't belong to an enterprise
  for (const acc of accounts) {
    if (!acc.enterpriseSlug) {
      rows.push({ kind: 'account', account: acc, indented: false })
    }
  }

  return rows
}

/**
 * Resolve the WorkspaceAccountType for an account, covering all three variants.
 */
function resolveAccountType(account: Organization): WorkspaceAccountType {
  if (account.accountType === 'User') return 'User'
  if (account.accountType === 'Enterprise') return 'Enterprise'
  return 'Organization'
}

/**
 * WorkspaceSwitcher component for switching between connected GitHub accounts.
 * Shows all accounts (both organizations and personal) with the GitHub App installed.
 * Orgs that share an enterpriseSlug are grouped under a non-selectable enterprise header.
 */
export function WorkspaceSwitcher() {
  const [isOpen, setIsOpen] = useState(false)
  const [accounts, setAccounts] = useState<Organization[]>([])
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [hasLiveInstallations, setHasLiveInstallations] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const dropdownRef = useRef<HTMLDivElement>(null)
  const hasLoadedOnce = useRef(false)

  // Fetch all connected accounts (orgs and personal) on mount
  const fetchAccounts = useCallback(async (options?: { silent?: boolean }) => {
    const showLoading = !options?.silent && !hasLoadedOnce.current
    if (showLoading) {
      setIsLoading(true)
    }
    try {
      // In demo mode, skip real API calls and use pre-seeded data
      if (isDemoMode()) {
        const demoOrgs: Organization[] = [DEMO_ORGANIZATION]
        setAccounts(demoOrgs)
        setHasLiveInstallations(true)
        setSelectedAccount(DEMO_ORGANIZATION.name)
        notifyWorkspaceChanged(DEMO_ORGANIZATION.name, 'Organization')
        setLoadError(null)
        return
      }

      const { organizations: orgs, hasLiveInstallations } =
        await loadWorkspaceSwitcherBootstrap({
          getOrganizations: () => api.getOrganizations(),
          getGitHubAppStatus: () => api.getGitHubAppStatus(),
        })
      setAccounts(orgs)
      setHasLiveInstallations(hasLiveInstallations)
      setLoadError(null)
      // Select first account by default, or restore from localStorage
      // Always notify so all subscribers (hooks, contexts) get the workspace (#2278)
      const saved = getSelectedWorkspace()
      if (saved && orgs.some(o => o.name === saved)) {
        setSelectedAccount(saved)
        const savedAccount = orgs.find(o => o.name === saved)!
        notifyWorkspaceChanged(saved, resolveAccountType(savedAccount))
      } else if (orgs.length > 0) {
        setSelectedAccount(orgs[0].name)
        notifyWorkspaceChanged(orgs[0].name, resolveAccountType(orgs[0]))
      } else {
        setSelectedAccount(null)
      }
    } catch (error) {
      console.error('Failed to fetch accounts:', error)
      // #6234: On service failure (e.g. GCP ADC missing), show error state
      // instead of a permanent "Syncing accounts..." spinner.
      if (!options?.silent) {
        setLoadError('Unable to load workspaces. Please try again later.')
      }
    } finally {
      if (showLoading) {
        setIsLoading(false)
      }
      hasLoadedOnce.current = true
    }
  }, [])

  useEffect(() => {
    fetchAccounts()
  }, [fetchAccounts])

  useEffect(() => {
    return subscribeOrganizationsUpdated(() => fetchAccounts({ silent: true }))
  }, [fetchAccounts])

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Close dropdown on escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false)
    }
    document.addEventListener('keydown', handleEscape)
    return () => document.removeEventListener('keydown', handleEscape)
  }, [])

  // Get current selected account
  const currentAccount = accounts.find(a => a.name === selectedAccount)
  const displayName = currentAccount?.name || 'Select Account'
  const isPersonalAccount = currentAccount?.accountType === 'User'
  const Icon = isPersonalAccount ? User : Building2

  const handleSelectAccount = (accountName: string) => {
    setSelectedAccount(accountName)
    const account = accounts.find(a => a.name === accountName)
    notifyWorkspaceChanged(accountName, account ? resolveAccountType(account) : 'Organization')
    setIsOpen(false)
  }

  if (isLoading) {
    return (
      <div className="px-3 py-2">
        <div className="h-9 rounded-md bg-[var(--bg-tertiary)] animate-pulse" />
      </div>
    )
  }

  // #6234: Show error state instead of infinite spinner when service is unavailable
  if (loadError) {
    return (
      <div className="px-3 py-2">
        <div className="px-2.5 py-1.5 text-sm text-[var(--status-danger,#ef4444)]">
          {loadError}
        </div>
      </div>
    )
  }

  if (accounts.length === 0) {
    return (
      <div className="px-3 py-2">
        <div className="px-2.5 py-1.5 text-sm text-[var(--text-muted)]">
          {hasLiveInstallations ? 'Syncing accounts...' : 'No accounts connected'}
        </div>
      </div>
    )
  }

  const dropdownRows = buildDropdownRows(accounts)

  return (
    <div ref={dropdownRef} className="px-3 py-2.5 relative">
      {/* Trigger Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg
          hover:bg-[var(--nav-item-hover-bg)]
          border border-[var(--border-subtle)] hover:border-[var(--border-default)]
          transition-all duration-200 group"
        style={{ background: 'var(--nav-item-hover-bg)' }}
      >
        <Icon className="w-4 h-4 text-[var(--interactive-primary)] flex-shrink-0" />
        <span className="flex-1 text-left text-[13px] text-[var(--text-primary)] truncate font-medium">
          {displayName}
        </span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-[var(--text-tertiary)] transition-transform duration-200 ${
            isOpen ? 'rotate-180' : ''
          }`}
        />
      </button>

      {/* Dropdown Menu - Premium shadow with smooth scale animation */}
      {isOpen && (
        <div
          className="absolute left-3 right-3 mt-1.5 z-50 rounded-xl overflow-hidden border border-[var(--border-subtle)]"
          style={{
            background: 'var(--surface-raised)',
            boxShadow: 'var(--shadow-lg)',
            animation: 'dropdown-enter 0.15s ease-out',
          }}
        >
          <div className="py-1.5 px-1.5">
            {dropdownRows.map((row) => {
              if (row.kind === 'enterprise-header') {
                return (
                  <div
                    key={`enterprise-header:${row.slug}`}
                    className="flex items-center gap-2 px-2.5 pt-2 pb-1"
                  >
                    <Landmark className="w-3.5 h-3.5 flex-shrink-0 text-[var(--text-tertiary)]" />
                    <span className="text-[11px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)] truncate">
                      {row.slug}
                    </span>
                  </div>
                )
              }

              const { account, indented } = row
              const isPersonal = account.accountType === 'User'
              const AccountIcon = isPersonal ? User : Building2
              const isSelected = account.name === selectedAccount
              const subtitle = isPersonal
                ? 'Personal account'
                : account.accountType === 'Enterprise'
                ? 'GitHub Enterprise'
                : 'GitHub organization'

              return (
                <button
                  key={account.name}
                  onClick={() => handleSelectAccount(account.name)}
                  className={`w-full flex items-center gap-3 px-2.5 py-2.5 text-left rounded-lg
                    transition-all duration-150 ${indented ? 'pl-6' : ''} ${
                      isSelected
                        ? 'bg-[var(--nav-item-selected-bg)]'
                        : 'hover:bg-[var(--nav-item-hover-bg)]'
                    }`}
                >
                  <AccountIcon
                    className={`w-4 h-4 flex-shrink-0 ${
                      isSelected ? 'text-[var(--interactive-primary)]' : 'text-[var(--text-tertiary)]'
                    }`}
                  />
                  <div className="flex-1 min-w-0">
                    <span
                      className="text-[13px] font-medium block truncate text-[var(--text-primary)]"
                    >
                      {account.name}
                    </span>
                    <span className="text-[11px] text-[var(--text-tertiary)]">
                      {subtitle}
                    </span>
                  </div>
                  {isSelected && <Check className="w-4 h-4 text-[var(--interactive-primary)] flex-shrink-0" />}
                </button>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
