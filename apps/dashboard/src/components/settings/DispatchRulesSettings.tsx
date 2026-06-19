'use client'

import { useState, useEffect, useCallback } from 'react'
import { Check, Loader2, Save, Zap, AlertCircle, HelpCircle } from 'lucide-react'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { CustomInstructionsEditor } from './CustomInstructionsEditor'
import { EffectiveDispatchState } from './EffectiveDispatchState'
import { api, type TeamMember } from '@/lib/api'

/**
 * Dispatch Rules Settings tab for Settings page (Issue #1832)
 *
 * Manages background agent dispatch rules for the organization:
 * - Master enable/disable toggle
 * - Per-category on/off toggles
 * - Max concurrent agents setting
 * - Preferred provider dropdown
 * - Custom instructions textarea
 */

interface DispatchRule {
  category: string
  enabled: boolean
  backend: string
  agent: string
  note?: string
}

type WorkerProvider = 'claude' | 'codex' | 'gemini'

interface ProviderPoolConfig {
  provider: WorkerProvider
  maxConcurrent?: number
  maxPending?: number
}

interface DispatchRulesConfig {
  enabled: boolean
  rules: DispatchRule[]
  maxConcurrentAgents: number
  maxPendingQueueItems: number
  preferredProvider: WorkerProvider
  customInstructions?: string
  providerPools?: ProviderPoolConfig[]
  enabledCredentialOwners?: string[]
  preferredCredentialOwners?: string[]
  autoQueueNewIssues?: boolean  // #2147: Auto-queue newly created GitHub issues
}

const API_BASE = process.env['NEXT_PUBLIC_API_URL'] ?? ''

const PROVIDER_OPTIONS: { value: 'claude' | 'codex' | 'gemini'; label: string; description: string }[] = [
  { value: 'codex', label: 'Codex', description: 'OpenAI Codex model' },
  { value: 'claude', label: 'Claude', description: 'Anthropic Claude AI model' },
  { value: 'gemini', label: 'Gemini', description: 'Google Gemini model' },
]

const DEFAULT_CONFIG: DispatchRulesConfig = {
  enabled: false,
  rules: [],
  maxConcurrentAgents: 4,
  maxPendingQueueItems: 10,
  preferredProvider: 'codex',
  customInstructions: '',
  providerPools: [],
  enabledCredentialOwners: [],
  preferredCredentialOwners: [],
  autoQueueNewIssues: false,  // #2147: Default to disabled
}

function normalizeOwnerIds(ownerIds: string[] | undefined): string[] {
  return [...new Set((ownerIds ?? []).map((ownerId) => ownerId.trim()).filter(Boolean))]
}

function reconcilePreferredOwners(
  enabledOwnerIds: string[] | undefined,
  preferredOwnerIds: string[] | undefined,
  fallbackOrder: string[] = [],
): string[] {
  const enabled = normalizeOwnerIds(enabledOwnerIds)
  const enabledSet = new Set(enabled)
  const result: string[] = []

  for (const ownerId of [...normalizeOwnerIds(preferredOwnerIds), ...enabled, ...fallbackOrder]) {
    if (!enabledSet.has(ownerId) || result.includes(ownerId)) continue
    result.push(ownerId)
  }

  return result
}

