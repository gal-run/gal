'use client'

import { Search, RefreshCw, Github, Loader2, FileCode } from 'lucide-react'
import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { api, type Organization, type AgentPlatform, type GitHubInstallationStatus, type DiscoveredConfigGroup } from '@/lib/api'
import { getUserFriendlyError } from '@/lib/errors'
import { ConfigBrowser } from '@/components/config-browser'
import { BulkApproveDialog } from '@/components/discovery/BulkApproveDialog'
import { type StageSelection } from '@/lib/approvalHandoff'
import { getDiscoveryGroupKey, groupSelectionsByPlatform, normalizeDiscoveredConfigType, type ApprovedConfigsByPlatform, type PublishedPolicyItem } from '@/lib/discoveryPolicy'
import { createEmptyDiscoveryConfigTypeStats, summarizeDiscoveryConfigTypeStats, type DiscoveryConfigTypeStats } from '@/lib/discoveryConfigStats'
import { DISCOVERY_TYPE_GUIDES } from '@/lib/discoveryTypeGuidance'
import {
  formatDiscoverySelectedItemParam,
  formatDiscoveryTypeParam,
  parseDiscoveryTypeParam,
  resolveDiscoverySelectedConfigKey,
  retainDiscoverySelectedConfigKey,
} from '@/lib/discoveryUrlState'
import { useBulkSelection } from '@/hooks/useBulkSelection'
import { useUserContext } from '@/hooks/useUserContext'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { isDemoMode } from '@/lib/demo-guard'
import { DEMO_ORGANIZATION, DEMO_GITHUB_STATUS, DEMO_PLATFORM_STATS, DEMO_DISCOVERED_CONFIG_GROUPS, DEMO_APPROVED_CONFIG_RESPONSE } from '@/lib/demo-data'

interface ScanProgress {
  status: 'idle' | 'scanning' | 'complete' | 'error'
  totalRepos: number
  scannedRepos: number
  percentage: number
  currentRepo: string
  elapsedSeconds: number
}

const EMPTY_FETCHED_CONTENT = new Map<string, string>()
const DISCOVERY_BOOTSTRAP_TIMEOUT_MS = 20_000

/**
 * Infer the agent platform from config type or file path.
 * Supports Claude, Cursor, Copilot, Gemini, Codex, Windsurf, Antigravity, Amp.
 */
function inferPlatformFromConfig(type: string, path?: string): AgentPlatform {
  if (path) {
    if (path.includes('.cursor/') || path === '.cursorrules') return 'cursor'
    if (path.includes('.vscode/')) return 'copilot'
    if (path.includes('.github/copilot-instructions') || path.includes('.github/instructions/') || path.includes('.github/agents/') || path.includes('.github/skills/')) return 'copilot'
    if (path.includes('.gemini/') || path === 'GEMINI.md') return 'gemini'
    if (path.includes('.codex/')) return 'codex'
    if (path.includes('.windsurf/') || path === '.windsurfrules') return 'windsurf'
    if (path.includes('.antigravity/')) return 'antigravity'
    if (path.includes('.amp/') || path === 'AGENT.md') return 'amp'
    if (path.includes('.claude/') || path === 'CLAUDE.md' || path === '.mcp.json') return 'claude'
    if (path === 'AGENTS.md') return 'copilot'
  }
  if (type === 'cursorRules') return 'cursor'
  if (type === 'command' || type === 'hook' || type === 'subagent' || type === 'instructions') {
    return 'claude'
  }
  if (type === 'mcp') {
    if (path?.includes('.cursor/')) return 'cursor'
    if (path?.includes('.vscode/')) return 'copilot'
    if (path?.includes('.gemini/')) return 'gemini'
    if (path?.includes('.codex/')) return 'codex'
    if (path === '.mcp.json') return 'claude'
    return 'claude'
  }
  if (type === 'settings' || type === 'rule' || type === 'skill' || type === 'policy' || type === 'workflow' || type === 'prompt' || type === 'agent') {
    if (path?.includes('.cursor/')) return 'cursor'
    if (path?.includes('.github/')) return 'copilot'
    if (path?.includes('.gemini/')) return 'gemini'
    if (path?.includes('.codex/')) return 'codex'
    if (path?.includes('.windsurf/')) return 'windsurf'
    if (path?.includes('.antigravity/')) return 'antigravity'
    if (path?.includes('.amp/')) return 'amp'
    return 'claude'
  }
  return 'claude'
}

