'use client'

/**
 * BulkApproveDialog - Multi-step modal wizard for bulk config approval
 *
 * Steps:
 * 1. Summary — count + breakdown by config type
 * 2. Conflict Detection — identify groups with divergent instances
 * 3. Security Review — scan content for risky patterns
 * 4. Final Confirmation — summary + publish button
 */

import { useState, useEffect, useMemo, useCallback } from 'react'
import { X, Loader2, ChevronRight, AlertTriangle, Shield, ShieldAlert, CheckCircle2, FileCode, ArrowRight } from 'lucide-react'
import { api, type DiscoveredConfigGroup, type AgentPlatform } from '@/lib/api'
import { scanForSecurityIssues, type SecurityFlag } from '../../utils/security-scanner'
import { type StageSelection } from '@/lib/approvalHandoff'
import { normalizeDiscoveredConfigType } from '@/lib/discoveryPolicy'

// BulkApproveRequest kept for backwards-compatibility with any external callers.
// The dashboard uses this dialog to resolve conflicts/security review, then
// publishes exact repo/path selections directly from Discovery.
export interface BulkApproveRequest {
  perPlatform: Array<{
    platform: AgentPlatform
    configSelections: Array<{
      type: string
      name: string
      platform?: string
      preferredInstance?: { repo: string; path: string }
    }>
  }>
}

interface BulkApproveDialogProps {
  isOpen: boolean
  onClose: () => void
  /** Called with resolved selections when the user confirms. */
  onConfirm: (selections: StageSelection[], policyName?: string) => void | Promise<void>
  selectedGroups: DiscoveredConfigGroup[]
  orgName: string
  platform: AgentPlatform | 'all'
  fetchedContent: Map<string, string>
}

type Step = 'summary' | 'conflicts' | 'security' | 'confirm'

interface ConflictGroup {
  group: DiscoveredConfigGroup
  groupKey: string
  selectedInstanceIdx: number
}