export function DispatchRulesSettings() {
  const orgName = useSelectedWorkspace()
  const [config, setConfig] = useState<DispatchRulesConfig>(DEFAULT_CONFIG)
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [consumerPaused, setConsumerPaused] = useState(false)
  const [consumerLoading, setConsumerLoading] = useState(true)
  const [credentialOwnersDirty, setCredentialOwnersDirty] = useState(false)

  const approvedTeamMembers = teamMembers
    .filter((member) => member.approvalStatus !== 'pending')
    .sort((left, right) => (left.name || left.githubLogin).localeCompare(right.name || right.githubLogin))

  const fallbackOwnerOrder = approvedTeamMembers.map((member) => member.userId)

  // Fetch current dispatch rules from API
  const fetchDispatchRules = useCallback(async () => {
    if (!orgName) return

    setLoading(true)
    setSaveError(null)
    try {
      const [response, liveTeamResponse] = await Promise.all([
        fetch(`${API_BASE}/organizations/${encodeURIComponent(orgName)}/dispatch-rules`, {
          credentials: 'include',
        }),
        api
          .getLiveTeamMembers(orgName)
          .catch(async () => {
            const legacy = await api.getTeamMembers(orgName)
            return {
              members: legacy.members,
              totalMembers: legacy.members.length,
              lastSyncedAt: new Date(0).toISOString(),
              syncedBy: 'unknown',
              cacheStatus: 'stale' as const,
              owners: legacy.members.filter((member) => member.galRole === 'owner').length,
              admins: legacy.members.filter((member) => member.galRole === 'admin').length,
              developers: legacy.members.filter((member) => member.galRole === 'developer').length,
            }
          }),
      ])

      setTeamMembers(liveTeamResponse.members ?? [])

      if (!response.ok) {
        if (response.status === 404) {
          // No rules configured yet - use defaults
          setConfig(DEFAULT_CONFIG)
          setCredentialOwnersDirty(false)
          return
        }
        throw new Error(`Failed to fetch dispatch rules: ${response.statusText}`)
      }

      const data = await response.json()
      const enabledCredentialOwners = normalizeOwnerIds(data.enabledCredentialOwners)
      const preferredCredentialOwners = reconcilePreferredOwners(
        enabledCredentialOwners,
        data.preferredCredentialOwners,
        liveTeamResponse.members?.map((member) => member.userId) ?? [],
      )
      setConfig({
        enabled: data.enabled ?? false,
        rules: data.rules ?? [],
        maxConcurrentAgents: data.maxConcurrentAgents ?? 4,
        maxPendingQueueItems: data.maxPendingQueueItems ?? 10,
        preferredProvider: data.preferredProvider ?? 'codex',
        customInstructions: data.customInstructions ?? '',
        providerPools: data.providerPools ?? [],
        enabledCredentialOwners,
        preferredCredentialOwners,
      })
      setCredentialOwnersDirty(false)
    } catch (error) {
      console.error('Failed to fetch dispatch rules:', error)
      setSaveError(error instanceof Error ? error.message : 'Failed to load dispatch rules')
    } finally {
      setLoading(false)
    }
  }, [orgName])

  // Fetch consumer state to show paused status
  const fetchConsumerState = useCallback(async () => {
    setConsumerLoading(true)
    try {
      const health = await api.getQueueConsumerHealth()
      setConsumerPaused(health.metrics.paused)
    } catch (error) {
      console.error('Failed to fetch consumer state:', error)
      // Non-critical - just assume not paused
      setConsumerPaused(false)
    } finally {
      setConsumerLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchDispatchRules()
    fetchConsumerState()
  }, [fetchDispatchRules, fetchConsumerState])

  // Save updated dispatch rules to API
  const handleSave = async () => {
    if (!orgName) return

    setSaving(true)
    setSaveError(null)
    setSaveSuccess(false)

    try {
      const response = await fetch(`${API_BASE}/organizations/${encodeURIComponent(orgName)}/dispatch-rules`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          enabled: config.enabled,
          rules: config.rules,
          maxConcurrentAgents: config.maxConcurrentAgents,
          maxPendingQueueItems: config.maxPendingQueueItems,
          preferredProvider: config.preferredProvider,
          customInstructions: config.customInstructions || undefined,
          providerPools: config.providerPools,
          ...(credentialOwnersDirty ? {
            enabledCredentialOwners: normalizeOwnerIds(config.enabledCredentialOwners),
            preferredCredentialOwners: reconcilePreferredOwners(
              config.enabledCredentialOwners,
              config.preferredCredentialOwners,
              fallbackOwnerOrder,
            ),
          } : {}),
        }),
      })

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}))
        throw new Error(errData.error || `Failed to save: ${response.statusText}`)
      }

      setSaveSuccess(true)
      setCredentialOwnersDirty(false)
      setTimeout(() => setSaveSuccess(false), 3000)
    } catch (error) {
      console.error('Failed to save dispatch rules:', error)
      setSaveError(error instanceof Error ? error.message : 'Failed to save dispatch rules')
    } finally {
      setSaving(false)
    }
  }

  // Toggle master enable/disable
  const handleMasterToggle = () => {
    setConfig(prev => ({ ...prev, enabled: !prev.enabled }))
  }

  // Toggle a specific category rule
  const handleCategoryToggle = (category: string) => {
    setConfig(prev => ({
      ...prev,
      rules: prev.rules.map(rule =>
        rule.category === category ? { ...rule, enabled: !rule.enabled } : rule
      ),
    }))
  }

  // Update max concurrent agents
  const handleMaxConcurrentChange = (value: number) => {
    const clamped = Math.max(1, Math.min(20, value))
    setConfig(prev => ({ ...prev, maxConcurrentAgents: clamped }))
  }

  // Update max pending queue items
  const handleMaxPendingQueueItemsChange = (value: number) => {
    const clamped = Math.max(1, Math.min(1000, value))
    setConfig(prev => ({ ...prev, maxPendingQueueItems: clamped }))
  }

  // Update preferred provider
  const handleProviderChange = (provider: 'claude' | 'codex' | 'gemini') => {
    setConfig(prev => ({ ...prev, preferredProvider: provider }))
  }

  // Update custom instructions
  const handleCustomInstructionsChange = (value: string) => {
    setConfig(prev => ({ ...prev, customInstructions: value }))
  }

  const handleCredentialOwnerEnabledChange = (userId: string, enabled: boolean) => {
    setCredentialOwnersDirty(true)
    setConfig((prev) => {
      const nextEnabledOwners = enabled
        ? normalizeOwnerIds([...(prev.enabledCredentialOwners ?? []), userId])
        : normalizeOwnerIds((prev.enabledCredentialOwners ?? []).filter((ownerId) => ownerId !== userId))

      return {
        ...prev,
        enabledCredentialOwners: nextEnabledOwners,
        preferredCredentialOwners: reconcilePreferredOwners(
          nextEnabledOwners,
          prev.preferredCredentialOwners,
          fallbackOwnerOrder,
        ),
      }
    })
  }

  const handleSetPrimaryCredentialOwner = (userId: string) => {
    setCredentialOwnersDirty(true)
    setConfig((prev) => {
      const nextEnabledOwners = normalizeOwnerIds([...(prev.enabledCredentialOwners ?? []), userId])
      const preferredRemainder = reconcilePreferredOwners(
        nextEnabledOwners,
        prev.preferredCredentialOwners,
        fallbackOwnerOrder,
      ).filter((ownerId) => ownerId !== userId)

      return {
        ...prev,
        enabledCredentialOwners: nextEnabledOwners,
        preferredCredentialOwners: [userId, ...preferredRemainder],
      }
    })
  }

  // Update provider pool configuration (#2098)
  const handleProviderPoolChange = (provider: WorkerProvider, field: 'maxConcurrent' | 'maxPending', value: number | undefined) => {
    setConfig(prev => {
      const pools = prev.providerPools || []
      const existingPoolIndex = pools.findIndex(p => p.provider === provider)

      if (value === undefined || value === 0) {
        // Remove the field if undefined/0
        if (existingPoolIndex >= 0) {
          const updatedPool = { ...pools[existingPoolIndex] }
          delete updatedPool[field]
          // If pool has no settings left, remove it entirely
          if (!updatedPool.maxConcurrent && !updatedPool.maxPending) {
            return {
              ...prev,
              providerPools: pools.filter((_, i) => i !== existingPoolIndex)
            }
          }
          const newPools = [...pools]
          newPools[existingPoolIndex] = updatedPool
          return { ...prev, providerPools: newPools }
        }
        return prev
      }

      // Add or update the field
      if (existingPoolIndex >= 0) {
        const newPools = [...pools]
        newPools[existingPoolIndex] = {
          ...newPools[existingPoolIndex],
          [field]: value
        }
        return { ...prev, providerPools: newPools }
      } else {
        return {
          ...prev,
          providerPools: [...pools, { provider, [field]: value }]
        }
      }
    })
  }

  // Get provider pool value
  const getProviderPoolValue = (provider: WorkerProvider, field: 'maxConcurrent' | 'maxPending'): number | undefined => {
    const pool = config.providerPools?.find(p => p.provider === provider)
    return pool?.[field]
  }

  const enabledCredentialOwnerSet = new Set(normalizeOwnerIds(config.enabledCredentialOwners))
  const preferredCredentialOwners = reconcilePreferredOwners(
    config.enabledCredentialOwners,
    config.preferredCredentialOwners,
    fallbackOwnerOrder,
  )
  const primaryCredentialOwner = preferredCredentialOwners[0] ?? null

  if (!orgName) {
    return (
      <div className="dashboard-card p-6">
        <div className="text-center py-8">
          <AlertCircle className="w-12 h-12 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Select a workspace to configure dispatch rules.
          </p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="dashboard-card p-6">
        <div className="text-center py-8" style={{ color: 'var(--text-muted)' }}>
          <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2" />
          Loading dispatch rules...
        </div>
      </div>
    )
  }

  const anyCategoryEnabled = config.rules.some(r => r.enabled)

  return (
    <>
      {/* Effective Dispatch State Panel (Issue #1999) */}
      {!consumerLoading && (
        <EffectiveDispatchState
          globalEnabled={config.enabled}
          consumerPaused={consumerPaused}
          anyCategoryEnabled={anyCategoryEnabled}
        />
      )}

      {/* Master Toggle */}
      <div className="dashboard-card p-6">
        <div className="flex items-center gap-3 mb-2">
          <Zap className="w-5 h-5" style={{ color: 'var(--accent)' }} />
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Background Agent Dispatch
          </h2>
        </div>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          Control how background agents are automatically dispatched for your organization.
          Enable this to let GAL automatically route work items to available AI coding agents.
        </p>

        <div
          className="flex items-center justify-between p-4 rounded-lg"
          style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
        >
          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                Enable Automatic Dispatch
              </p>
              <div className="group relative">
                <HelpCircle className="w-3.5 h-3.5" style={{ color: 'var(--text-muted)' }} />
                <div
                  className="absolute left-0 top-6 w-64 p-3 rounded-lg shadow-lg hidden group-hover:block z-10"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <strong>Scope:</strong> Organization-wide master switch.
                    <br />
                    <strong>Effect:</strong> When OFF, no automatic dispatch occurs regardless of category settings.
                  </p>
                </div>
              </div>
            </div>
            <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {config.enabled
                ? 'Agents will be automatically dispatched based on category rules below'
                : 'Dispatch is disabled - no agents will be auto-started'}
            </p>
          </div>
          <button
            onClick={handleMasterToggle}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
              config.enabled ? 'bg-[var(--status-success)]' : 'bg-[var(--border-subtle)]'
            }`}
            role="switch"
            aria-checked={config.enabled}
          >
            <span
              className={`inline-block h-4 w-4 rounded-full bg-[var(--surface-base)] shadow transition-transform ${
                config.enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Category Rules */}
      <div className="dashboard-card p-6">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Dispatch Categories
          </h2>
          <div className="group relative">
            <HelpCircle className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            <div
              className="absolute left-0 top-6 w-64 p-3 rounded-lg shadow-lg hidden group-hover:block z-10"
              style={{
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                <strong>Scope:</strong> Per-category control.
                <br />
                <strong>Effect:</strong> Only active when global dispatch is enabled and consumer is not paused.
              </p>
            </div>
          </div>
        </div>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          Configure which categories of work items should trigger automatic agent dispatch.
          {!config.enabled && (
            <span className="block mt-1 text-xs" style={{ color: 'var(--status-warning-text)' }}>
              ⚠️ Category toggles are disabled because global auto-dispatch is OFF.
            </span>
          )}
        </p>

        {config.rules.length === 0 ? (
          <div
            className="text-center py-8 rounded-lg"
            style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
          >
            <Zap className="w-8 h-8 mx-auto mb-2" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
              No dispatch categories configured yet.
            </p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              Categories will appear here once the API returns available dispatch rules.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {config.rules.map((rule) => (
              <div
                key={rule.category}
                className={`p-4 rounded-lg transition-opacity ${!config.enabled ? 'opacity-60' : ''}`}
                style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                        {rule.category}
                      </p>
                      <span
                        className="text-xs px-1.5 py-0.5 rounded"
                        style={{ backgroundColor: 'var(--accent-bg)', color: 'var(--accent)' }}
                      >
                        {rule.agent}
                      </span>
                    </div>
                    {rule.note && (
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        {rule.note}
                      </p>
                    )}
                    <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      Backend: {rule.backend}
                    </p>
                    {!config.enabled && (
                      <p className="text-xs mt-2 italic" style={{ color: 'var(--status-warning-text)' }}>
                        Inactive (global dispatch is OFF)
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <button
                      onClick={() => handleCategoryToggle(rule.category)}
                      disabled={!config.enabled}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed ${
                        rule.enabled && config.enabled
                          ? 'bg-[var(--status-success)]'
                          : 'bg-[var(--border-subtle)]'
                      }`}
                      role="switch"
                      aria-checked={rule.enabled && config.enabled}
                      title={!config.enabled ? 'Enable global auto-dispatch first' : undefined}
                    >
                      <span
                        className={`inline-block h-4 w-4 rounded-full bg-[var(--surface-base)] shadow transition-transform ${
                          rule.enabled && config.enabled ? 'translate-x-6' : 'translate-x-1'
                        }`}
                      />
                    </button>
                    {!config.enabled && (
                      <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                        Disabled
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Concurrency and Provider Settings */}
      <div className="dashboard-card p-6">
        <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
          Agent Configuration
        </h2>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          Control how many agents run simultaneously and which AI provider to use.
        </p>

        <div className="space-y-6">
          {/* Max Concurrent Agents */}
          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: 'var(--text-primary)' }}
              htmlFor="max-concurrent"
            >
              Max Concurrent Agents
            </label>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              Maximum number of background agents that can run at the same time (1-20).
            </p>
            <div className="flex items-center gap-3">
              <input
                id="max-concurrent"
                type="number"
                min={1}
                max={20}
                value={config.maxConcurrentAgents}
                onChange={(e) => handleMaxConcurrentChange(parseInt(e.target.value, 10) || 1)}
                className="w-24 px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-1"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                agents (default: 4)
              </span>
            </div>
          </div>

          {/* Max Pending Queue Items */}
          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: 'var(--text-primary)' }}
              htmlFor="max-pending-queue-items"
            >
              Max Pending Queue Items
            </label>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              Hard cap on queued work items waiting to be processed (1-1000).
            </p>
            <div className="flex items-center gap-3">
              <input
                id="max-pending-queue-items"
                type="number"
                min={1}
                max={1000}
                value={config.maxPendingQueueItems}
                onChange={(e) => handleMaxPendingQueueItemsChange(parseInt(e.target.value, 10) || 1)}
                className="w-24 px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-1"
                style={{
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              />
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                items (default: 10)
              </span>
            </div>
          </div>

          {/* Preferred Provider */}
          <div>
            <label
              className="block text-sm font-medium mb-2"
              style={{ color: 'var(--text-primary)' }}
            >
              Preferred Provider
            </label>
            <p className="text-xs mb-3" style={{ color: 'var(--text-muted)' }}>
              The default AI provider used for dispatched agents. Individual rules may override this.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {PROVIDER_OPTIONS.map(option => (
                <button
                  key={option.value}
                  onClick={() => handleProviderChange(option.value)}
                  className={`p-4 rounded-lg border text-left transition-all ${
                    config.preferredProvider === option.value
                      ? 'border-[var(--status-success)] bg-[var(--status-success-light)]'
                      : 'border-[var(--border-subtle)] hover:border-[var(--border-interactive)]'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm" style={{ color: 'var(--text-primary)' }}>
                      {option.label}
                    </span>
                    {config.preferredProvider === option.value && (
                      <Check className="w-4 h-4 text-[var(--status-success)]" />
                    )}
                  </div>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {option.description}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Credential Owner Policy (#4673 / #4729) */}
      <div className="dashboard-card p-6">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Token Owners
          </h2>
          <div className="group relative">
            <HelpCircle className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            <div
              className="absolute left-0 top-6 w-72 p-3 rounded-lg shadow-lg hidden group-hover:block z-10"
              style={{
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                Enable which team members may spend background-agent compute, and choose who is primary.
                The primary owner is first in <code>preferredCredentialOwners</code> and receives new work until auto-switch moves them back.
              </p>
            </div>
          </div>
        </div>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          This is the internal token control plane for background agents. Disabled owners are excluded from manual dispatch, queue dispatch, and fallback.
        </p>

        {approvedTeamMembers.length === 0 ? (
          <div
            className="p-4 rounded-lg text-sm"
            style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
          >
            No approved team members available yet. Sync team members first.
          </div>
        ) : (
          <div className="space-y-3">
            {approvedTeamMembers
              .slice()
              .sort((left, right) => {
                const leftIndex = preferredCredentialOwners.indexOf(left.userId)
                const rightIndex = preferredCredentialOwners.indexOf(right.userId)
                const normalizedLeft = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex
                const normalizedRight = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex
                if (normalizedLeft !== normalizedRight) return normalizedLeft - normalizedRight
                return left.githubLogin.localeCompare(right.githubLogin)
              })
              .map((member) => {
                const isEnabled = enabledCredentialOwnerSet.has(member.userId)
                const isPrimary = primaryCredentialOwner === member.userId

                return (
                  <div
                    key={member.userId}
                    className="flex flex-col gap-3 rounded-lg p-4 sm:flex-row sm:items-center sm:justify-between"
                    style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {member.name || member.githubLogin}
                        </span>
                        <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                          @{member.githubLogin}
                        </span>
                        {isPrimary && (
                          <span
                            className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium"
                            style={{
                              backgroundColor: 'var(--status-success-light)',
                              color: 'var(--status-success-text)',
                            }}
                          >
                            <Check className="h-3 w-3" />
                            Primary
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-xs" style={{ color: 'var(--text-muted)' }}>
                        {member.galRole} · {member.githubOrgRole}
                      </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <label className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-primary)' }}>
                        <input
                          type="checkbox"
                          checked={isEnabled}
                          onChange={(event) => handleCredentialOwnerEnabledChange(member.userId, event.target.checked)}
                        />
                        Enabled
                      </label>
                      <button
                        type="button"
                        onClick={() => handleSetPrimaryCredentialOwner(member.userId)}
                        className="rounded-lg px-3 py-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                        style={{
                          backgroundColor: isPrimary ? 'var(--status-success-light)' : 'var(--bg-primary)',
                          border: '1px solid var(--border-subtle)',
                          color: isPrimary ? 'var(--status-success-text)' : 'var(--text-secondary)',
                        }}
                      >
                        {isPrimary ? 'Primary token' : 'Make primary'}
                      </button>
                    </div>
                  </div>
                )
              })}
          </div>
        )}

        {approvedTeamMembers.length > 0 && enabledCredentialOwnerSet.size === 0 && (
          <div
            className="mt-4 flex items-start gap-2 rounded-lg p-3 text-xs"
            style={{
              backgroundColor: 'var(--status-warning-light)',
              border: '1px solid var(--status-warning)',
              color: 'var(--status-warning-text)',
            }}
          >
            <AlertCircle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
            <span>No credential owners are enabled. If you save this, background dispatch will fail closed for all users.</span>
          </div>
        )}
      </div>

      {/* Per-Provider Pool Tuning (#2098) */}
      <div className="dashboard-card p-6">
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
            Per-Provider Limits
          </h2>
          <div className="group relative">
            <HelpCircle className="w-4 h-4" style={{ color: 'var(--text-muted)' }} />
            <div
              className="absolute left-0 top-6 w-72 p-3 rounded-lg shadow-lg hidden group-hover:block z-10"
              style={{
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-subtle)',
              }}
            >
              <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                <strong>Optional:</strong> Override global limits for specific providers.
                <br />
                <strong>Leave blank</strong> to use global settings above.
                <br />
                <strong>Set to 0</strong> to disable a provider pool entirely.
              </p>
            </div>
          </div>
        </div>
        <p className="text-sm mb-6" style={{ color: 'var(--text-secondary)' }}>
          Fine-tune concurrency and queue limits per provider for better throughput and reliability.
          Empty fields inherit from global settings. A value of 0 disables that provider.
        </p>

        <div className="space-y-4">
          {PROVIDER_OPTIONS.map(option => {
            const maxConcurrent = getProviderPoolValue(option.value, 'maxConcurrent')
            const maxPending = getProviderPoolValue(option.value, 'maxPending')

            return (
              <div
                key={option.value}
                className="p-4 rounded-lg"
                style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                      {option.label}
                    </h3>
                    <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                      {option.description}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* Max Concurrent */}
                  <div>
                    <label
                      className="block text-xs font-medium mb-2"
                      style={{ color: 'var(--text-secondary)' }}
                      htmlFor={`${option.value}-max-concurrent`}
                    >
                      Max Concurrent
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id={`${option.value}-max-concurrent`}
                        type="number"
                        min={0}
                        max={20}
                        value={maxConcurrent ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? undefined : parseInt(e.target.value, 10)
                          handleProviderPoolChange(option.value, 'maxConcurrent', val)
                        }}
                        placeholder={`${config.maxConcurrentAgents} (global)`}
                        className="flex-1 px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-1"
                        style={{
                          backgroundColor: 'var(--bg-primary)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      />
                      {maxConcurrent !== undefined && (
                        <button
                          onClick={() => handleProviderPoolChange(option.value, 'maxConcurrent', undefined)}
                          className="p-1.5 rounded hover:bg-[var(--bg-tertiary)] transition-colors"
                          title="Clear (use global)"
                        >
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>✕</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Max Pending */}
                  <div>
                    <label
                      className="block text-xs font-medium mb-2"
                      style={{ color: 'var(--text-secondary)' }}
                      htmlFor={`${option.value}-max-pending`}
                    >
                      Max Pending Queue
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        id={`${option.value}-max-pending`}
                        type="number"
                        min={0}
                        max={1000}
                        value={maxPending ?? ''}
                        onChange={(e) => {
                          const val = e.target.value === '' ? undefined : parseInt(e.target.value, 10)
                          handleProviderPoolChange(option.value, 'maxPending', val)
                        }}
                        placeholder={`${config.maxPendingQueueItems} (global)`}
                        className="flex-1 px-3 py-2 rounded-lg text-sm border focus:outline-none focus:ring-1"
                        style={{
                          backgroundColor: 'var(--bg-primary)',
                          border: '1px solid var(--border-subtle)',
                          color: 'var(--text-primary)',
                        }}
                      />
                      {maxPending !== undefined && (
                        <button
                          onClick={() => handleProviderPoolChange(option.value, 'maxPending', undefined)}
                          className="p-1.5 rounded hover:bg-[var(--bg-tertiary)] transition-colors"
                          title="Clear (use global)"
                        >
                          <span className="text-xs" style={{ color: 'var(--text-muted)' }}>✕</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Custom Instructions */}
      <div className="dashboard-card p-6">
        <h2 className="text-lg font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
          Custom Instructions
        </h2>
        <CustomInstructionsEditor
          value={config.customInstructions || ''}
          onChange={handleCustomInstructionsChange}
          provider={config.preferredProvider}
        />
      </div>

      {/* Save Button and Status */}
      <div className="dashboard-card p-6">
        <div className="flex items-center justify-between">
          <div>
            {saveError && (
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--status-danger-text)' }}>
                <AlertCircle className="w-4 h-4" />
                <span>{saveError}</span>
              </div>
            )}
            {saveSuccess && (
              <div className="flex items-center gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                <Check className="w-4 h-4" />
                <span>Dispatch rules saved successfully</span>
              </div>
            )}
          </div>
          <button
            onClick={handleSave}
            disabled={saving || !orgName}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            style={{
              backgroundColor: 'var(--accent)',
              color: 'var(--text-on-accent)',
            }}
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4" />
                Save Rules
              </>
            )}
          </button>
        </div>
      </div>
    </>
  )
}