function Discovery() {
  const pathname = usePathname()
  const router = useRouter()
  const searchParams = useSearchParams()
  const { context } = useUserContext()
  const selectedWorkspace = useSelectedWorkspace()
  const configBrowserRef = useRef<HTMLDivElement>(null)
  const [allOrganizations, setAllOrganizations] = useState<Organization[]>([])

  const organizations = allOrganizations

  const orgName = selectedWorkspace || null
  const orgCapabilities = useMemo(() => {
    if (!orgName || !context) return null
    return context.orgs.find(o => o.name === orgName)?.capabilities
  }, [orgName, context])
  const canRunDiscovery = orgCapabilities?.canRunDiscovery ?? false
  const canManageApprovedConfig = orgCapabilities?.canManageApprovedConfig ?? false
  const [githubStatus, setGithubStatus] = useState<GitHubInstallationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [bootstrapError, setBootstrapError] = useState<string | null>(null)
  const [loadingTimedOut, setLoadingTimedOut] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanProgress, setScanProgress] = useState<ScanProgress>({
    status: 'idle',
    totalRepos: 0,
    scannedRepos: 0,
    percentage: 0,
    currentRepo: '',
    elapsedSeconds: 0,
  })
  const [_platformStats, setPlatformStats] = useState<Partial<Record<AgentPlatform, number>>>({
    claude: 0,
    cursor: 0,
    copilot: 0,
    windsurf: 0,
    gemini: 0,
    codex: 0,
    antigravity: 0,
    amp: 0,
  })

  const [configGroups, setConfigGroups] = useState<DiscoveredConfigGroup[]>([])
  const [configBrowserLoading, setConfigBrowserLoading] = useState(false)
  const [hasFetchedConfigGroups, setHasFetchedConfigGroups] = useState(false)
  const [scanError, setScanError] = useState<string | null>(null)
  /** Set when the GitHub App lacks Repository > Contents: Read permission. Issue #5675 */
  const [scanPermissionError, setScanPermissionError] = useState<string | null>(null)
  /** Set when a scan completes with 0 configs and no permission error. Issue #5675 */
  const [scanZeroConfigs, setScanZeroConfigs] = useState(false)
  const [approvedConfigs, setApprovedConfigs] = useState<ApprovedConfigsByPlatform>({})
  const [policyMutationKey, setPolicyMutationKey] = useState<string | null>(null)
  const [approvalToast, setApprovalToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  const [showBulkApproveDialog, setShowBulkApproveDialog] = useState(false)
  const [bulkApproveGroups, setBulkApproveGroups] = useState<DiscoveredConfigGroup[]>([])
  const bulkSelection = useBulkSelection()
  const { clearAll: clearBulkSelection } = bulkSelection

  const [configTypeStats, setConfigTypeStats] = useState<DiscoveryConfigTypeStats>(
    createEmptyDiscoveryConfigTypeStats,
  )

  const [isStale, setIsStale] = useState(false)
  const [cachedAt, setCachedAt] = useState<string | null>(null)
  const selectedItemParam = searchParams.get('item')
  const activeTypeFilter = useMemo(
    () => parseDiscoveryTypeParam(searchParams.get('type')),
    [searchParams],
  )
  const selectedConfigKeyFromUrl = useMemo(
    () => resolveDiscoverySelectedConfigKey(configGroups, selectedItemParam, activeTypeFilter),
    [activeTypeFilter, configGroups, selectedItemParam],
  )

  // Pick by AI state (#2837)
  const [pickByAiResults, setPickByAiResults] = useState<Array<{
    selectedRepo: string
    selectedPath: string
    selectedContent: string
    reasoning: string
    confidence: number
    configName: string
    configType: string
    modelInfo: { name: string; provider: string }
    source?: 'governance-model' | 'deterministic-fallback'
  }>>([])
  const [pickByAiLoading, setPickByAiLoading] = useState(false)
  const [pickByAiError, setPickByAiError] = useState<string | null>(null)
  const [pickByAiProgress, setPickByAiProgress] = useState<{ done: number; total: number } | null>(null)
  const [pickByAiPrompt, setPickByAiPrompt] = useState('Select configurations that prioritize security, consistency, and active maintenance.')

  // Reset org-scoped UI state AND data when switching workspaces
  useEffect(() => {
    clearBulkSelection()
    setConfigGroups([])
    setHasFetchedConfigGroups(false)
    setConfigTypeStats(createEmptyDiscoveryConfigTypeStats())
    setApprovedConfigs({})
    setIsStale(false)
    setCachedAt(null)
    setScanZeroConfigs(false)
  }, [orgName, clearBulkSelection])

  const updateDiscoveryUrlState = useCallback((nextTypeFilter: string | null, nextSelectedConfigKey: string | null) => {
    const nextParams = new URLSearchParams(searchParams.toString())
    const typeParam = formatDiscoveryTypeParam(nextTypeFilter)
    const itemParam = formatDiscoverySelectedItemParam(configGroups, nextSelectedConfigKey, nextTypeFilter)

    if (typeParam) {
      nextParams.set('type', typeParam)
    } else {
      nextParams.delete('type')
    }

    if (itemParam) {
      nextParams.set('item', itemParam)
    } else {
      nextParams.delete('item')
    }

    const currentQuery = searchParams.toString()
    const nextQuery = nextParams.toString()
    if (currentQuery === nextQuery) return

    const hash = typeof window === 'undefined' ? '' : window.location.hash
    router.replace(`${pathname}${nextQuery ? `?${nextQuery}` : ''}${hash}`, { scroll: false })
  }, [configGroups, pathname, router, searchParams])

  const handleTypeFilterChange = useCallback((nextTypeFilter: string | null) => {
    const retainedSelection = retainDiscoverySelectedConfigKey(
      configGroups,
      selectedConfigKeyFromUrl,
      nextTypeFilter,
    )
    updateDiscoveryUrlState(nextTypeFilter, retainedSelection)
  }, [configGroups, selectedConfigKeyFromUrl, updateDiscoveryUrlState])

  const handleSelectedConfigChange = useCallback((nextSelectedConfigKey: string | null) => {
    updateDiscoveryUrlState(activeTypeFilter, nextSelectedConfigKey)
  }, [activeTypeFilter, updateDiscoveryUrlState])

  useEffect(() => {
    if (!selectedItemParam || configBrowserLoading || selectedConfigKeyFromUrl || !hasFetchedConfigGroups) return
    updateDiscoveryUrlState(activeTypeFilter, null)
  }, [activeTypeFilter, configBrowserLoading, hasFetchedConfigGroups, selectedConfigKeyFromUrl, selectedItemParam, updateDiscoveryUrlState])

  const isGitHubConnected = githubStatus?.hasInstallations || organizations.length > 0

  const fetchConfigGroups = useCallback(async (org: string): Promise<number> => {
    setConfigBrowserLoading(true)
    try {
      if (isDemoMode()) {
        setConfigGroups(DEMO_DISCOVERED_CONFIG_GROUPS)
        setIsStale(false)
        setCachedAt(new Date().toISOString())
        setConfigTypeStats(summarizeDiscoveryConfigTypeStats(DEMO_DISCOVERED_CONFIG_GROUPS))
        return DEMO_DISCOVERED_CONFIG_GROUPS.length
      }
      const response = await api.getDiscoveredConfigs(org, { groupBy: 'name' })
      if ('groups' in response) {
        setConfigGroups(response.groups)

        setIsStale(response.isStale ?? false)
        setCachedAt(response.cachedAt ?? null)
        setConfigTypeStats(summarizeDiscoveryConfigTypeStats(response.groups))
        return response.groups.length
      }
      return 0
    } catch (error) {
      console.error('Failed to fetch config groups:', error)
      return 0
    } finally {
      setHasFetchedConfigGroups(true)
      setConfigBrowserLoading(false)
    }
  }, [])

  const fetchData = useCallback(async (_forceLoad = false) => {
    setLoading(true)
    setBootstrapError(null)
    setLoadingTimedOut(false)
    try {
      if (isDemoMode()) {
        setAllOrganizations([DEMO_ORGANIZATION as unknown as Organization])
        setPlatformStats(DEMO_PLATFORM_STATS)
        setGithubStatus(DEMO_GITHUB_STATUS)
        setLoading(false)
        return
      }
      const [orgs, stats, status] = await Promise.all([
        api.getOrganizations({ throwOnError: true }),
        api.getPlatformStats({ throwOnError: true }),
        api.getGitHubAppStatus({ throwOnError: true }),
      ])
      setAllOrganizations(orgs)
      setPlatformStats(stats)
      setGithubStatus(status)
    } catch (error) {
      console.error('Failed to fetch discovery data:', error)
      setBootstrapError(getUserFriendlyError(error, 'Failed to load discovery data.'))
    } finally {
      setLoading(false)
    }
  }, [])

  const refreshApprovedConfigs = useCallback(async (org: string) => {
    if (isDemoMode()) {
      setApprovedConfigs({ claude: DEMO_APPROVED_CONFIG_RESPONSE })
      return
    }

    try {
      const response = await api.getApprovedConfigsByPlatform(org)
      setApprovedConfigs(response.configs)
    } catch (error) {
      console.error('Failed to fetch approved configs:', error)
      setApprovedConfigs({})
    }
  }, [])

  const publishSelections = useCallback(async (selections: StageSelection[], mutationKey: string, policyName?: string) => {
    if (!orgName || selections.length === 0) return false

    setPolicyMutationKey(mutationKey)
    setApprovalToast(null)

    try {
      const grouped = groupSelectionsByPlatform(selections)
      let totalPublished = 0

      for (const [platform, platformSelections] of grouped) {
        const result = await api.bulkApproveConfigs(orgName, platform, {
          configSelections: platformSelections.map((selection) => ({
            type: selection.type,
            name: selection.name,
            platform: selection.platform,
            preferredInstance: { repo: selection.repo, path: selection.path },
          })),
          policyName,
        })

        if (!result.success) {
          throw new Error(result.error || `Failed to publish ${platform} policy changes`)
        }

        totalPublished += result.summary?.total || platformSelections.length
      }

      await refreshApprovedConfigs(orgName)
      setApprovalToast({
        message: `Published ${totalPublished} config${totalPublished === 1 ? '' : 's'} to the org policy.`,
        type: 'success',
      })
      return true
    } catch (error) {
      setApprovalToast({
        message: getUserFriendlyError(error, 'Failed to publish org policy changes.'),
        type: 'error',
      })
      return false
    } finally {
      setPolicyMutationKey(null)
    }
  }, [orgName, refreshApprovedConfigs])

  const handleApprove = useCallback(async (group: DiscoveredConfigGroup, instance: DiscoveredConfigGroup['instances'][number]) => {
    if (!orgName) return

    await publishSelections(
      [{
        platform: group.platform ?? inferPlatformFromConfig(group.type, instance.path),
        type: normalizeDiscoveredConfigType(group.type),
        name: group.name,
        repo: instance.repo,
        path: instance.path,
      }],
      `approve:${getDiscoveryGroupKey(group)}`,
    )
  }, [orgName, publishSelections])

  const handleRemove = useCallback(async (group: DiscoveredConfigGroup, publishedItem: PublishedPolicyItem | null) => {
    if (!orgName || !publishedItem) return
    const normalizedType = normalizeDiscoveredConfigType(group.type)

    setPolicyMutationKey(`remove:${getDiscoveryGroupKey(group)}`)
    setApprovalToast(null)

    try {
      const sourceRef = publishedItem.sourcePath
        ? [{ name: publishedItem.name, sourceRepo: publishedItem.sourceRepo, sourcePath: publishedItem.sourcePath }]
        : undefined

      const result = await api.removeFromApprovedConfig(orgName, publishedItem.platform, {
        commandRefs:
          normalizedType === 'command' || group.type === 'workflow' || group.type === 'prompt'
            ? sourceRef
            : undefined,
        subagentRefs: normalizedType === 'subagent' ? sourceRef : undefined,
        hookRefs: normalizedType === 'hook' ? sourceRef : undefined,
        ruleRefs: normalizedType === 'rule' || group.type === 'policy' ? sourceRef : undefined,
        skills: group.type === 'skill' ? [publishedItem.name || group.name] : undefined,
        clearInstructions: normalizedType === 'instructions' ? true : undefined,
        clearSettings: normalizedType === 'settings' ? true : undefined,
        clearMcp: normalizedType === 'mcp' ? true : undefined,
      })

      if (!result.success) {
        throw new Error(result.error || 'Failed to remove published policy item')
      }

      await refreshApprovedConfigs(orgName)
      setApprovalToast({
        message: `Removed ${group.name} from the org policy.`,
        type: 'success',
      })
    } catch (error) {
      setApprovalToast({
        message: getUserFriendlyError(error, 'Failed to remove the published policy item.'),
        type: 'error',
      })
    } finally {
      setPolicyMutationKey(null)
    }
  }, [orgName, refreshApprovedConfigs])

  const handleBulkApprove = useCallback((selectedGroups: DiscoveredConfigGroup[]) => {
    if (selectedGroups.length === 0 || !orgName) return
    setBulkApproveGroups(selectedGroups)
    setShowBulkApproveDialog(true)
  }, [orgName])

  const handleBulkApproveConfirm = useCallback(async (selections: StageSelection[], policyName?: string) => {
    const success = await publishSelections(selections, 'bulk-approve', policyName)
    if (!success) return

    bulkSelection.clearAll()
    setShowBulkApproveDialog(false)
  }, [bulkSelection, publishSelections])

  // Pick by AI handler (#2837, optimised in #4032 — agents.md reference/batch approach)
  // Sends ONE compact manifest to Vertex AI instead of ~895 individual calls.
  const handlePickByAi = async () => {
    if (!orgName) return
    setPickByAiError(null)
    setPickByAiResults([])

    // Process ALL config groups that have at least one instance
    const groupsToProcess = configGroups.filter((g: DiscoveredConfigGroup) => (g.instances?.length ?? 0) >= 1)
    if (groupsToProcess.length === 0) {
      setPickByAiError('No config groups found. Run a scan first.')
      return
    }

    setPickByAiLoading(true)
    setPickByAiProgress({ done: 0, total: groupsToProcess.length })

    // Build compact manifest entries — each group gets a stable ID = "type:name"
    const manifestGroups = groupsToProcess.map((group: DiscoveredConfigGroup) => {
      // Pick the best instance for metadata by preferring highest commitCount30d
      const instances = group.instances ?? []
      const best = [...instances].sort((a, b) =>
        ((b.commitCount30d ?? 0) - (a.commitCount30d ?? 0)) ||
        ((b.commitDate ?? '') > (a.commitDate ?? '') ? 1 : -1)
      )[0] ?? instances[0]
      return {
        id: `${group.type}:${group.name}`,
        configName: group.name,
        configType: group.type,
        repo: best?.repo ?? '',
        description: best?.content ? best.content.slice(0, 120).replace(/\n/g, ' ') : '',
        commitDate: best?.commitDate,
        commitCount30d: best?.commitCount30d,
      }
    })

    try {
      const batchResult = await api.pickConfigsByAiManifest(orgName, {
        groups: manifestGroups,
        intention: pickByAiPrompt,
      })

      // Map approved IDs back to full results using existing group data
      const approvedIdSet = new Set(batchResult.approvedIds)
      const results: typeof pickByAiResults = []

      for (const group of groupsToProcess) {
        const id = `${group.type}:${group.name}`
        if (!approvedIdSet.has(id)) continue

        // Pick the best instance deterministically for the result
        const instances = group.instances ?? []
        const best = [...instances].sort((a, b) =>
          ((b.commitCount30d ?? 0) - (a.commitCount30d ?? 0)) ||
          ((b.commitDate ?? '') > (a.commitDate ?? '') ? 1 : -1)
        )[0] ?? instances[0]

        if (!best) continue
        results.push({
          selectedRepo: best.repo,
          selectedPath: best.path,
          selectedContent: best.content || '',
          reasoning: batchResult.reasoning,
          confidence: batchResult.confidence,
          configName: group.name,
          configType: group.type,
          modelInfo: batchResult.modelInfo,
          source: batchResult.source,
        })
      }

      setPickByAiProgress({ done: groupsToProcess.length, total: groupsToProcess.length })
      setPickByAiResults(results)
    } catch (err) {
      setPickByAiError(err instanceof Error ? err.message : 'AI selection failed')
    } finally {
      setPickByAiLoading(false)
      setPickByAiProgress(null)
    }
  }

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (!loading) {
      setLoadingTimedOut(false)
      return
    }

    const timeout = setTimeout(() => {
      setLoadingTimedOut(true)
    }, DISCOVERY_BOOTSTRAP_TIMEOUT_MS)

    return () => clearTimeout(timeout)
  }, [loading])

  useEffect(() => {
    if (!orgName) return
    fetchConfigGroups(orgName)
  }, [orgName, fetchConfigGroups])

  useEffect(() => {
    if (!orgName) return
    refreshApprovedConfigs(orgName)
  }, [orgName, refreshApprovedConfigs])

  // Auto-scroll to config browser when navigating with #configs hash
  useEffect(() => {
    if ((typeof window !== 'undefined' ? window.location.hash : '') === '#configs' && !loading && configBrowserRef.current) {
      setTimeout(() => {
        configBrowserRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }, 100)
    }
  }, [typeof window !== 'undefined' ? window.location.hash : '', loading])

  const handleScan = async () => {
    const orgNameToScan = orgName || githubStatus?.installations?.[0]?.organization

    if (!orgNameToScan) {
      router.push('/settings?tab=github')
      return
    }

    setScanError(null)
    setScanPermissionError(null)
    setScanZeroConfigs(false)
    setScanning(true)
    const startTime = Date.now()
    setScanProgress({
      status: 'scanning',
      totalRepos: 0,
      scannedRepos: 0,
      percentage: 0,
      currentRepo: '',
      elapsedSeconds: 0,
    })

    let pollInterval: ReturnType<typeof setInterval> | null = null
    let safetyTimeout: ReturnType<typeof setTimeout> | null = null

    try {
      // Trigger the scan FIRST so the server resets progress to "scanning"
      // before we start polling. This prevents the poller from seeing stale
      // "complete" status from a previous scan and stopping immediately.
      if (organizations.length === 0) {
        const result = await api.syncGitHubInstallation(orgNameToScan)
        if (result && !result.success) {
          throw new Error(result.error || 'Failed to sync GitHub installation')
        }
      } else {
        await api.triggerScan(orgNameToScan)
      }

      // Now poll for progress — the server has already set status to "scanning"
      let seenScanning = false
      const scanCompletePromise = new Promise<void>((resolve, reject) => {
        pollInterval = setInterval(async () => {
          try {
            const progress = await api.getScanProgress(orgNameToScan)
            const elapsedSeconds = Math.floor((Date.now() - startTime) / 1000)
            setScanProgress({ ...progress, elapsedSeconds })

            if (progress.status === 'scanning') {
              seenScanning = true
            }

            // Only treat "complete"/"error" as terminal if we've seen "scanning" first,
            // to avoid stopping on stale status from a previous scan.
            if (seenScanning || progress.status === 'scanning') {
              if (progress.status === 'complete') {
                if (pollInterval) clearInterval(pollInterval)
                if (safetyTimeout) clearTimeout(safetyTimeout)
                // Surface permission error if the GitHub App lacks contents permission (#5675)
                if (progress.permissionError) {
                  setScanPermissionError(progress.permissionError)
                }
                resolve()
              } else if (progress.status === 'error') {
                if (pollInterval) clearInterval(pollInterval)
                if (safetyTimeout) clearTimeout(safetyTimeout)
                reject(new Error('Scan failed during processing'))
              }
            }
          } catch {
            // Ignore transient polling errors, keep trying
          }
        }, 2000)

        safetyTimeout = setTimeout(() => {
          if (pollInterval) clearInterval(pollInterval)
          resolve()
        }, 120_000)
      })

      await scanCompletePromise

      await fetchData(true)
      if (orgNameToScan) {
        const discoveredCount = await fetchConfigGroups(orgNameToScan)
        // Surface "0 configs found" feedback when scan completes without a permission error (#5675)
        if (discoveredCount === 0 && !scanPermissionError) {
          setScanZeroConfigs(true)
        }
      }
    } catch (error) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Scan failed:', error)
      }
      const message = getUserFriendlyError(error, 'Failed to scan repositories. Please try again.')
      setScanError(message)
    } finally {
      if (pollInterval) clearInterval(pollInterval)
      if (safetyTimeout) clearTimeout(safetyTimeout)
      setScanning(false)
      setScanProgress({
        status: 'idle',
        totalRepos: 0,
        scannedRepos: 0,
        percentage: 0,
        currentRepo: '',
        elapsedSeconds: 0,
      })
    }
  }

  const totalConfigs = Object.values(configTypeStats).reduce((a, b) => a + b, 0)
  const activeConfigTypes = Object.values(configTypeStats).filter(c => c > 0).length

  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto relative">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Auto-Discovery
          </h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
            Find configurations across your repositories and publish the org policy from this surface
          </p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <div className="flex items-center gap-2">
            <button
              onClick={handleScan}
              disabled={scanning || !isGitHubConnected}
              className="bg-[var(--interactive-secondary)] text-[var(--text-on-accent)] rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 ${scanning ? 'animate-spin' : ''}`} />
              {scanning ? (
                scanProgress.totalRepos > 0
                  ? `Scanning... ${scanProgress.percentage}%`
                  : `Scanning... ${scanProgress.elapsedSeconds}s`
              ) : 'Scan Now'}
            </button>
            {canManageApprovedConfig && configGroups.length > 0 && (
              <button
                onClick={handlePickByAi}
                disabled={pickByAiLoading || !isGitHubConnected}
                className="bg-[var(--surface-raised)] border border-[var(--border-subtle)] text-[var(--text-primary)] rounded-lg px-4 py-2 text-sm font-medium hover:bg-[var(--bg-tertiary)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 whitespace-nowrap"
              >
                {pickByAiLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Search className="w-4 h-4" />
                )}
                {pickByAiLoading
                  ? pickByAiProgress
                    ? `Analyzing ${pickByAiProgress.done}/${pickByAiProgress.total}...`
                    : 'Analyzing...'
                  : 'Pick by AI'}
              </button>
            )}
          </div>
          {canManageApprovedConfig && configGroups.length > 0 && (
            <div className="flex items-center gap-2 w-full">
              <label className="text-xs text-[var(--text-muted)] whitespace-nowrap shrink-0">
                AI prompt:
              </label>
              <input
                type="text"
                value={pickByAiPrompt}
                onChange={(e) => setPickByAiPrompt(e.target.value)}
                placeholder="Select configurations that prioritize security, consistency, and active maintenance."
                className="text-xs px-3 py-1.5 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-secondary)] text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none focus:ring-1 focus:ring-[var(--accent-neon)] w-full min-w-0"
                disabled={pickByAiLoading}
              />
            </div>
          )}
          {pickByAiError && (
            <span className="text-xs text-[var(--status-danger)]">
              {pickByAiError}
            </span>
          )}
          {scanning && scanProgress.currentRepo && (
            <span className="text-xs truncate max-w-48 text-[var(--text-muted)]">
              {scanProgress.currentRepo}
            </span>
          )}
          {scanError && (
            <span className="text-xs text-[var(--status-danger)]">
              {scanError}
            </span>
          )}
          {!scanning && (() => {
            const org = organizations.find(o => o.name === orgName)
            if (!org?.lastScanAt) return null
            const scanDate = new Date(org.lastScanAt._seconds * 1000)
            return (
              <span className="text-xs text-[var(--text-muted)]">
                Last scanned: {scanDate.toLocaleDateString()} {scanDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
              </span>
            )
          })()}
        </div>
      </div>

      {/* Permission error banner — shown when GitHub App lacks Repository > Contents: Read (#5675) */}
      {scanPermissionError && (
        <div className="mb-6 rounded-lg border border-[var(--status-warning)] bg-[var(--status-warning-bg,_oklch(0.98_0.02_80))] p-4 flex items-start gap-3">
          <span className="mt-0.5 shrink-0 text-[var(--status-warning)]">⚠</span>
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">
              GitHub App missing &apos;contents&apos; permission — 0 configs discovered
            </p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              Go to your GitHub App settings and add <strong>Repository &gt; Contents: Read</strong> permission, then re-scan.
            </p>
          </div>
          <button
            onClick={() => setScanPermissionError(null)}
            className="ml-auto shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Zero-configs banner — shown after a scan that found no configs without a permission error (#5675) */}
      {scanZeroConfigs && !scanPermissionError && (
        <div className="mb-6 rounded-lg border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-4 flex items-start gap-3">
          <span className="mt-0.5 shrink-0 text-[var(--text-muted)]">ℹ</span>
          <div>
            <p className="text-sm font-medium text-[var(--text-primary)]">
              Scan completed — no Claude Code config files found
            </p>
            <p className="mt-1 text-xs text-[var(--text-secondary)]">
              No CLAUDE.md, .claude/, or other supported config files were detected in your repositories.
            </p>
          </div>
          <button
            onClick={() => setScanZeroConfigs(false)}
            className="ml-auto shrink-0 text-[var(--text-muted)] hover:text-[var(--text-primary)] text-sm"
            aria-label="Dismiss"
          >
            ✕
          </button>
        </div>
      )}

      {/* Pick by AI full policy bundle panel (#2837) */}
      {pickByAiResults.length > 0 && (() => {
        const isAiFallback = pickByAiResults.length > 0 && pickByAiResults.every(r => r.source === 'deterministic-fallback')
        return (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] overflow-hidden mb-6">
          {isAiFallback && (
            <div className="px-5 py-2.5 bg-[var(--bg-tertiary)] border-b border-[var(--border-subtle)] flex items-center gap-2">
              <span className="text-xs text-[var(--text-muted)]">⚠ AI ranking is temporarily unavailable. Showing approved configs sorted by recent commit activity.</span>
            </div>
          )}
          <div className="p-5 border-b border-[var(--border-subtle)] flex items-center justify-between gap-4">
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                {isAiFallback ? 'Config Suggestions' : 'AI Policy Recommendation'}
              </h3>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                {pickByAiResults.length} config{pickByAiResults.length !== 1 ? 's' : ''} selected
                {!isAiFallback && ' · Powered by GAL Model'}
              </p>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => setPickByAiResults([])}
                className="text-xs px-3 py-1.5 rounded-md border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:bg-[var(--bg-tertiary)] transition-colors"
              >
                Dismiss
              </button>
              {canManageApprovedConfig && (
                <button
                  disabled={!!policyMutationKey}
                  onClick={async () => {
                    if (!orgName) return
                    try {
                      // Build selections from AI pick results using the same
                      // pattern as handleApprove / publishSelections
                      const selections: StageSelection[] = pickByAiResults.map((r) => ({
                        platform: inferPlatformFromConfig(r.configType, r.selectedPath),
                        type: normalizeDiscoveredConfigType(r.configType),
                        name: r.configName,
                        repo: r.selectedRepo,
                        path: r.selectedPath,
                      }))
                      const success = await publishSelections(
                        selections,
                        'ai-publish-policy',
                        `AI Policy Bundle ${new Date().toLocaleDateString()}`,
                      )
                      if (success) {
                        setPickByAiResults([])
                        router.push('/approved-config')
                      }
                    } catch (error) {
                      setPickByAiError(error instanceof Error ? error.message : 'Failed to publish policy')
                    }
                  }}
                  className="text-xs px-3 py-1.5 rounded-md bg-[var(--interactive-secondary)] text-[var(--text-on-accent)] hover:opacity-90 transition-colors disabled:opacity-50"
                >
                  {policyMutationKey === 'ai-publish-policy' ? 'Publishing Policy...' : 'Publish Policy'}
                </button>
              )}
            </div>
          </div>
          <div className="divide-y divide-[var(--border-subtle)]">
            {pickByAiResults.map((result, idx) => (
              <div key={`${result.configType}-${result.configName}-${idx}`} className="px-5 py-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium text-[var(--text-primary)]">{result.configName}</span>
                    <span className="text-xs text-[var(--text-muted)]">({result.configType})</span>
                    {!isAiFallback && (
                      <span
                        className="text-xs px-1.5 py-0.5 rounded-full font-medium ml-auto"
                        style={{
                          backgroundColor: result.confidence >= 0.8
                            ? 'rgba(34,197,94,0.15)'
                            : result.confidence >= 0.5
                              ? 'rgba(234,179,8,0.15)'
                              : 'rgba(239,68,68,0.15)',
                          color: result.confidence >= 0.8
                            ? 'var(--status-success, #22c55e)'
                            : result.confidence >= 0.5
                              ? 'var(--status-warning, #eab308)'
                              : 'var(--status-danger, #ef4444)',
                        }}
                      >
                        {Math.round(result.confidence * 100)}%
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono text-[var(--text-secondary)] truncate">{result.selectedRepo}/{result.selectedPath}</p>
                  {!isAiFallback && result.reasoning && (
                    <p className="text-xs text-[var(--text-muted)] mt-1 leading-relaxed">{result.reasoning}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
        )
      })()}

      {loading && !loadingTimedOut ? (
        <div className="text-center py-16">
          <Loader2 className="w-8 h-8 animate-spin mx-auto mb-4 text-[var(--text-muted)]" />
          <p className="text-[var(--text-secondary)]">Loading discovery data...</p>
        </div>
      ) : bootstrapError || loadingTimedOut ? (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-10 text-center">
          <Github className="w-12 h-12 mx-auto mb-4 text-[var(--text-muted)]" />
          <h2 className="text-lg font-semibold mb-2 text-[var(--text-primary)]">
            Unable to load Discovery
          </h2>
          <p className="mb-6 max-w-md mx-auto text-[var(--text-secondary)]">
            {bootstrapError || 'Loading is taking longer than expected. Please try again.'}
          </p>
          {loadingTimedOut && !bootstrapError && (
            <p className="mb-6 text-xs text-[var(--text-muted)]">
              Loading is taking longer than expected.
            </p>
          )}
          <button
            onClick={() => {
              void fetchData(true)
            }}
            className="bg-[var(--interactive-secondary)] text-[var(--text-on-accent)] rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 transition-colors inline-flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Retry loading
          </button>
        </div>
      ) : !isGitHubConnected ? (
        <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-10 text-center">
          <Github className="w-12 h-12 mx-auto mb-4 text-[var(--text-muted)]" />
          <h2 className="text-lg font-semibold mb-2 text-[var(--text-primary)]">
            No GitHub Connection
          </h2>
          <p className="mb-6 max-w-md mx-auto text-[var(--text-secondary)]">
            Connect your GitHub organization to automatically discover AI agent configurations.
          </p>
          <button
            onClick={() => router.push('/settings?tab=github')}
            className="bg-[var(--interactive-secondary)] text-[var(--text-on-accent)] rounded-lg px-4 py-2 text-sm font-medium hover:opacity-90 transition-colors inline-flex items-center gap-2"
          >
            <Github className="w-4 h-4" />
            Connect GitHub
          </button>
        </div>
      ) : (
        <>
          {/* Stats Overview — scoped to selected workspace */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
            <StatCard icon={FileCode} value={totalConfigs} label="Configs Discovered" />
            <StatCard icon={Search} value={`${activeConfigTypes}/12`} label="Config Types Active" />
          </div>

          {/* Config Type Breakdown */}
          <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] overflow-hidden mb-6">
            <div className="p-5 pb-3 flex items-center justify-between">
              <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">Config Types</h2>
              {activeTypeFilter && (
                <button
                  onClick={() => handleTypeFilterChange(null)}
                  className="text-xs px-2 py-1 rounded-md transition-colors"
                  style={{ color: 'var(--text-muted)', backgroundColor: 'var(--bg-tertiary)' }}
                >
                  Clear filter
                </button>
              )}
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6">
              {(DISCOVERY_TYPE_GUIDES as Array<{
                key: keyof DiscoveryConfigTypeStats
                label: string
                filterType: string
                description: string
              }>).map(({ key, label, filterType, description }, idx, arr) => {
                const count = configTypeStats[key]
                const isActive = activeTypeFilter === filterType

                return (
                  <button
                    key={key}
                    onClick={() => {
                      handleTypeFilterChange(isActive ? null : filterType)
                    }}
                    className={`py-5 px-4 text-center transition-colors cursor-pointer ${idx < arr.length - 1 ? 'border-r border-[var(--border-subtle)]' : ''}`}
                    style={{
                      backgroundColor: isActive ? 'var(--accent-bg, rgba(99, 102, 241, 0.1))' : 'transparent',
                      outline: isActive ? '2px solid var(--accent-neon)' : 'none',
                      outlineOffset: '-2px',
                    }}
                    aria-pressed={isActive}
                    aria-label={`Filter by ${label}${isActive ? ' (active)' : ''}`}
                    title={description}
                  >
                    <p className="text-2xl font-bold tracking-tight" style={{ color: isActive ? 'var(--accent-neon)' : 'var(--accent-neon)' }}>
                      {count}
                    </p>
                    <p className="text-xs mt-1" style={{ color: isActive ? 'var(--accent-neon)' : 'var(--text-secondary)' }}>{label}</p>
                    <p className="mt-1 text-[10px] leading-snug" style={{ color: 'var(--text-tertiary)' }}>
                      {description}
                    </p>
                  </button>
                )
              })}
            </div>
          </div>

          {/* Three-panel Config Browser */}
          <div ref={configBrowserRef} id="configs" className="mb-6 scroll-mt-4">
            <ConfigBrowser
              groups={configGroups}
              loading={configBrowserLoading}
              approvedConfigs={approvedConfigs}
              isAdmin={canManageApprovedConfig}
              orgName={orgName ?? ''}
              isStale={isStale}
              cachedAt={cachedAt}
              onApprove={handleApprove}
              onRemove={handleRemove}
              onBulkApprove={handleBulkApprove}
              onRefreshScan={handleScan}
              bulkSelection={bulkSelection}
              policyMutationKey={policyMutationKey}
              externalTypeFilter={activeTypeFilter}
              onExternalTypeFilterChange={handleTypeFilterChange}
              externalSelectedConfigKey={selectedConfigKeyFromUrl}
              onSelectedConfigChange={handleSelectedConfigChange}
              hasExternalSelectedItemParam={Boolean(selectedItemParam)}
            />
          </div>
        </>
      )}

      {approvalToast && (
        <div
          className="fixed top-4 right-4 z-50 flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg max-w-md"
          style={{
            backgroundColor: approvalToast.type === 'success' ? 'var(--status-success-light)' : 'var(--status-danger-light)',
            border: `1px solid ${approvalToast.type === 'success' ? 'var(--status-success)' : 'var(--status-danger)'}`,
          }}
        >
          <span className={approvalToast.type === 'success' ? 'text-[var(--status-success-text)]' : 'text-[var(--status-danger-text)]'}>
            {approvalToast.message}
          </span>
          <button
            onClick={() => setApprovalToast(null)}
            className="text-[var(--text-muted)] hover:text-[var(--text-primary)]"
            aria-label="Dismiss notification"
          >
            ×
          </button>
        </div>
      )}

      {/* Bulk Approve Dialog */}
      <BulkApproveDialog
        isOpen={showBulkApproveDialog}
        onClose={() => setShowBulkApproveDialog(false)}
        onConfirm={handleBulkApproveConfirm}
        selectedGroups={bulkApproveGroups}
        orgName={orgName || ''}
        platform="all"
        fetchedContent={EMPTY_FETCHED_CONTENT}
      />
    </div>
  )
}

function StatCard({ icon: Icon, value, label }: { icon: typeof Search; value: string | number; label: string }) {
  return (
    <div className="rounded-xl border border-[var(--border-subtle)] bg-[var(--surface-raised)] p-5 relative overflow-hidden shadow-sm hover:shadow-md transition-all duration-200">
      <Icon className="w-10 h-10 text-[var(--accent-neon)]/10 absolute top-4 right-4" />
      <div>
        <p className="text-3xl font-bold tracking-tight text-[var(--accent-neon)]">{value}</p>
        <p className="text-sm text-[var(--text-secondary)] mt-1">{label}</p>
      </div>
    </div>
  )
}

export default Discovery