export function BulkApproveDialog({
  isOpen,
  onClose,
  onConfirm,
  selectedGroups,
  orgName,
  platform,
  fetchedContent,
}: BulkApproveDialogProps) {
  const [step, setStep] = useState<Step>('summary')
  const [conflictResolutions, setConflictResolutions] = useState<Map<string, number>>(new Map())
  const [securityFlags, setSecurityFlags] = useState<SecurityFlag[]>([])
  const [securityAcknowledged, setSecurityAcknowledged] = useState(false)
  const [contentLoading, setContentLoading] = useState(false)
  const [loadedContent, setLoadedContent] = useState<Map<string, string>>(new Map())
  const [submitting, setSubmitting] = useState(false)
  const [policyName, setPolicyName] = useState('')

  // Reset state when dialog opens
  useEffect(() => {
    if (isOpen) {
      setStep('summary')
      setConflictResolutions(new Map())
      setSecurityFlags([])
      setSecurityAcknowledged(false)
      setContentLoading(false)
      setLoadedContent(new Map())
      setSubmitting(false)
      setPolicyName('')
    }
  }, [isOpen])

  // Type breakdown
  const typeBreakdown = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const g of selectedGroups) {
      counts[g.type] = (counts[g.type] || 0) + 1
    }
    return counts
  }, [selectedGroups])

  // Build a platform-qualified key for a group to avoid cross-platform collisions
  const groupKey = (g: DiscoveredConfigGroup) => `${g.platform || 'claude'}:${g.type}:${g.name}`

  // Detect conflicts: groups with multiple instances that have different hashes
  const conflictGroups = useMemo<ConflictGroup[]>(() => {
    return selectedGroups
      .filter(g => {
        if (g.instances.length <= 1) return false
        const hashes = new Set(g.instances.map(i => i.hash).filter(Boolean))
        return hashes.size > 1
      })
      .map(g => ({
        group: g,
        groupKey: groupKey(g),
        // Pre-select most recent instance
        selectedInstanceIdx: g.instances
          .map((inst, idx) => ({ idx, date: new Date(inst.lastModified).getTime() }))
          .sort((a, b) => b.date - a.date)[0]?.idx ?? 0,
      }))
  }, [selectedGroups])

  // Initialize conflict resolutions with defaults
  useEffect(() => {
    if (conflictGroups.length > 0 && conflictResolutions.size === 0) {
      const defaults = new Map<string, number>()
      for (const cg of conflictGroups) {
        defaults.set(cg.groupKey, cg.selectedInstanceIdx)
      }
      setConflictResolutions(defaults)
    }
  }, [conflictGroups, conflictResolutions.size])

  const hasConflicts = conflictGroups.length > 0
  const allConflictsResolved = conflictGroups.every(cg => conflictResolutions.has(cg.groupKey))

  // Get content for a group instance (from fetchedContent, loaded content, or instance.content)
  // Accepts optional extra map for freshly-fetched content not yet in state
  const getContent = useCallback((repo: string, path: string, instanceContent?: string, extraContent?: Map<string, string>): string => {
    const key = `${repo}:${path}`
    return instanceContent || fetchedContent.get(key) || loadedContent.get(key) || extraContent?.get(key) || ''
  }, [fetchedContent, loadedContent])

  // Fetch missing content for security scan — returns the newly fetched content map
  const fetchMissingContent = useCallback(async (): Promise<Map<string, string>> => {
    const freshContent = new Map<string, string>()
    const missing: { repo: string; path: string }[] = []
    for (const g of selectedGroups) {
      for (const inst of g.instances) {
        const key = `${inst.repo}:${inst.path}`
        if (!inst.content && !fetchedContent.has(key) && !loadedContent.has(key)) {
          missing.push({ repo: inst.repo, path: inst.path })
        }
      }
    }

    if (missing.length === 0) return freshContent

    setContentLoading(true)
    try {
      // Fetch in batches of 50
      for (let i = 0; i < missing.length; i += 50) {
        const batch = missing.slice(i, i + 50)
        const results = await api.getConfigContentBatch(orgName, batch)
        for (const item of batch) {
          const key = `${item.repo}:${item.path}`
          if (results[key]?.content) {
            freshContent.set(key, results[key].content)
          }
        }
        // Also update state for other uses
        setLoadedContent(prev => {
          const next = new Map(prev)
          for (const [k, v] of freshContent) next.set(k, v)
          return next
        })
      }
    } catch (err) {
      console.error('Failed to fetch config content for security scan:', err)
    } finally {
      setContentLoading(false)
    }
    return freshContent
  }, [selectedGroups, fetchedContent, loadedContent, orgName])

  // Run security scan — accepts freshly-fetched content to avoid stale closure issue
  const runSecurityScan = useCallback((freshContent?: Map<string, string>) => {
    const scanInputs = selectedGroups.map(g => {
      // Use the preferred instance (from conflict resolution) or most recent
      const gKey = groupKey(g)
      const instanceIdx = conflictResolutions.get(gKey) ?? 0
      const instance = g.instances[instanceIdx] || g.instances[0]
      const content = getContent(instance.repo, instance.path, instance.content ?? undefined, freshContent)

      return {
        key: gKey,
        name: g.name,
        type: g.type,
        content,
      }
    })

    const flags = scanForSecurityIssues(scanInputs)
    setSecurityFlags(flags)
  }, [selectedGroups, conflictResolutions, getContent])

  const handleNext = async () => {
    if (step === 'summary') {
      if (hasConflicts) {
        setStep('conflicts')
      } else {
        // Skip conflicts, go to security
        setContentLoading(true)
        const freshContent = await fetchMissingContent()
        runSecurityScan(freshContent)
        setContentLoading(false)
        setStep('security')
      }
    } else if (step === 'conflicts') {
      setContentLoading(true)
      const freshContent = await fetchMissingContent()
      runSecurityScan(freshContent)
      setContentLoading(false)
      setStep('security')
    } else if (step === 'security') {
      setStep('confirm')
    }
  }

  const handleSubmit = async () => {
    // Build resolved StageSelection[] — each entry carries exact repo+path so conflict
    // choices survive the handoff to Approved Config without any fuzzy re-lookup.
    const selections: StageSelection[] = selectedGroups.map(g => {
      const gKey = groupKey(g)
      const instanceIdx = conflictResolutions.get(gKey)
      const instance = instanceIdx !== undefined ? g.instances[instanceIdx] : g.instances[0]

      // Determine the effective platform for this group.
      // When the filter is 'all', default to 'claude' (matches existing behaviour).
      const groupPlatform = g.platform || (platform === 'all' ? 'claude' : platform)

      return {
        platform: groupPlatform,
        type: normalizeDiscoveredConfigType(g.type),
        name: g.name,
        repo: instance?.repo ?? '',
        path: instance?.path ?? '',
      }
    })

    setSubmitting(true)
    try {
      await onConfirm(selections, policyName.trim() || undefined)
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  const stepLabels: Record<Step, string> = {
    summary: 'Summary',
    conflicts: 'Conflicts',
    security: 'Security Review',
    confirm: 'Confirm',
  }

  const steps: Step[] = hasConflicts
    ? ['summary', 'conflicts', 'security', 'confirm']
    : ['summary', 'security', 'confirm']
  const stepIndex = steps.indexOf(step)

  const typeLabels: Record<string, string> = {
    instructions: 'AGENTS.md',
    command: 'Commands',
    hook: 'Hooks',
    settings: 'Settings',
    subagent: 'Subagents',
    agent: 'Subagent', // backward compat for cached configs with type 'agent'
    mcp: 'MCP Servers',
  }

  const dangerFlags = securityFlags.filter(f => f.severity === 'danger')
  const warningFlags = securityFlags.filter(f => f.severity === 'warning')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-2xl mx-4 rounded-xl shadow-2xl max-h-[85vh] flex flex-col"
        style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b flex-shrink-0" style={{ borderColor: 'var(--border-subtle)' }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--interactive-secondary)]/10">
              <Shield className="w-5 h-5 text-[var(--interactive-secondary)]" />
            </div>
            <div>
              <h2 className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>
                Publish Configs
              </h2>
              {/* Step indicator */}
              <div className="flex items-center gap-1 mt-0.5">
                {steps.map((s, idx) => (
                  <span key={s} className="flex items-center gap-1">
                    <span className={`text-[10px] font-medium ${s === step ? 'text-[var(--interactive-secondary)]' : 'text-[var(--text-muted)]'}`}>
                      {stepLabels[s]}
                    </span>
                    {idx < steps.length - 1 && (
                      <ChevronRight className="w-3 h-3 text-[var(--text-muted)]" />
                    )}
                  </span>
                ))}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg transition-colors hover:bg-[var(--surface-overlay)]"
            style={{ color: 'var(--text-muted)' }}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto flex-1">
          {/* Step 1: Summary */}
          {step === 'summary' && (
            <div>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                You are about to publish <strong style={{ color: 'var(--text-primary)' }}>{selectedGroups.length} config{selectedGroups.length !== 1 ? 's' : ''}</strong> into the org policy.
              </p>

              {/* Type breakdown */}
              <div className="rounded-lg border p-4 mb-4" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-tertiary)' }}>
                <p className="text-xs font-medium mb-3" style={{ color: 'var(--text-muted)' }}>Breakdown by Type</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {Object.entries(typeBreakdown).map(([type, count]) => (
                    <div key={type} className="flex items-center gap-2">
                      <FileCode className="w-4 h-4 text-[var(--text-muted)]" />
                      <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
                        <strong>{count}</strong> {typeLabels[type] || type}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {hasConflicts && (
                <div className="rounded-lg border p-3 flex items-start gap-2" style={{ borderColor: 'var(--status-warning)', backgroundColor: 'var(--status-warning-light)' }}>
                  <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: 'var(--status-warning-text)' }} />
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    <strong style={{ color: 'var(--status-warning-text)' }}>{conflictGroups.length} config{conflictGroups.length !== 1 ? 's have' : ' has'} conflicts</strong> — different versions exist across repos. You&apos;ll resolve these in the next step.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Step 2: Conflict Detection */}
          {step === 'conflicts' && (
            <div>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                The following configs have different versions across repos. Choose which version to publish.
              </p>

              <div className="space-y-4">
                {conflictGroups.map((cg) => {
                  const selectedIdx = conflictResolutions.get(cg.groupKey) ?? cg.selectedInstanceIdx
                  return (
                    <div key={cg.groupKey} className="rounded-lg border p-4" style={{ borderColor: 'var(--border-subtle)' }}>
                      <div className="flex items-center gap-2 mb-3">
                        <AlertTriangle className="w-4 h-4" style={{ color: 'var(--status-warning-text)' }} />
                        <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                          {cg.group.name}
                        </span>
                        <span className="text-[10px] px-1.5 py-0.5 rounded bg-[var(--surface-sunken)] text-[var(--text-secondary)]">
                          {cg.group.type}
                        </span>
                      </div>

                      <div className="space-y-2">
                        {cg.group.instances.map((inst, idx) => {
                          const isSelected = selectedIdx === idx
                          const formattedDate = inst.lastModified
                            ? new Date(inst.lastModified).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : 'Unknown'
                          const content = getContent(inst.repo, inst.path, inst.content ?? undefined)

                          return (
                            <label
                              key={`${inst.repo}-${idx}`}
                              className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                                isSelected
                                  ? 'border-[var(--interactive-secondary)] bg-[var(--interactive-secondary)]/5'
                                  : 'border-[var(--border-subtle)] hover:border-[var(--border-default)]'
                              }`}
                            >
                              <input
                                type="radio"
                                name={`conflict-${cg.groupKey}`}
                                checked={isSelected}
                                onChange={() => {
                                  setConflictResolutions(prev => new Map(prev).set(cg.groupKey, idx))
                                }}
                                className="mt-1 text-[var(--interactive-primary)]"
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2 flex-wrap">
                                  <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{inst.repo}</span>
                                  {idx === cg.selectedInstanceIdx && (
                                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-[var(--interactive-secondary)] text-[var(--text-on-accent)]">
                                      Most Recent
                                    </span>
                                  )}
                                </div>
                                <code className="text-xs text-[var(--text-muted)] block mt-0.5">{inst.path}</code>
                                <span className="text-[10px] text-[var(--text-muted)]">Modified {formattedDate}</span>
                                {content && (
                                  <pre className="text-xs mt-2 p-2 rounded bg-[var(--surface-sunken)] text-[var(--text-secondary)] max-h-16 overflow-hidden border border-[var(--border-subtle)]">
                                    {content.slice(0, 200)}{content.length > 200 ? '...' : ''}
                                  </pre>
                                )}
                              </div>
                            </label>
                          )
                        })}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          {/* Step 3: Security Review */}
          {step === 'security' && (
            <div>
              {contentLoading ? (
                <div className="text-center py-8">
                  <Loader2 className="w-6 h-6 animate-spin mx-auto mb-2 text-[var(--text-muted)]" />
                  <p className="text-sm text-[var(--text-muted)]">Scanning configs for security issues...</p>
                </div>
              ) : securityFlags.length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle2 className="w-10 h-10 mx-auto mb-3 text-[var(--status-success)]" />
                  <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
                    No security concerns detected
                  </p>
                  <p className="text-xs mt-1 text-[var(--text-muted)]">
                    All {selectedGroups.length} configs passed the security scan.
                  </p>
                </div>
              ) : (
                <div>
                  <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                    Found <strong style={{ color: 'var(--status-warning-text)' }}>{securityFlags.length} security flag{securityFlags.length !== 1 ? 's' : ''}</strong> across selected configs. Review them below.
                  </p>

                  {/* Danger flags */}
                  {dangerFlags.length > 0 && (
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <ShieldAlert className="w-4 h-4" style={{ color: 'var(--status-danger-text)' }} />
                        <span className="text-xs font-semibold" style={{ color: 'var(--status-danger-text)' }}>
                          Danger ({dangerFlags.length})
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {dangerFlags.map((flag, idx) => (
                          <div
                            key={`d-${idx}`}
                            className="p-3 rounded-lg border"
                            style={{ borderColor: 'var(--status-danger)', backgroundColor: 'var(--status-danger-light)' }}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium" style={{ color: 'var(--status-danger-text)' }}>{flag.groupName}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--badge-red-bg)', color: 'var(--badge-red-text)' }}>{flag.groupType}</span>
                            </div>
                            <p className="text-xs mt-1" style={{ color: 'var(--status-danger-text)' }}>{flag.reason}</p>
                            <code className="text-[10px] mt-0.5 block" style={{ color: 'var(--status-danger)' }}>{flag.matchedPattern}</code>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Warning flags */}
                  {warningFlags.length > 0 && (
                    <div className="mb-4">
                      <div className="flex items-center gap-2 mb-2">
                        <AlertTriangle className="w-4 h-4" style={{ color: 'var(--status-warning-text)' }} />
                        <span className="text-xs font-semibold" style={{ color: 'var(--status-warning-text)' }}>
                          Warnings ({warningFlags.length})
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {warningFlags.map((flag, idx) => (
                          <div
                            key={`w-${idx}`}
                            className="p-3 rounded-lg border"
                            style={{ borderColor: 'var(--status-warning)', backgroundColor: 'var(--status-warning-light)' }}
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-medium" style={{ color: 'var(--status-warning-text)' }}>{flag.groupName}</span>
                              <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: 'var(--badge-amber-bg)', color: 'var(--badge-amber-text)' }}>{flag.groupType}</span>
                            </div>
                            <p className="text-xs mt-1" style={{ color: 'var(--status-warning-text)' }}>{flag.reason}</p>
                            <code className="text-[10px] mt-0.5 block" style={{ color: 'var(--status-warning)' }}>{flag.matchedPattern}</code>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Acknowledgment checkbox */}
                  <label className="flex items-start gap-2 cursor-pointer mt-4 p-3 rounded-lg border" style={{ borderColor: 'var(--border-subtle)' }}>
                    <input
                      type="checkbox"
                      checked={securityAcknowledged}
                      onChange={(e) => setSecurityAcknowledged(e.target.checked)}
                      className="mt-0.5 w-4 h-4 rounded border-[var(--border-default)] text-[var(--interactive-primary)]"
                    />
                    <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                      I have reviewed these security flags and accept the risks
                    </span>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* Step 4: Final Confirmation */}
          {step === 'confirm' && (
            <div>
              <p className="text-sm mb-4" style={{ color: 'var(--text-secondary)' }}>
                Review the summary below and confirm.
              </p>

              {/* Policy name input */}
              <div className="mb-4">
                <label className="block text-sm font-medium mb-1" style={{ color: 'var(--text-primary)' }}>
                  Policy Name
                </label>
                <input
                  type="text"
                  value={policyName}
                  onChange={e => setPolicyName(e.target.value)}
                  placeholder="e.g. Engineering Standards Q1 2026"
                  className="w-full px-3 py-2 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--interactive-secondary)]"
                  style={{
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-subtle)',
                  }}
                  maxLength={100}
                  autoFocus
                />
                <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  This name identifies the approved config for your organization.
                </p>
              </div>

              <div className="rounded-lg border p-4 space-y-3" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-tertiary)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-muted)]">Configs to publish</span>
                  <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{selectedGroups.length}</span>
                </div>
                {hasConflicts && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-[var(--text-muted)]">Conflicts resolved</span>
                    <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{conflictGroups.length}</span>
                  </div>
                )}
                <div className="flex items-center justify-between">
                  <span className="text-xs text-[var(--text-muted)]">Security flags</span>
                  <span
                    className="text-sm font-semibold"
                    style={{ color: securityFlags.length > 0 ? 'var(--status-warning-text)' : 'var(--status-success-text)' }}
                  >
                    {securityFlags.length > 0 ? `${securityFlags.length} acknowledged` : 'None'}
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 p-4 border-t flex-shrink-0" style={{ borderColor: 'var(--border-subtle)' }}>
          <button
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 text-sm rounded-lg transition-colors"
            style={{
              color: 'var(--text-secondary)',
              backgroundColor: 'var(--bg-tertiary)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            Cancel
          </button>

          <div className="flex items-center gap-2">
            {/* Back button (not on first step) */}
            {stepIndex > 0 && (
              <button
                onClick={() => setStep(steps[stepIndex - 1])}
                disabled={submitting}
                className="px-4 py-2 text-sm rounded-lg transition-colors"
                style={{
                  color: 'var(--text-secondary)',
                  backgroundColor: 'var(--bg-tertiary)',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                Back
              </button>
            )}

            {step !== 'confirm' ? (
              <button
                onClick={handleNext}
                disabled={
                  submitting ||
                  contentLoading ||
                  (step === 'conflicts' && !allConflictsResolved) ||
                  (step === 'security' && securityFlags.length > 0 && !securityAcknowledged)
                }
                className="px-4 py-2 text-sm rounded-lg transition-colors flex items-center gap-2 bg-[var(--interactive-secondary)] text-[var(--text-on-accent)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {contentLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Loading...
                  </>
                ) : (
                  <>
                    Next: {stepLabels[steps[stepIndex + 1]]}
                    <ChevronRight className="w-4 h-4" />
                  </>
                )}
              </button>
            ) : (
              /* Final step: publish directly from Discovery */
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="px-4 py-2 text-sm rounded-lg transition-colors flex items-center gap-2 bg-[var(--interactive-secondary)] text-[var(--text-on-accent)] hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <ArrowRight className="w-4 h-4" />}
                {submitting ? 'Publishing...' : 'Publish to Org Policy'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
