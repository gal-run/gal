'use client'

import { Shield, Check, Loader2, ChevronRight, AlertCircle, Plus, FileText, FolderOpen, Eye, X } from 'lucide-react'
import { ApprovedConfigSkeleton } from './ApprovedConfigSkeleton'
import { useState, useEffect, useMemo } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { api, type Organization, type GitHubInstallationStatus, type DiscoveredConfigItem, type AgentPlatform } from '@/lib/api'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { FlagBadge } from '@/components/FlagBadge'
// DeveloperSyncStatusPanel removed — sync detail now lives on Team page (#2943)
import { WorkspacePolicyBundlesPanel } from '@/components/approved-config/WorkspacePolicyBundlesPanel'
import { PolicySelector } from '@/components/approved-config/PolicySelector'
import type { ConfigPolicyItem } from '@/lib/api'
import { useUserContext } from '@/hooks/useUserContext'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { getUserFriendlyError } from '@/lib/errors'
import { loadApprovalHandoff, clearApprovalHandoff, isStageableSelection } from '@/lib/approvalHandoff'
import { isDemoMode } from '@/lib/demo-guard'
import { DEMO_ORGANIZATION, DEMO_GITHUB_STATUS, DEMO_APPROVED_CONFIG_RESPONSE, DEMO_CONFIG_POLICIES } from '@/lib/demo-data'
import { appendConfigToBundleTyped } from './approved-config-bundle'
import { OrphanBanner } from '@/components/approved-config/OrphanBanner'
// PlatformSelector removed - GAL uses unified configs (#1339)
// CopilotConfigEditor removed - GAL uses unified configs (#1339)

const APPROVED_CONFIG_PLATFORM: AgentPlatform = 'claude'
const APPROVED_CONFIG_SECTIONS = [
  { key: 'instructions', label: 'AGENTS.md' },
  { key: 'commands', label: 'Commands' },
  { key: 'hooks', label: 'Hooks' },
  { key: 'settings', label: 'Settings' },
  { key: 'subagents', label: 'Subagents' },
] as const

// CSS variable styles used throughout - these are design system tokens, not magic strings
const STYLES = {
  textPrimary: { color: 'var(--text-primary)' },
  textSecondary: { color: 'var(--text-secondary)' },
  textMuted: { color: 'var(--text-muted)' },
  accent: { color: 'var(--accent)' },
} as const

interface ConfigItem {
  name: string
  content: string
  sourceRepo?: string
  sourcePath?: string
  hash?: string
}

// GAL-395: Copilot-specific config item types
// Note: fileName/dirName are optional since API may not include them - derive from name if needed
interface CopilotPathInstructionItem {
  name: string
  fileName?: string  // Derived: `${name}.instructions.md`
  content: string
  applyTo: string
  excludeAgent?: string
  sourceRepo?: string
  sourcePath?: string
  hash?: string
}

interface CopilotAgentItem {
  name: string
  fileName?: string  // Derived: `${name}.agent.md`
  description: string
  content: string
  tools?: string[] | '*'
  target?: 'vscode' | 'github-copilot'
  infer?: boolean
  sourceRepo?: string
  sourcePath?: string
  hash?: string
}

interface CopilotSkillItem {
  name: string
  dirName?: string  // Derived: same as name
  description: string
  content: string
  sourceRepo?: string
  sourcePath?: string
  hash?: string
}

interface OrgConfigBundle {
  hash: string
  version: string
  updatedBy: string
  updatedAt: string
  policyName?: string
  // Claude-specific
  instructions?: {
    content: string
    sourceRepo?: string
    sourcePath?: string
    hash?: string
  } | null
  commands: ConfigItem[]
  hooks: ConfigItem[]
  settings?: {
    content: string
    sourceRepo?: string
    sourcePath?: string
    hash?: string
  } | null
  subagents: ConfigItem[]
  // GAL-395: Cursor-specific fields
  rules: ConfigItem[]  // .cursor/rules/*.mdc files
  cursorRules?: {  // Legacy .cursorrules file
    content: string
    sourceRepo?: string
    sourcePath?: string
    hash?: string
  } | null
  // GAL-395: Copilot-specific fields
  copilotInstructions?: {
    content: string
    sourceRepo?: string
    sourcePath?: string
    hash?: string
  } | null
  copilotPathInstructions: CopilotPathInstructionItem[]
  copilotAgents: CopilotAgentItem[]
  copilotSkills: CopilotSkillItem[]
}

interface DiscoveredConfig {
  repo: string
  path: string
  type: string
  content: string | null | undefined
  lastModified?: string
  platform?: AgentPlatform
}

// TODO: Refactor ApprovedConfig to reduce cognitive complexity (currently 62, max 25)
// Consider splitting into smaller components: ConfigEditor, ConfigPicker, ApprovalHandler
function ApprovedConfig() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const { user } = useAuth()
  const { context } = useUserContext()
  const selectedWorkspace = useSelectedWorkspace()
  const { isPageVisibleForUser } = useFeatureFlags()
  // Legacy feature flag id controls the workspace policy bundles guidance panel.
  const userOrgs = user?.organizations ?? []
  const showWorkspacePolicyBundlesPanel = isPageVisibleForUser('project-scope-configs', userOrgs)

  const [allOrganizations, setAllOrganizations] = useState<Organization[]>([])

  // Use all organizations directly — workspace switcher selects by name, no type filtering needed
  const organizations = allOrganizations
  const [githubStatus, setGithubStatus] = useState<GitHubInstallationStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [orgDataLoading, setOrgDataLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [generatingDraft, setGeneratingDraft] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const selectedPlatform: AgentPlatform = APPROVED_CONFIG_PLATFORM

  // Org config bundle state
  const [configBundle, setConfigBundle] = useState<OrgConfigBundle | null>(null)
  const [policyNameInput, setPolicyNameInput] = useState('')  // Separate state for policy name input
  // GAL-395: Extended tab types for Cursor support
  const [activeTab, setActiveTab] = useState<'instructions' | 'commands' | 'hooks' | 'settings' | 'subagents'>('instructions')
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set())
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set(['commands', 'hooks', 'settings', 'subagents'])) // Default: all collapsed except first
  const [showEditor, setShowEditor] = useState(false)
  const [editingContent, setEditingContent] = useState('')
  const [editingType, setEditingType] = useState<'instructions' | 'command' | 'hook' | 'settings' | 'subagent'>('instructions')
  const [editingPolicyName, setEditingPolicyName] = useState(false)

  // Discovered configs picker
  const [showPicker, setShowPicker] = useState(false)
  const [discoveredConfigs, setDiscoveredConfigs] = useState<DiscoveredConfig[]>([])
  const [loadingDiscovered, setLoadingDiscovered] = useState(false)
  const [selectedConfig, setSelectedConfig] = useState<DiscoveredConfig | null>(null)
  const [previewConfig, setPreviewConfig] = useState<DiscoveredConfig | null>(null)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [configTypeFilter, setConfigTypeFilter] = useState<'all' | 'instructions' | 'command' | 'hook' | 'mcp' | 'settings' | 'subagent' | 'skill' | 'policy' | 'workflow' | 'prompt' | 'agent'>('all')
  const [approvalToast, setApprovalToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)
  const [processingApproval, setProcessingApproval] = useState(false)
  const [failedStageApprovalToken, setFailedStageApprovalToken] = useState<string | null>(null)

  // Policy management state (#3029)
  const [policies, setPolicies] = useState<ConfigPolicyItem[]>([])
  const [policiesLoading, setPoliciesLoading] = useState(false)
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | undefined>()
  const [showPreviewModal, setShowPreviewModal] = useState(false)
  // Per-item file preview modal state (#3052)
  const [filePreviewItem, setFilePreviewItem] = useState<{
    name: string
    content: string | null
    sourceRepo?: string
    sourcePath?: string
  } | null>(null)
  // Developer sync status state removed — now on Team page (#2943)

  // Close file preview modal on Escape key (#3052)
  useEffect(() => {
    if (!filePreviewItem) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFilePreviewItem(null)
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [filePreviewItem])

  // Batch selection and clear all
  const [selectedItems, setSelectedItems] = useState<Set<string>>(new Set())
  const [showClearConfirm, setShowClearConfirm] = useState(false)
  const [isRemoving, setIsRemoving] = useState(false)

  const isGitHubConnected = githubStatus?.hasInstallations || organizations.length > 0
  // Selected workspace IS the org — no fallback, no wrong data
  const orgName = selectedWorkspace || null

  // Get capabilities from /user/context (API-detected, not self-declared)
  const orgCapabilities = useMemo(() => {
    if (!orgName || !context) return null
    return context.orgs.find(o => o.name === orgName)?.capabilities
  }, [orgName, context])
  const canManageApprovedConfig = orgCapabilities?.canManageApprovedConfig ?? false
  // Discovery is the only authoring surface for org policy changes.
  const canAuthorApprovedConfig = false

  // Fetch organization list and GitHub status (does NOT fetch config — that's driven by workspace selection)
  useEffect(() => {
    async function fetchOrgData() {
      if (isDemoMode()) {
        setAllOrganizations([DEMO_ORGANIZATION as unknown as Organization])
        setGithubStatus(DEMO_GITHUB_STATUS)
        setOrgDataLoading(false)
        return
      }
      try {
        const [orgs, status] = await Promise.all([
          api.getOrganizations(),
          api.getGitHubAppStatus()
        ])
        setAllOrganizations(orgs)
        setGithubStatus(status)
      } catch (err) {
        console.error('Failed to fetch:', err)
        setError('Failed to load configuration. Please try again.')
      } finally {
        setOrgDataLoading(false)
      }
    }
    fetchOrgData()
  }, [user?.login])

  // Fetch config whenever the selected workspace or platform changes (#2278)
  // This is the single source of truth for config fetching — no duplicate in initial load
  useEffect(() => {
    if (!orgName) {
      setLoading(false)
      setConfigBundle(null)
      setPolicyNameInput('')
      return
    }

    let cancelled = false
    const fetchConfig = async () => {
      setLoading(true)
      setError(null)
      if (isDemoMode()) {
        setConfigBundle({
          hash: DEMO_APPROVED_CONFIG_RESPONSE.hash || '',
          version: String(DEMO_APPROVED_CONFIG_RESPONSE.version || '3'),
          updatedBy: DEMO_APPROVED_CONFIG_RESPONSE.approvedBy || 'sarah.chen',
          updatedAt: DEMO_APPROVED_CONFIG_RESPONSE.updatedAt || DEMO_APPROVED_CONFIG_RESPONSE.approvedAt || new Date().toISOString(),
          policyName: DEMO_APPROVED_CONFIG_RESPONSE.policyName,
          instructions: DEMO_APPROVED_CONFIG_RESPONSE.instructions || null,
          commands: DEMO_APPROVED_CONFIG_RESPONSE.commands || [],
          hooks: DEMO_APPROVED_CONFIG_RESPONSE.hooks || [],
          settings: DEMO_APPROVED_CONFIG_RESPONSE.settings || null,
          subagents: DEMO_APPROVED_CONFIG_RESPONSE.subagents || [],
          rules: DEMO_APPROVED_CONFIG_RESPONSE.rules || [],
          cursorRules: DEMO_APPROVED_CONFIG_RESPONSE.cursorRules || null,
          copilotInstructions: DEMO_APPROVED_CONFIG_RESPONSE.copilotInstructions || null,
          copilotPathInstructions: DEMO_APPROVED_CONFIG_RESPONSE.copilotPathInstructions || [],
          copilotAgents: DEMO_APPROVED_CONFIG_RESPONSE.copilotAgents || [],
          copilotSkills: DEMO_APPROVED_CONFIG_RESPONSE.copilotSkills || [],
        })
        setPolicyNameInput(DEMO_APPROVED_CONFIG_RESPONSE.policyName || '')
        setLoading(false)
        return
      }
      try {
        const configResponse = await api.getApprovedConfig(orgName, selectedPlatform)
        if (cancelled) return
        if (configResponse.approved) {
          setConfigBundle({
            hash: configResponse.hash || '',
            version: String(configResponse.version || '0'),
            updatedBy: configResponse.approvedBy || user?.login || 'unknown',
            updatedAt: configResponse.updatedAt || configResponse.approvedAt || new Date().toISOString(),
            policyName: configResponse.policyName,
            // Claude-specific
            instructions: configResponse.instructions || null,
            commands: configResponse.commands || [],
            hooks: configResponse.hooks || [],
            settings: configResponse.settings || null,
            subagents: configResponse.subagents || [],
            // Cursor-specific (GAL-395)
            rules: configResponse.rules || [],
            cursorRules: configResponse.cursorRules || null,
            // Copilot-specific (GAL-395)
            copilotInstructions: configResponse.copilotInstructions || null,
            copilotPathInstructions: configResponse.copilotPathInstructions || [],
            copilotAgents: configResponse.copilotAgents || [],
            copilotSkills: configResponse.copilotSkills || [],
          })
          setPolicyNameInput(configResponse.policyName || '')
        } else {
          setConfigBundle(null)
          setPolicyNameInput('')
        }
      } catch (err) {
        if (cancelled) return
        console.error('Failed to fetch config for workspace:', err)
        setError('Failed to load configuration. Please try again.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    fetchConfig()
    return () => { cancelled = true }
  }, [orgName, selectedPlatform, user?.login])

  // Developer status useEffect removed — now on Team page (#2943)

  // Fetch policies when org changes (#3029)
  useEffect(() => {
    if (!orgName) return
    setPoliciesLoading(true)
    // Demo mode: serve pre-seeded policies so the selector resolves instead of
    // spinning on "Loading policies..." forever — the API is unavailable on the
    // public live demo (#507).
    if (isDemoMode()) {
      setPolicies(DEMO_CONFIG_POLICIES)
      const active = DEMO_CONFIG_POLICIES.find(pol => pol.isActive)
      if (active) setSelectedPolicyId(active.id)
      setPoliciesLoading(false)
      return
    }
    api.listPolicies(orgName).then(({ policies: p }) => {
      setPolicies(p)
      const active = p.find(pol => pol.isActive)
      if (active) setSelectedPolicyId(active.id)
    }).finally(() => setPoliciesLoading(false))
  }, [orgName])

  // Policy management handlers (#3029)
  const handleCreatePolicy = async (name: string, description?: string, duplicateFromId?: string) => {
    if (!orgName) return
    const result = await api.createPolicy(orgName, { name, description, duplicateFromId })
    if (result.error) {
      setApprovalToast({ message: result.error, type: 'error' })
      return
    }
    // Refresh policies
    const { policies: refreshed } = await api.listPolicies(orgName)
    setPolicies(refreshed)
    if (result.policy) setSelectedPolicyId(result.policy.id)
    setApprovalToast({ message: `Policy "${name}" created successfully.`, type: 'success' })
  }

  const handleActivatePolicy = async (policyId: string) => {
    if (!orgName) return
    const result = await api.activatePolicy(orgName, policyId)
    if (result.error) {
      setApprovalToast({ message: result.error, type: 'error' })
      return
    }
    // Refresh policies and config
    const { policies: refreshed } = await api.listPolicies(orgName)
    setPolicies(refreshed)
    // Re-fetch approved config since activation copies to approved-configs
    const configResponse = await api.getApprovedConfig(orgName, selectedPlatform)
    if (configResponse && 'instructions' in configResponse) {
      setConfigBundle({
        hash: configResponse.hash || '',
        version: configResponse.version || '',
        updatedBy: configResponse.approvedBy || '',
        updatedAt: configResponse.updatedAt || configResponse.approvedAt || '',
        instructions: configResponse.instructions || null,
        commands: configResponse.commands || [],
        hooks: configResponse.hooks || [],
        settings: configResponse.settings || null,
        subagents: configResponse.subagents || [],
        rules: configResponse.rules || [],
        copilotPathInstructions: configResponse.copilotPathInstructions || [],
        copilotAgents: configResponse.copilotAgents || [],
        copilotSkills: (configResponse as any).copilotSkills || [],
        policyName: configResponse.policyName,
      })
    }
  }

  const handleDeletePolicy = async (policyId: string) => {
    if (!orgName) return
    const result = await api.deletePolicy(orgName, policyId)
    if (result.error) {
      setApprovalToast({ message: result.error, type: 'error' })
      return
    }
    const { policies: refreshed } = await api.listPolicies(orgName)
    setPolicies(refreshed)
    if (selectedPolicyId === policyId) {
      const active = refreshed.find(p => p.isActive)
      setSelectedPolicyId(active?.id)
    }
  }

  const handleSelectPolicy = (policy: ConfigPolicyItem) => {
    setSelectedPolicyId(policy.id)
    // Bug #4677: Load the selected policy's config into the bundle so the
    // config sections below update immediately to show that policy's contents.
    const cfg = policy.config as Record<string, unknown>
    setConfigBundle({
      hash: (cfg.hash as string) || '',
      version: (cfg.version as string) || '',
      updatedBy: (cfg.approvedBy as string) || '',
      updatedAt: (cfg.updatedAt as string) || (cfg.approvedAt as string) || '',
      policyName: policy.name,
      instructions: (cfg.instructions as OrgConfigBundle['instructions']) || null,
      commands: (cfg.commands as OrgConfigBundle['commands']) || [],
      hooks: (cfg.hooks as OrgConfigBundle['hooks']) || [],
      settings: (cfg.settings as OrgConfigBundle['settings']) || null,
      subagents: (cfg.subagents as OrgConfigBundle['subagents']) || [],
      rules: (cfg.rules as OrgConfigBundle['rules']) || [],
      copilotPathInstructions: (cfg.copilotPathInstructions as OrgConfigBundle['copilotPathInstructions']) || [],
      copilotAgents: (cfg.copilotAgents as OrgConfigBundle['copilotAgents']) || [],
      copilotSkills: (cfg.copilotSkills as OrgConfigBundle['copilotSkills']) || [],
    })
  }

  // Handle approve query param from Discovery page
  useEffect(() => {
    const approveParam = searchParams.get('approve')
    if (!approveParam || loading || !orgName || processingApproval) return

    const processApproval = async () => {
      setProcessingApproval(true)

      // Parse format: type:name (e.g., "command:approve-pr")
      const [configType, configName] = approveParam.split(':')
      if (!configType || !configName) {
        setApprovalToast({ message: 'Invalid approve parameter format', type: 'error' })
        setProcessingApproval(false)
        return
      }

      try {
        // Fetch discovered configs to find the one to approve
        const response = await api.getDiscoveredConfigs(orgName)

        let allConfigs: DiscoveredConfig[] = []
        if ('configs' in response) {
          allConfigs = response.configs || []
        } else if ('groups' in response) {
          allConfigs = response.groups.flatMap(g =>
            g.instances.map(inst => ({
              type: g.type as DiscoveredConfigItem['type'],
              name: g.name,
              repo: inst.repo,
              path: inst.path,
              content: inst.content,
              lastModified: inst.lastModified,
              hash: inst.hash,
              platform: g.platform,
            }))
          )
        }

        // Find the config matching type and name
        const matchingConfig = allConfigs.find(c => {
          const name = c.path?.split('/').pop()?.replace('.md', '').replace('.json', '') || ''
          return c.type === configType && (name === configName || c.path?.includes(configName))
        })

        if (!matchingConfig) {
          setApprovalToast({ message: `Config "${configName}" not found`, type: 'error' })
          setProcessingApproval(false)
          // Clear the param
          // Update URL without the approve param
          const updatedParams = new URLSearchParams(searchParams.toString())
          updatedParams.delete('approve')
          const updatedUrl = updatedParams.toString() ? `/approved-config?${updatedParams.toString()}` : '/approved-config'
          router.replace(updatedUrl)
          return
        }

        // Initialize bundle if needed
        const currentBundle = configBundle || {
          hash: '',
          version: '0',
          updatedBy: user?.login || 'unknown',
          updatedAt: new Date().toISOString(),
          policyName: undefined,
          instructions: null,
          commands: [],
          hooks: [],
          settings: null,
          subagents: [],
          // GAL-395: Cursor-specific fields
          rules: [],
          cursorRules: null,
          // GAL-395: Copilot-specific fields
          copilotInstructions: null,
          copilotPathInstructions: [],
          copilotAgents: [],
          copilotSkills: [],
        }

        // Check if already in bundle
        const isAlreadyApproved = (() => {
          if (configType === 'command') {
            return currentBundle.commands.some(c => c.name.replace('.md', '') === configName)
          } else if (configType === 'subagent') {
            return currentBundle.subagents.some(s => s.name.replace('.md', '') === configName)
          } else if (configType === 'hook') {
            return currentBundle.hooks.some(h => h.name === configName)
          }
          return false
        })()

        if (isAlreadyApproved) {
          setApprovalToast({ message: `"${configName}" is already in the approved bundle`, type: 'success' })
        } else {
          // Fetch content if missing (cache may have metadata only for large orgs)
          let configContent = matchingConfig.content
          if (!configContent && matchingConfig.repo && matchingConfig.path) {
            const contentResult = await api.getConfigContent(orgName, matchingConfig.repo, matchingConfig.path)
            if (contentResult?.content) {
              configContent = contentResult.content
            } else {
              setApprovalToast({ message: `Failed to fetch content for "${configName}". Try again.`, type: 'error' })
              setProcessingApproval(false)
              // Update URL without the approve param
              const failParams = new URLSearchParams(searchParams.toString())
              failParams.delete('approve')
              const failUrl = failParams.toString() ? `/approved-config?${failParams.toString()}` : '/approved-config'
              router.replace(failUrl)
              return
            }
          }

          const itemHash = await generateHash(configContent || '')
          const newBundle = appendConfigToBundleTyped({
            bundle: currentBundle,
            configType,
            configName,
            matchingConfig,
            configContent,
            itemHash,
          })

          setConfigBundle(newBundle)
          setApprovalToast({ message: `Added "${configName}" to bundle. Click "Save Bundle" to confirm.`, type: 'success' })
        }

        // Clear the approve param
        // Update URL without the approve param
        const newParams = new URLSearchParams(searchParams.toString())
        newParams.delete('approve')
        const newUrl = newParams.toString() ? `/approved-config?${newParams.toString()}` : '/approved-config'
        router.replace(newUrl)
      } catch (err) {
        console.error('Failed to process approval:', err)
        setApprovalToast({ message: 'Failed to process approval. Please try again.', type: 'error' })
      } finally {
        setProcessingApproval(false)
      }
    }

    processApproval()
  }, [searchParams, router, loading, orgName, processingApproval, configBundle, user?.login])

  // Handle stageApproval query param from Discovery bulk-approve handoff (#2779)
  // Discovery stores a staging payload in sessionStorage and navigates here with
  // ?stageApproval=<token>. We load the payload, merge each selection into the
  // local bundle, show a summary toast, then clear the token so refresh is clean.
  useEffect(() => {
    const stageToken = searchParams.get('stageApproval')
    if (!stageToken || loading || !orgName || processingApproval || failedStageApprovalToken === stageToken) return

    const newParams = new URLSearchParams(searchParams.toString())
    newParams.delete('stageApproval')
    const newUrl = newParams.toString() ? `/approved-config?${newParams.toString()}` : '/approved-config'

    const processStageHandoff = async () => {
      setProcessingApproval(true)
      const payload = loadApprovalHandoff(stageToken)
      const clearStageHandoff = () => {
        setFailedStageApprovalToken(null)
        clearApprovalHandoff(stageToken)
        router.replace(newUrl)
      }

      if (!payload) {
        clearStageHandoff()
        setApprovalToast({ message: 'Approval session expired or unavailable. Please try again from Discovery.', type: 'error' })
        setProcessingApproval(false)
        return
      }

      if (payload.orgName !== orgName) {
        clearStageHandoff()
        setApprovalToast({
          message: `Staged approvals were created for ${payload.orgName}. Switch back to that workspace and retry from Discovery.`,
          type: 'error',
        })
        setProcessingApproval(false)
        return
      }

      try {
        // NOTE: Approved Config is currently Claude-only (selectedPlatform = 'claude').
        // Selections for other platforms are counted as skipped until multi-platform
        // bundle support is added to this page.
        const claudeSelections = payload.selections.filter(s => !s.platform || s.platform === 'claude')
        const skippedPlatformCount = payload.selections.length - claudeSelections.length
        const stageableSelections = claudeSelections.filter(isStageableSelection)
        const skippedUnsupportedCount = claudeSelections.length - stageableSelections.length

        const currentBundle = configBundle || {
          hash: '',
          version: '0',
          updatedBy: user?.login || 'unknown',
          updatedAt: new Date().toISOString(),
          policyName: undefined,
          instructions: null,
          commands: [],
          hooks: [],
          settings: null,
          subagents: [],
          rules: [],
          cursorRules: null,
          copilotInstructions: null,
          copilotPathInstructions: [],
          copilotAgents: [],
          copilotSkills: [],
        }

        const newBundle = { ...currentBundle }
        let added = 0
        let skippedDuplicates = 0
        let skippedInvalidCount = 0

        for (const sel of stageableSelections) {
          if (!sel.repo || !sel.path) {
            skippedInvalidCount++
            continue
          }

          // Fetch content — the staging payload only carries identity, not content
          const contentResult = await api.getConfigContent(orgName, sel.repo, sel.path)
          if (!contentResult?.content) continue // skip if content unavailable
          const content = contentResult.content

          const itemHash = await generateHash(content)
          const filename = sel.path.split('/').pop() || `${sel.name}.md`

          if (sel.type === 'command') {
            const dup = newBundle.commands.some(c => c.sourcePath === sel.path || c.name === filename)
            if (dup) { skippedDuplicates++; continue }
            newBundle.commands = [...newBundle.commands, { name: filename, content, sourceRepo: sel.repo, sourcePath: sel.path, hash: itemHash }]
            added++
          } else if (sel.type === 'subagent') {
            const dup = newBundle.subagents.some(s => s.sourcePath === sel.path || s.name === filename)
            if (dup) { skippedDuplicates++; continue }
            newBundle.subagents = [...newBundle.subagents, { name: filename, content, sourceRepo: sel.repo, sourcePath: sel.path, hash: itemHash }]
            added++
          } else if (sel.type === 'hook') {
            const dup = newBundle.hooks.some(h => h.sourcePath === sel.path || h.name === filename)
            if (dup) { skippedDuplicates++; continue }
            newBundle.hooks = [...newBundle.hooks, { name: filename, content, sourceRepo: sel.repo, sourcePath: sel.path, hash: itemHash }]
            added++
          } else if (sel.type === 'instructions') {
            // Singleton — replace any existing instructions with the chosen instance
            newBundle.instructions = { content, sourceRepo: sel.repo, sourcePath: sel.path, hash: itemHash }
            added++
          } else if (sel.type === 'settings') {
            // Singleton — replace any existing settings with the chosen instance
            newBundle.settings = { content, sourceRepo: sel.repo, sourcePath: sel.path, hash: itemHash }
            added++
          }
        }

        setConfigBundle(newBundle)

        // Build human-readable summary toast
        const parts: string[] = []
        if (added > 0) parts.push(`Added ${added} config${added !== 1 ? 's' : ''} to bundle`)
        if (skippedDuplicates > 0) parts.push(`${skippedDuplicates} already existed`)
        if (skippedPlatformCount > 0) parts.push(`${skippedPlatformCount} skipped (non-Claude platform staging not yet supported)`)
        if (skippedUnsupportedCount > 0) parts.push(`${skippedUnsupportedCount} skipped (unsupported type for Approved Config staging)`)
        if (skippedInvalidCount > 0) parts.push(`${skippedInvalidCount} skipped (missing source metadata)`)
        const summaryMsg = parts.length > 0
          ? `${parts.join('. ')}. Click "Save Bundle" to confirm.`
          : 'No new configs to stage.'

        setApprovalToast({ message: summaryMsg, type: 'success' })
        clearStageHandoff()
      } catch (err) {
        console.error('Failed to process staged approval handoff:', err)
        setFailedStageApprovalToken(stageToken)
        setApprovalToast({ message: 'Failed to stage configs. Retry or refresh to try the handoff again.', type: 'error' })
      } finally {
        setProcessingApproval(false)
      }
    }

    processStageHandoff()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- generateHash is a hoisted fn, not a dep
  }, [searchParams, router, loading, orgName, processingApproval, failedStageApprovalToken, configBundle, user?.login])

  const handleSaveBundle = async () => {
    if (!orgName || !configBundle) return

    setSaving(true)
    setError(null)
    setApprovalToast(null)
    try {
      // GAL-395: Calculate bundle hash including platform-specific fields
      const bundleString = JSON.stringify({
        // Claude-specific
        instructions: configBundle.instructions,
        commands: configBundle.commands,
        hooks: configBundle.hooks,
        settings: configBundle.settings,
        subagents: configBundle.subagents,
        // Cursor-specific
        rules: configBundle.rules,
        cursorRules: configBundle.cursorRules,
        // Copilot-specific
        copilotInstructions: configBundle.copilotInstructions,
        copilotPathInstructions: configBundle.copilotPathInstructions,
        copilotAgents: configBundle.copilotAgents,
        copilotSkills: configBundle.copilotSkills,
      })
      const hash = await generateHash(bundleString)

      // GAL-395: Save to selected platform
      const result = await api.setApprovedConfig(orgName, selectedPlatform, {
        hash,
        policyName: policyNameInput || undefined,
        // Claude-specific fields
        instructions: configBundle.instructions,
        commands: configBundle.commands,
        hooks: configBundle.hooks,
        settings: configBundle.settings,
        subagents: configBundle.subagents,
        // Cursor-specific fields
        rules: configBundle.rules,
        cursorRules: configBundle.cursorRules,
        // Copilot-specific fields
        copilotInstructions: configBundle.copilotInstructions,
        copilotPathInstructions: configBundle.copilotPathInstructions,
        copilotAgents: configBundle.copilotAgents,
        copilotSkills: configBundle.copilotSkills,
      })

      if (!result.success) {
        throw new Error(result.error || 'Failed to save configuration bundle')
      }

      const needsRestart = configBundle.commands.length > 0 || configBundle.hooks.length > 0
      const successMessage = needsRestart
        ? 'Bundle Saved! Restart your coding agent for command or hook changes to take effect.'
        : 'Bundle Saved!'
      setApprovalToast({ message: successMessage, type: 'success' })

      setConfigBundle({
        ...configBundle,
        hash: result.hash || hash,
        version: String(result.version || configBundle.version),
        updatedBy: user?.login || 'unknown',
        updatedAt: new Date().toISOString(),
        policyName: policyNameInput || undefined,
      })
      setShowEditor(false)
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to save:', err)
      }
      setError(getUserFriendlyError(err, 'Failed to save configuration. Please try again.'))
    } finally {
      setSaving(false)
    }
  }

  const handleGenerateStarterPolicy = async () => {
    if (!orgName) {
      setApprovalToast({ message: 'Please select a workspace first.', type: 'error' })
      return
    }
    if (!canManageApprovedConfig) {
      setApprovalToast({ message: 'Admin access is required to generate starter policies.', type: 'error' })
      return
    }

    setGeneratingDraft(true)
    setError(null)
    try {
      const rationale =
        policyNameInput?.trim()
          ? `Generate a safe starter approved config aligned with policy "${policyNameInput.trim()}".`
          : 'Generate a safe starter approved config for this organization.'

      const result = await api.generateApprovedConfigProposal(orgName, {
        platform: selectedPlatform,
        rationale,
        policyName: policyNameInput || undefined,
        autoGenerate: true,
      })

      if (!result.success || !result.proposal) {
        throw new Error(result.error || 'Failed to generate starter policy')
      }

      const generated = result.proposal.content
      setConfigBundle({
        hash: configBundle?.hash || '',
        version: configBundle?.version || 'draft',
        updatedBy: user?.login || 'copilot',
        updatedAt: new Date().toISOString(),
        policyName: policyNameInput || configBundle?.policyName,
        instructions: generated.instructions || null,
        commands: generated.commands || [],
        hooks: generated.hooks || [],
        settings: generated.settings || null,
        subagents: generated.subagents || [],
        rules: generated.rules || [],
        cursorRules: generated.cursorRules || null,
        copilotInstructions: generated.copilotInstructions || null,
        copilotPathInstructions: generated.copilotPathInstructions || [],
        copilotAgents: generated.copilotAgents || [],
        copilotSkills: generated.copilotSkills || [],
      })

      const sourceLabel = result.generation?.source === 'model' ? 'AI-assisted' : 'Deterministic'
      setApprovalToast({
        message: `${sourceLabel} starter policy generated. Review and click "Save Bundle" to publish.`,
        type: 'success',
      })
    } catch (err) {
      if (process.env.NODE_ENV === 'development') {
        console.error('Failed to generate starter policy:', err)
      }
      setApprovalToast({
        message: getUserFriendlyError(err, 'Failed to generate starter policy. Please try again.'),
        type: 'error',
      })
    } finally {
      setGeneratingDraft(false)
    }
  }

  // GAL-395: Extended to support Cursor types
  const handleAddConfig = (type: 'instructions' | 'command' | 'hook' | 'settings' | 'subagent') => {
    setEditingType(type)
    if (type === 'instructions') {
      const defaultConfig = `# ${orgName} Organization Config

## Security Standards
- Never hardcode API keys, tokens, or secrets
- Use environment variables for sensitive data
- Enable sandbox mode for file operations

## Code Quality
- Follow existing patterns in the codebase
- Write tests for new functionality
- Keep changes focused and reviewable`
      setEditingContent(defaultConfig)
    } else {
      setEditingContent('')
    }
    setShowEditor(true)
  }

  const handleSaveEdit = async () => {
    if (!editingContent.trim()) return

    const itemHash = await generateHash(editingContent)
    const newBundle = configBundle ? { ...configBundle } : {
      hash: '',
      version: '0',
      updatedBy: user?.login || 'unknown',
      updatedAt: new Date().toISOString(),
      policyName: policyNameInput || undefined,
      instructions: null,
      commands: [],
      hooks: [],
      settings: null,
      subagents: [],
      rules: [],
      cursorRules: null,
      copilotInstructions: null,
      copilotPathInstructions: [],
      copilotAgents: [],
      copilotSkills: [],
    }

    if (editingType === 'instructions') {
      newBundle.instructions = {
        content: editingContent,
        hash: itemHash,
      }
    } else if (editingType === 'settings') {
      newBundle.settings = {
        content: editingContent,
        hash: itemHash,
      }
    } else if (editingType === 'command') {
      newBundle.commands.push({
        name: 'new-command.md',
        content: editingContent,
        hash: itemHash,
      })
    } else if (editingType === 'hook') {
      newBundle.hooks.push({
        name: 'new-hook.json',
        content: editingContent,
        hash: itemHash,
      })
    } else if (editingType === 'subagent') {
      newBundle.subagents.push({
        name: 'new-agent.md',
        content: editingContent,
        hash: itemHash,
      })
    }

    setConfigBundle(newBundle)
    setShowEditor(false)
    setEditingContent('')
  }

  const refreshConfigFromServer = async () => {
    if (!orgName) return
    const configResponse = await api.getApprovedConfig(orgName, selectedPlatform)
    if (configResponse.approved) {
      setConfigBundle({
        hash: configResponse.hash || '',
        version: String(configResponse.version || '0'),
        updatedBy: configResponse.approvedBy || user?.login || 'unknown',
        updatedAt: configResponse.updatedAt || configResponse.approvedAt || new Date().toISOString(),
        policyName: configResponse.policyName,
        instructions: configResponse.instructions || null,
        commands: configResponse.commands || [],
        hooks: configResponse.hooks || [],
        settings: configResponse.settings || null,
        subagents: configResponse.subagents || [],
        rules: configResponse.rules || [],
        cursorRules: configResponse.cursorRules || null,
        copilotInstructions: configResponse.copilotInstructions || null,
        copilotPathInstructions: configResponse.copilotPathInstructions || [],
        copilotAgents: configResponse.copilotAgents || [],
        copilotSkills: configResponse.copilotSkills || [],
      })
    } else {
      setConfigBundle(null)
    }
  }

  const [removingItemKey, setRemovingItemKey] = useState<string | null>(null)

  const handleRemoveItem = async (type: 'command' | 'hook' | 'subagent' | 'rule' | 'instructions' | 'settings', index: number) => {
    if (!configBundle || !orgName) return

    const itemKey = `${type}-${index}`
    setRemovingItemKey(itemKey)
    try {
      const removePayload: Parameters<typeof api.removeFromApprovedConfig>[2] = {}
      if (type === 'command') {
        const item = configBundle.commands[index]
        removePayload.commandRefs = item?.sourcePath
          ? [{ name: item.name, sourceRepo: item.sourceRepo, sourcePath: item.sourcePath }]
          : undefined
        removePayload.commands = removePayload.commandRefs ? undefined : [item.name]
      } else if (type === 'hook') {
        const item = configBundle.hooks[index]
        removePayload.hookRefs = item?.sourcePath
          ? [{ name: item.name, sourceRepo: item.sourceRepo, sourcePath: item.sourcePath }]
          : undefined
        removePayload.hooks = removePayload.hookRefs ? undefined : [item.name]
      } else if (type === 'subagent') {
        const item = configBundle.subagents[index]
        removePayload.subagentRefs = item?.sourcePath
          ? [{ name: item.name, sourceRepo: item.sourceRepo, sourcePath: item.sourcePath }]
          : undefined
        removePayload.subagents = removePayload.subagentRefs ? undefined : [item.name]
      } else if (type === 'rule') {
        const item = configBundle.rules[index]
        removePayload.ruleRefs = item?.sourcePath
          ? [{ name: item.name, sourceRepo: item.sourceRepo, sourcePath: item.sourcePath }]
          : undefined
        removePayload.rules = removePayload.ruleRefs ? undefined : [item.name]
      } else if (type === 'instructions') {
        removePayload.clearInstructions = true
      } else if (type === 'settings') {
        removePayload.clearSettings = true
      }

      const result = await api.removeFromApprovedConfig(orgName, selectedPlatform, removePayload)
      if (result.success) {
        await refreshConfigFromServer()
        const labelMap: Record<string, string> = { instructions: 'Instructions', settings: 'Settings' }
        const arrayMap: Record<string, ConfigItem[]> = { command: configBundle.commands, hook: configBundle.hooks, subagent: configBundle.subagents, rule: configBundle.rules }
        const label = labelMap[type] || arrayMap[type]?.[index]?.name || type
        setApprovalToast({ message: `Removed ${label}`, type: 'success' })
      } else {
        setApprovalToast({ message: result.error || 'Failed to remove item', type: 'error' })
      }
    } catch (err) {
      console.error('Failed to remove item:', err)
      setApprovalToast({ message: 'Failed to remove item', type: 'error' })
    } finally {
      setRemovingItemKey(null)
    }
  }

  // Toggle item selection for batch operations
  const toggleItemSelection = (itemKey: string) => {
    const newSelected = new Set(selectedItems)
    if (newSelected.has(itemKey)) {
      newSelected.delete(itemKey)
    } else {
      newSelected.add(itemKey)
    }
    setSelectedItems(newSelected)
  }

  // Select/deselect all items of a type
  const toggleSelectAllOfType = (type: 'command' | 'hook' | 'subagent') => {
    if (!configBundle) return
    const newSelected = new Set(selectedItems)
    const items = type === 'command' ? configBundle.commands :
                  type === 'hook' ? configBundle.hooks :
                  configBundle.subagents
    const allKeys = items.map((_, idx) => `${type}-${idx}`)
    const allSelected = allKeys.every(key => selectedItems.has(key))

    if (allSelected) {
      // Deselect all of this type
      allKeys.forEach(key => newSelected.delete(key))
    } else {
      // Select all of this type
      allKeys.forEach(key => newSelected.add(key))
    }
    setSelectedItems(newSelected)
  }

  // Remove selected items (batch removal)
  const handleRemoveSelected = async () => {
    if (!configBundle || !orgName || selectedItems.size === 0) return

    setIsRemoving(true)
    try {
      // Parse selected items into arrays by type
      const commandsToRemove: string[] = []
      const commandRefs: Array<{ name?: string; sourceRepo?: string; sourcePath?: string }> = []
      const subagentsToRemove: string[] = []
      const subagentRefs: Array<{ name?: string; sourceRepo?: string; sourcePath?: string }> = []
      const hooksToRemove: string[] = []
      const hookRefs: Array<{ name?: string; sourceRepo?: string; sourcePath?: string }> = []
      const rulesToRemove: string[] = []
      const ruleRefs: Array<{ name?: string; sourceRepo?: string; sourcePath?: string }> = []

      selectedItems.forEach(key => {
        const [type, idxStr] = key.split('-')
        const idx = parseInt(idxStr, 10)
        if (type === 'command' && configBundle.commands[idx]) {
          const item = configBundle.commands[idx]
          if (item.sourcePath) {
            commandRefs.push({ name: item.name, sourceRepo: item.sourceRepo, sourcePath: item.sourcePath })
          } else {
            commandsToRemove.push(item.name)
          }
        } else if (type === 'subagent' && configBundle.subagents[idx]) {
          const item = configBundle.subagents[idx]
          if (item.sourcePath) {
            subagentRefs.push({ name: item.name, sourceRepo: item.sourceRepo, sourcePath: item.sourcePath })
          } else {
            subagentsToRemove.push(item.name)
          }
        } else if (type === 'hook' && configBundle.hooks[idx]) {
          const item = configBundle.hooks[idx]
          if (item.sourcePath) {
            hookRefs.push({ name: item.name, sourceRepo: item.sourceRepo, sourcePath: item.sourcePath })
          } else {
            hooksToRemove.push(item.name)
          }
        } else if (type === 'rule' && configBundle.rules[idx]) {
          const item = configBundle.rules[idx]
          if (item.sourcePath) {
            ruleRefs.push({ name: item.name, sourceRepo: item.sourceRepo, sourcePath: item.sourcePath })
          } else {
            rulesToRemove.push(item.name)
          }
        }
      })

      const result = await api.removeFromApprovedConfig(orgName, selectedPlatform, {
        commands: commandsToRemove.length > 0 ? commandsToRemove : undefined,
        commandRefs: commandRefs.length > 0 ? commandRefs : undefined,
        subagents: subagentsToRemove.length > 0 ? subagentsToRemove : undefined,
        subagentRefs: subagentRefs.length > 0 ? subagentRefs : undefined,
        hooks: hooksToRemove.length > 0 ? hooksToRemove : undefined,
        hookRefs: hookRefs.length > 0 ? hookRefs : undefined,
        rules: rulesToRemove.length > 0 ? rulesToRemove : undefined,
        ruleRefs: ruleRefs.length > 0 ? ruleRefs : undefined,
      })

      if (result.success) {
        await refreshConfigFromServer()
        setSelectedItems(new Set())
        setApprovalToast({ message: `Removed ${selectedItems.size} items`, type: 'success' })
      } else {
        setApprovalToast({ message: result.error || 'Failed to remove items', type: 'error' })
      }
    } catch (err) {
      console.error('Failed to remove items:', err)
      setApprovalToast({ message: 'Failed to remove items', type: 'error' })
    } finally {
      setIsRemoving(false)
    }
  }

  // Clear all approved config
  const handleClearAll = async () => {
    if (!orgName) return

    setIsRemoving(true)
    try {
      const result = await api.deleteApprovedConfig(orgName, selectedPlatform)
      if (result.success) {
        setConfigBundle(null)
        setSelectedItems(new Set())
        setShowClearConfirm(false)
        setApprovalToast({ message: 'Approved config cleared', type: 'success' })
      } else {
        setApprovalToast({ message: result.error || 'Failed to clear config', type: 'error' })
      }
    } catch (err) {
      console.error('Failed to clear config:', err)
      setApprovalToast({ message: 'Failed to clear config', type: 'error' })
    } finally {
      setIsRemoving(false)
    }
  }

  // Fetch discovered configs with optional type filter (server-side filtering for performance)
  const fetchDiscoveredConfigs = async (typeFilter?: 'all' | 'instructions' | 'command' | 'hook' | 'mcp' | 'settings' | 'subagent' | 'skill' | 'policy' | 'workflow' | 'prompt' | 'agent') => {
    setLoadingDiscovered(true)
    try {
      if (orgName) {
        // Pass type to API for server-side filtering (much faster than client-side)
        const apiType = typeFilter === 'all' ? undefined : typeFilter
        const response = await api.getDiscoveredConfigs(orgName, { type: apiType })

        // Handle both response formats (configs array or groups array)
        if ('configs' in response) {
          setDiscoveredConfigs(response.configs || [])
        } else if ('groups' in response) {
          // Flatten groups into individual configs
          const allConfigs = response.groups.flatMap(g =>
            g.instances.map(inst => ({
              type: g.type as DiscoveredConfigItem['type'],
              name: g.name,
              repo: inst.repo,
              path: inst.path,
              content: inst.content,
              lastModified: inst.lastModified,
              hash: inst.hash,
            }))
          )
          setDiscoveredConfigs(allConfigs)
        } else {
          setDiscoveredConfigs([])
        }
      }
    } catch (err) {
      console.error('Failed to fetch discovered configs:', err)
      setDiscoveredConfigs([])
    } finally {
      setLoadingDiscovered(false)
    }
  }

  const handleSelectFromDiscovered = async () => {
    setShowPicker(true)
    setSelectedConfig(null)
    setConfigTypeFilter('all')
    await fetchDiscoveredConfigs('all')
  }

  // Re-fetch when filter changes (server-side filtering)
  const handleFilterChange = async (newFilter: 'all' | 'instructions' | 'command' | 'hook' | 'mcp' | 'settings' | 'subagent' | 'skill' | 'policy' | 'workflow' | 'prompt' | 'agent') => {
    setConfigTypeFilter(newFilter)
    setSelectedConfig(null)
    await fetchDiscoveredConfigs(newFilter)
  }

  // Fetch content on-demand when previewing a config with missing content
  useEffect(() => {
    if (!previewConfig || previewConfig.content || !orgName) {
      setPreviewLoading(false)
      return
    }
    let cancelled = false
    setPreviewLoading(true)
    api.getConfigContent(orgName, previewConfig.repo, previewConfig.path)
      .then((result) => {
        if (cancelled) return
        if (result?.content) {
          setPreviewConfig((prev) => prev ? { ...prev, content: result.content } : null)
          setDiscoveredConfigs((prev) =>
            prev.map((c) =>
              c.repo === previewConfig.repo && c.path === previewConfig.path
                ? { ...c, content: result.content }
                : c,
            ),
          )
        }
      })
      .catch((err) => {
        if (!cancelled) console.error('Failed to fetch preview content:', err)
      })
      .finally(() => {
        if (!cancelled) setPreviewLoading(false)
      })
    return () => { cancelled = true }
  }, [previewConfig, orgName])

  // Filter configs based on type (show all types for bundle support)
  const filteredConfigs = configTypeFilter === 'all'
    ? discoveredConfigs
    : discoveredConfigs.filter(c => {
        if (configTypeFilter === 'instructions') return c.type === 'instructions'
        if (configTypeFilter === 'command') return c.type === 'command'
        if (configTypeFilter === 'hook') return c.type === 'hook'
        if (configTypeFilter === 'mcp') return c.type === 'mcp' || c.path?.includes('.mcp.json')
        if (configTypeFilter === 'settings') return c.type === 'settings'
        if (configTypeFilter === 'subagent') return c.type === 'subagent'
        if (configTypeFilter === 'skill') return c.type === 'skill'
        if (configTypeFilter === 'policy') return c.type === 'policy'
        if (configTypeFilter === 'workflow') return c.type === 'workflow'
        if (configTypeFilter === 'prompt') return c.type === 'prompt'
        if (configTypeFilter === 'agent') return c.type === 'agent'
        return false
      })

  const configSections = [
    { key: 'instructions', label: 'AGENTS.md', count: configBundle?.instructions ? 1 : 0 },
    { key: 'commands', label: 'Commands', count: configBundle?.commands.length ?? 0 },
    { key: 'hooks', label: 'Hooks', count: configBundle?.hooks.length ?? 0 },
    { key: 'settings', label: 'Settings', count: configBundle?.settings ? 1 : 0 },
    { key: 'subagents', label: 'Subagents', count: configBundle?.subagents.length ?? 0 },
  ] as const

  const toggleSection = (key: typeof APPROVED_CONFIG_SECTIONS[number]['key']) => {
    const nextCollapsed = new Set(collapsedSections)
    if (nextCollapsed.has(key)) {
      nextCollapsed.delete(key)
    } else {
      nextCollapsed.add(key)
    }
    setCollapsedSections(nextCollapsed)
    // NOTE: setActiveTab intentionally omitted here (#5658). Legacy tab renders are fully
    // gated behind NEXT_PUBLIC_ENABLE_LEGACY_APPROVED_CONFIG_TABS (disabled by default).
    // Calling setActiveTab from toggleSection was the root cause of flat command rows
    // appearing alongside the collapsible sections when a section header was clicked.
  }

  const handleUseConfig = async (config: DiscoveredConfig) => {
    if (!configBundle) {
      // Initialize bundle if it doesn't exist
      setConfigBundle({
        hash: '',
        version: '0',
        updatedBy: user?.login || 'unknown',
        updatedAt: new Date().toISOString(),
        policyName: policyNameInput || undefined,
        instructions: null,
        commands: [],
        hooks: [],
        settings: null,
        subagents: [],
        // GAL-395: Cursor-specific fields
        rules: [],
        cursorRules: null,
        // GAL-395: Copilot-specific fields
        copilotInstructions: null,
        copilotPathInstructions: [],
        copilotAgents: [],
        copilotSkills: [],
      })
    }

    const itemHash = await generateHash(config.content || '')
    const newBundle = configBundle ? { ...configBundle } : {
      hash: '',
      version: '0',
      updatedBy: user?.login || 'unknown',
      updatedAt: new Date().toISOString(),
      policyName: policyNameInput || undefined,
      instructions: null,
      commands: [],
      hooks: [],
      settings: null,
      subagents: [],
      // GAL-395: Cursor-specific fields
      rules: [],
      cursorRules: null,
      // GAL-395: Copilot-specific fields
      copilotInstructions: null,
      copilotPathInstructions: [],
      copilotAgents: [],
      copilotSkills: [],
    }

    // Add config to appropriate section based on type
    if (config.type === 'instructions' || config.path?.endsWith('CLAUDE.md')) {
      newBundle.instructions = {
        content: config.content || '',
        sourceRepo: config.repo,
        sourcePath: config.path,
        hash: itemHash,
      }
    } else if (config.type === 'settings') {
      newBundle.settings = {
        content: config.content || '',
        sourceRepo: config.repo,
        sourcePath: config.path,
        hash: itemHash,
      }
    } else if (config.type === 'command') {
      const name = config.path?.split('/').pop() || 'command.md'
      newBundle.commands.push({
        name,
        content: config.content || '',
        sourceRepo: config.repo,
        sourcePath: config.path,
        hash: itemHash,
      })
    } else if (config.type === 'hook') {
      const name = config.path?.split('/').pop() || 'hook.json'
      newBundle.hooks.push({
        name,
        content: config.content || '',
        sourceRepo: config.repo,
        sourcePath: config.path,
        hash: itemHash,
      })
    } else if (config.type === 'subagent') {
      const name = config.path?.split('/').pop() || 'agent.md'
      newBundle.subagents.push({
        name,
        content: config.content || '',
        sourceRepo: config.repo,
        sourcePath: config.path,
        hash: itemHash,
      })
    }

    setConfigBundle(newBundle)
    setShowPicker(false)
  }

  async function generateHash(content: string): Promise<string> {
    const encoder = new TextEncoder()
    const data = encoder.encode(content)
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16)
  }

  if (loading || orgDataLoading) {
    return <ApprovedConfigSkeleton />
  }

  if (error && !configBundle) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 rounded-2xl bg-[var(--status-danger-light)] flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-[var(--status-danger-text)]" />
          </div>
          <h1 className="text-2xl font-bold mb-3" style={STYLES.textPrimary}>Something went wrong</h1>
          <p className="mb-8" style={STYLES.textSecondary}>{error}</p>
          <button onClick={() => window.location.reload()} className="btn-primary">
            Try Again
          </button>
        </div>
      </div>
    )
  }

  // Not connected - simple CTA
  if (!isGitHubConnected) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6">
        <div className="text-center max-w-md">
          <div className="icon-container green w-16 h-16 rounded-2xl mx-auto mb-6">
            <Shield className="w-8 h-8" style={STYLES.accent} />
          </div>
          <h1 className="text-2xl font-bold mb-3" style={STYLES.textPrimary}>
            AI Governance for {user?.login ? `@${user.login}` : 'Dev Teams'}
          </h1>
          <p className="mb-8" style={STYLES.textSecondary}>
            Set the rules once. Every developer syncs the same AI config.
          </p>
          <button
            onClick={() => router.push('/settings?tab=github')}
            className="bg-[var(--interactive-primary)] hover:bg-[var(--interactive-primary-hover)] text-[var(--text-on-accent)] text-lg px-8 py-3 rounded-lg font-medium shadow-sm hover:shadow-md transition-all"
          >
            Connect GitHub to Start
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="animate-fadeIn">
    <div className="p-4 sm:p-6 lg:p-8 max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight mb-2" style={STYLES.textPrimary}>Approved Config</h1>
            <p style={STYLES.textSecondary}>
              Org-approved AI agent configuration for {orgName}
            </p>
            <p className="mt-3 text-xs" style={STYLES.textMuted}>
              Unified bundle view. Platform filters stay removed unless a design partner explicitly asks for them again.
            </p>
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="mb-6 p-4 bg-[var(--status-danger-light)] border border-[var(--status-danger-text)]/30 rounded-lg flex items-center gap-3">
          <AlertCircle className="w-5 h-5 text-[var(--status-danger-text)] flex-shrink-0" />
          <span className="text-[var(--status-danger-text)] text-sm">{error}</span>
        </div>
      )}

      {/* Orphan Detection Banner (#4830) */}
      {orgName && <OrphanBanner orgName={orgName} />}

      {/* Approval Toast */}
      {approvalToast && (
        <div
          className={`mb-6 p-4 rounded-lg flex items-center justify-between gap-3 ${
            approvalToast.type === 'success'
              ? 'bg-[var(--status-success-light)] border border-[var(--border-subtle)]'
              : 'bg-[var(--status-danger-light)] border border-[var(--status-danger-text)]/30'
          }`}
        >
          <div className="flex items-center gap-3">
            {approvalToast.type === 'success' ? (
              <Check className="w-5 h-5 text-[var(--status-success-text)] flex-shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-[var(--status-danger-text)] flex-shrink-0" />
            )}
            <span className={approvalToast.type === 'success' ? 'text-[var(--status-success-text)]' : 'text-[var(--status-danger-text)]'} style={{ fontSize: '0.875rem' }}>
              {approvalToast.message}
            </span>
          </div>
          <button
            onClick={() => setApprovalToast(null)}
            className="p-1 rounded hover:bg-[var(--surface-overlay)] transition-colors"
            style={STYLES.textMuted}
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Processing Approval Indicator */}
      {processingApproval && (
        <div className="mb-6 p-4 bg-[var(--status-info-light)] border border-[var(--status-info)]/20 rounded-lg flex items-center gap-3">
          <Loader2 className="w-5 h-5 text-[var(--status-info-text)] flex-shrink-0 animate-spin" />
          <span className="text-[var(--status-info-text)] text-sm">Processing approval...</span>
        </div>
      )}

      {/* Agent Sync Status removed — now shown on the Team page (#2943) */}

      {/* Org Base Config */}
      <div className="dashboard-card p-6 mb-6 shadow-md rounded-xl overflow-hidden border border-[var(--accent-neon)]/10">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-4 border-b border-[var(--accent-neon)]/10">
          <h2 className="text-lg font-semibold tracking-tight" style={STYLES.textPrimary}>Org Base Config</h2>
          {canManageApprovedConfig && (
            <div className="flex flex-wrap gap-2">
              {configBundle && (
                <button
                  onClick={() => setShowPreviewModal(true)}
                  className="btn-ghost text-sm flex items-center gap-2"
                  style={STYLES.textSecondary}
                >
                  <Eye className="w-4 h-4" />
                  Preview Merged Config
                </button>
              )}
              <button
                onClick={() => router.push('/discovery#configs')}
                className="btn-ghost text-sm flex items-center gap-2"
                style={STYLES.textSecondary}
              >
                <FolderOpen className="w-4 h-4" />
                Browse Discovery
              </button>
            </div>
          )}
        </div>

        {canManageApprovedConfig && (
          <div className="mb-4 rounded-lg px-4 py-3 text-sm" style={{ backgroundColor: 'var(--accent-bg)', color: 'var(--accent)' }}>
            Manage org policy publication in Discovery. Approved Config shows the published bundle only.
          </div>
        )}

        {/* Policy Selector (#3029) */}
        {orgName && (
          <div className="mb-4 pb-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <PolicySelector
              policies={policies}
              isLoading={policiesLoading}
              isAdmin={canManageApprovedConfig}
              onActivate={handleActivatePolicy}
              onCreate={handleCreatePolicy}
              onDelete={handleDeletePolicy}
              onSelect={handleSelectPolicy}
              selectedPolicyId={selectedPolicyId}
            />
          </div>
        )}

        {/* Display Policy Name (Non-Admin View) */}
        {!canManageApprovedConfig && configBundle?.policyName && (
          <div className="mb-4 p-3 rounded-lg flex items-center gap-2" style={{ backgroundColor: 'var(--accent-bg)' }}>
            <Shield className="w-4 h-4" style={STYLES.accent} />
            <span className="text-sm font-medium" style={STYLES.accent}>
              Policy: {configBundle.policyName}
            </span>
          </div>
        )}

        {configBundle ? (
          <>
            {/* Policy Name */}
            <div className="mb-4 pb-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              {editingPolicyName ? (
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={policyNameInput}
                    onChange={(e) => setPolicyNameInput(e.target.value)}
                    placeholder="Enter policy name (e.g., production-safe)"
                    className="input-field flex-1"
                    autoFocus
                  />
                  <button
                    onClick={() => {
                      setConfigBundle({ ...configBundle, policyName: policyNameInput || undefined })
                      setEditingPolicyName(false)
                    }}
                    className="btn-primary text-sm"
                  >
                    Save
                  </button>
                  <button
                    onClick={() => {
                      setPolicyNameInput(configBundle.policyName || '')
                      setEditingPolicyName(false)
                    }}
                    className="btn-secondary text-sm"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs uppercase tracking-wider mb-1" style={STYLES.textMuted}>
                      Policy Name
                    </p>
                    <p className="font-medium" style={STYLES.textPrimary}>
                      {configBundle.policyName || 'Unnamed Policy'}
                    </p>
                  </div>
                  {canAuthorApprovedConfig && (
                    <button
                      onClick={() => setEditingPolicyName(true)}
                      className="btn-ghost text-sm"
                      style={STYLES.textSecondary}
                    >
                      Edit
                    </button>
                  )}
                </div>
              )}
            </div>

            <div className="mb-4 flex flex-wrap gap-2">
              {configSections.map(({ key, label, count }) => {
                const isExpanded = !collapsedSections.has(key)
                return (
                  <button
                    key={`summary-${key}`}
                    onClick={() => toggleSection(key)}
                    className="inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition-colors"
                    style={{
                      backgroundColor: isExpanded ? 'var(--accent-bg)' : 'var(--bg-tertiary)',
                      color: isExpanded ? 'var(--accent)' : 'var(--text-secondary)',
                      border: '1px solid var(--border-subtle)',
                    }}
                  >
                    <span>{label}</span>
                    <span
                      className="rounded-full px-2 py-0.5 text-xs font-medium"
                      style={{
                        backgroundColor: isExpanded ? 'var(--bg-primary)' : 'var(--bg-secondary)',
                        color: isExpanded ? 'var(--accent)' : 'var(--text-muted)',
                      }}
                    >
                      {count}
                    </span>
                  </button>
                )
              })}
            </div>

            {/* Config Sections - Collapsible with count badges (#1100) */}
            <div className="space-y-3 mb-4">
              {configSections.map(({ key, label, count }) => {
                const isCollapsed = collapsedSections.has(key)

                return (
                  <div key={key} className="rounded-lg border" style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-tertiary)' }}>
                    <button
                      onClick={() => toggleSection(key)}
                      className="w-full px-4 py-3 flex items-center justify-between hover:opacity-80 transition-opacity"
                    >
                      <div className="flex items-center gap-3">
                        <ChevronRight
                          className={`w-5 h-5 transition-transform ${!isCollapsed ? 'rotate-90' : ''}`}
                          style={STYLES.textMuted}
                        />
                        <span className="font-medium" style={STYLES.textPrimary}>{label}</span>
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-medium"
                          style={{
                            backgroundColor: count > 0 ? 'var(--accent-bg)' : 'var(--bg-secondary)',
                            color: count > 0 ? 'var(--accent)' : 'var(--text-muted)'
                          }}
                        >
                          {count}
                        </span>
                      </div>
                    </button>

                    {!isCollapsed && (
                      <div className="px-4 pb-4">
                        {/* Render content based on section type */}
                        {key === 'instructions' && (
                          configBundle.instructions ? (
                            <div>
                              <pre className="text-sm rounded-lg p-4 max-h-64 overflow-auto whitespace-pre-wrap font-mono mb-3"
                                style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
                                {configBundle.instructions.content}
                              </pre>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  {configBundle.instructions.sourceRepo && (
                                    <p className="text-xs" style={STYLES.textMuted}>
                                      From: {configBundle.instructions.sourceRepo}/{configBundle.instructions.sourcePath}
                                    </p>
                                  )}
                                  <button
                                    onClick={() => setFilePreviewItem({
                                      name: 'AGENTS.md',
                                      content: configBundle.instructions?.content || null,
                                      sourceRepo: configBundle.instructions?.sourceRepo,
                                      sourcePath: configBundle.instructions?.sourcePath,
                                    })}
                                    className="p-1.5 rounded-lg transition-colors hover:bg-[var(--surface-overlay)]"
                                    style={STYLES.textMuted}
                                    title="Preview file content"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                </div>
                                {canAuthorApprovedConfig && (
                                  <div className="flex items-center gap-2">
                                    <button
                                      onClick={() => {
                                        setEditingType('instructions')
                                        setEditingContent(configBundle.instructions?.content || '')
                                        setShowEditor(true)
                                      }}
                                      className="btn-secondary text-sm flex items-center gap-2"
                                    >
                                      Edit Base Config
                                    </button>
                                    <button
                                      onClick={() => handleRemoveItem('instructions', 0)}
                                      disabled={removingItemKey === 'instructions-0'}
                                      className="text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors"
                                      style={{ backgroundColor: 'var(--status-danger-light)', color: 'var(--status-danger)' }}
                                    >
                                      {removingItemKey === 'instructions-0' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                                      Remove
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-8">
                              <FileText className="w-12 h-12 mx-auto mb-3" style={STYLES.textMuted} />
                              <p className="mb-4" style={STYLES.textMuted}>No instructions configured</p>
                              {canAuthorApprovedConfig && (
                                <button onClick={() => handleAddConfig('instructions')} className="btn-secondary text-sm">
                                  <Plus className="w-4 h-4 inline mr-2" />Add Instructions
                                </button>
                              )}
                            </div>
                          )
                        )}

                        {key === 'commands' && (
                          configBundle.commands.length > 0 ? (
                            <div className="space-y-2">
                              {canAuthorApprovedConfig && configBundle.commands.length > 1 && (
                                <div className="flex items-center gap-2 p-2 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                                  <input
                                    type="checkbox"
                                    checked={configBundle.commands.every((_, idx) => selectedItems.has(`command-${idx}`))}
                                    onChange={() => toggleSelectAllOfType('command')}
                                    className="w-4 h-4 rounded border-[var(--border-default)] text-[var(--text-secondary)] focus:ring-[var(--border-default)] cursor-pointer"
                                  />
                                  <span className="text-sm" style={STYLES.textMuted}>Select All Commands</span>
                                </div>
                              )}
                              {configBundle.commands.map((cmd, idx) => {
                                const itemKey = `command-${idx}`
                                const isExpanded = expandedItems.has(itemKey)
                                return (
                                  <div key={idx} className="rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}>
                                    <div
                                      className="p-3 flex items-start justify-between cursor-pointer hover:opacity-80"
                                      onClick={() => {
                                        const newExpanded = new Set(expandedItems)
                                        if (isExpanded) {
                                          newExpanded.delete(itemKey)
                                        } else {
                                          newExpanded.add(itemKey)
                                        }
                                        setExpandedItems(newExpanded)
                                      }}
                                    >
                                      <div className="flex-1 flex items-center gap-2">
                                        {canAuthorApprovedConfig && (
                                          <input
                                            type="checkbox"
                                            checked={selectedItems.has(itemKey)}
                                            onChange={(e) => { e.stopPropagation(); toggleItemSelection(itemKey) }}
                                            onClick={(e) => e.stopPropagation()}
                                            className="w-4 h-4 rounded border-[var(--border-default)] text-[var(--text-secondary)] focus:ring-[var(--border-default)] cursor-pointer"
                                          />
                                        )}
                                        <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} style={STYLES.textMuted} />
                                        <div>
                                          <p className="font-medium text-sm mb-1" style={STYLES.textPrimary}>{cmd.name}</p>
                                          {cmd.sourceRepo && <p className="text-xs" style={STYLES.textMuted}>From: {cmd.sourceRepo}</p>}
                                        </div>
                                      </div>
                                      <div className="flex items-center gap-1">
                                        <button
                                          onClick={(e) => { e.stopPropagation(); setFilePreviewItem({ name: cmd.name, content: cmd.content || null, sourceRepo: cmd.sourceRepo, sourcePath: cmd.sourcePath }) }}
                                          className="p-1 rounded transition-colors hover:bg-[var(--surface-overlay)]"
                                          style={STYLES.textMuted}
                                          title="Preview file content"
                                        >
                                          <Eye className="w-4 h-4" />
                                        </button>
                                        {canAuthorApprovedConfig && (
                                          <button
                                            onClick={(e) => { e.stopPropagation(); handleRemoveItem('command', idx) }}
                                            disabled={removingItemKey === `command-${idx}`}
                                            className="text-[var(--status-danger-text)] hover:text-[var(--status-danger-text)] p-1 rounded transition-colors"
                                            title="Remove command"
                                          >
                                            {removingItemKey === `command-${idx}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                                          </button>
                                        )}
                                      </div>
                                    </div>
                                    {isExpanded && (
                                      <div className="px-3 pb-3">
                                        {cmd.content ? (
                                          <pre
                                            className="text-xs p-3 rounded overflow-x-auto max-h-64 overflow-y-auto"
                                            style={{ backgroundColor: 'var(--bg-code)', color: 'var(--text-code)' }}
                                          >
                                            {cmd.content}
                                          </pre>
                                        ) : (
                                          <p className="text-xs italic p-3" style={STYLES.textMuted}>
                                            (No content available - content not synced from discovery)
                                          </p>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <div className="text-center py-8">
                              <FileText className="w-12 h-12 mx-auto mb-3" style={STYLES.textMuted} />
                              <p className="mb-4" style={STYLES.textMuted}>No commands configured</p>
                              {canAuthorApprovedConfig && (
                                <button onClick={() => handleAddConfig('command')} className="btn-secondary text-sm">
                                  <Plus className="w-4 h-4 inline mr-2" />Add Command
                                </button>
                              )}
                            </div>
                          )
                        )}

                        {key === 'hooks' && (
                          configBundle.hooks.length > 0 ? (
                            <div className="space-y-2">
                              {canAuthorApprovedConfig && configBundle.hooks.length > 1 && (
                                <div className="flex items-center gap-2 p-2 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                                  <input
                                    type="checkbox"
                                    checked={configBundle.hooks.every((_, idx) => selectedItems.has(`hook-${idx}`))}
                                    onChange={() => toggleSelectAllOfType('hook')}
                                    className="w-4 h-4 rounded border-[var(--border-default)] text-[var(--text-secondary)] focus:ring-[var(--border-default)] cursor-pointer"
                                  />
                                  <span className="text-sm" style={STYLES.textMuted}>Select All Hooks</span>
                                </div>
                              )}
                              {configBundle.hooks.map((hook, idx) => {
                                const itemKey = `hook-${idx}`
                                return (
                                  <div key={idx} className="p-3 rounded-lg flex items-start justify-between" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}>
                                    <div className="flex-1 flex items-center gap-2">
                                      {canAuthorApprovedConfig && (
                                        <input
                                          type="checkbox"
                                          checked={selectedItems.has(itemKey)}
                                          onChange={() => toggleItemSelection(itemKey)}
                                          className="w-4 h-4 rounded border-[var(--border-default)] text-[var(--text-secondary)] focus:ring-[var(--border-default)] cursor-pointer"
                                        />
                                      )}
                                      <div>
                                        <p className="font-medium text-sm mb-1" style={STYLES.textPrimary}>{hook.name}</p>
                                        {hook.sourceRepo && <p className="text-xs" style={STYLES.textMuted}>From: {hook.sourceRepo}</p>}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => setFilePreviewItem({ name: hook.name, content: hook.content || null, sourceRepo: hook.sourceRepo, sourcePath: hook.sourcePath })}
                                        className="p-1 rounded transition-colors hover:bg-[var(--surface-overlay)]"
                                        style={STYLES.textMuted}
                                        title="Preview file content"
                                      >
                                        <Eye className="w-4 h-4" />
                                      </button>
                                      {canAuthorApprovedConfig && (
                                        <button
                                          onClick={() => handleRemoveItem('hook', idx)}
                                          disabled={removingItemKey === `hook-${idx}`}
                                          className="text-[var(--status-danger-text)] hover:text-[var(--status-danger-text)] p-1 rounded transition-colors"
                                          title="Remove hook"
                                        >
                                          {removingItemKey === `hook-${idx}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <div className="text-center py-8">
                              <FileText className="w-12 h-12 mx-auto mb-3" style={STYLES.textMuted} />
                              <p className="mb-4" style={STYLES.textMuted}>No hooks configured</p>
                              {canAuthorApprovedConfig && (
                                <button onClick={() => handleAddConfig('hook')} className="btn-secondary text-sm">
                                  <Plus className="w-4 h-4 inline mr-2" />Add Hook
                                </button>
                              )}
                            </div>
                          )
                        )}

                        {key === 'settings' && (
                          configBundle.settings ? (
                            <div>
                              <pre className="text-sm rounded-lg p-4 max-h-64 overflow-auto whitespace-pre-wrap font-mono mb-3"
                                style={{ backgroundColor: 'var(--bg-secondary)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
                                {configBundle.settings.content}
                              </pre>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  {configBundle.settings.sourceRepo && (
                                    <p className="text-xs" style={STYLES.textMuted}>
                                      From: {configBundle.settings.sourceRepo}/{configBundle.settings.sourcePath}
                                    </p>
                                  )}
                                  <button
                                    onClick={() => setFilePreviewItem({
                                      name: 'settings.json',
                                      content: configBundle.settings?.content || null,
                                      sourceRepo: configBundle.settings?.sourceRepo,
                                      sourcePath: configBundle.settings?.sourcePath,
                                    })}
                                    className="p-1.5 rounded-lg transition-colors hover:bg-[var(--surface-overlay)]"
                                    style={STYLES.textMuted}
                                    title="Preview file content"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                </div>
                                {canAuthorApprovedConfig && (
                                  <button
                                    onClick={() => handleRemoveItem('settings', 0)}
                                    disabled={removingItemKey === 'settings-0'}
                                    className="text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors"
                                    style={{ backgroundColor: 'var(--status-danger-light)', color: 'var(--status-danger)' }}
                                  >
                                    {removingItemKey === 'settings-0' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                                    Remove
                                  </button>
                                )}
                              </div>
                            </div>
                          ) : (
                            <div className="text-center py-8">
                              <FileText className="w-12 h-12 mx-auto mb-3" style={STYLES.textMuted} />
                              <p className="mb-4" style={STYLES.textMuted}>No settings configured</p>
                              {canAuthorApprovedConfig && (
                                <button onClick={() => handleAddConfig('settings')} className="btn-secondary text-sm">
                                  <Plus className="w-4 h-4 inline mr-2" />Add Settings
                                </button>
                              )}
                            </div>
                          )
                        )}

                        {key === 'subagents' && (
                          configBundle.subagents.length > 0 ? (
                            <div className="space-y-2">
                              {canAuthorApprovedConfig && configBundle.subagents.length > 1 && (
                                <div className="flex items-center gap-2 p-2 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                                  <input
                                    type="checkbox"
                                    checked={configBundle.subagents.every((_, idx) => selectedItems.has(`subagent-${idx}`))}
                                    onChange={() => toggleSelectAllOfType('subagent')}
                                    className="w-4 h-4 rounded border-[var(--border-default)] text-[var(--text-secondary)] focus:ring-[var(--border-default)] cursor-pointer"
                                  />
                                  <span className="text-sm" style={STYLES.textMuted}>Select All Subagents</span>
                                </div>
                              )}
                              {configBundle.subagents.map((agent, idx) => {
                                const itemKey = `subagent-${idx}`
                                return (
                                  <div key={idx} className="p-3 rounded-lg flex items-start justify-between" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}>
                                    <div className="flex-1 flex items-center gap-2">
                                      {canAuthorApprovedConfig && (
                                        <input
                                          type="checkbox"
                                          checked={selectedItems.has(itemKey)}
                                          onChange={() => toggleItemSelection(itemKey)}
                                          className="w-4 h-4 rounded border-[var(--border-default)] text-[var(--text-secondary)] focus:ring-[var(--border-default)] cursor-pointer"
                                        />
                                      )}
                                      <div>
                                        <p className="font-medium text-sm mb-1" style={STYLES.textPrimary}>{agent.name}</p>
                                        {agent.sourceRepo && <p className="text-xs" style={STYLES.textMuted}>From: {agent.sourceRepo}</p>}
                                      </div>
                                    </div>
                                    <div className="flex items-center gap-1">
                                      <button
                                        onClick={() => setFilePreviewItem({ name: agent.name, content: agent.content || null, sourceRepo: agent.sourceRepo, sourcePath: agent.sourcePath })}
                                        className="p-1 rounded transition-colors hover:bg-[var(--surface-overlay)]"
                                        style={STYLES.textMuted}
                                        title="Preview file content"
                                      >
                                        <Eye className="w-4 h-4" />
                                      </button>
                                      {canAuthorApprovedConfig && (
                                        <button
                                          onClick={() => handleRemoveItem('subagent', idx)}
                                          disabled={removingItemKey === `subagent-${idx}`}
                                          className="text-[var(--status-danger-text)] hover:text-[var(--status-danger-text)] p-1 rounded transition-colors"
                                          title="Remove subagent"
                                        >
                                          {removingItemKey === `subagent-${idx}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          ) : (
                            <div className="text-center py-8">
                              <FileText className="w-12 h-12 mx-auto mb-3" style={STYLES.textMuted} />
                              <p className="mb-4" style={STYLES.textMuted}>No subagents configured</p>
                              {canAuthorApprovedConfig && (
                                <button onClick={() => handleAddConfig('subagent')} className="btn-secondary text-sm">
                                  <Plus className="w-4 h-4 inline mr-2" />Add Subagent
                                </button>
                              )}
                            </div>
                          )
                        )}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Old Tab Content - REMOVED, now rendered inside collapsible sections above */}
            {process.env['NEXT_PUBLIC_ENABLE_LEGACY_APPROVED_CONFIG_TABS'] === 'true' && activeTab === 'instructions' && (
                configBundle.instructions ? (
                  <div>
                    <pre className="text-sm rounded-lg p-4 max-h-64 overflow-auto whitespace-pre-wrap font-mono mb-3"
                      style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
                      {configBundle.instructions.content}
                    </pre>
                    <div className="flex items-center justify-between">
                      {configBundle.instructions.sourceRepo && (
                        <p className="text-xs" style={STYLES.textMuted}>
                          From: {configBundle.instructions.sourceRepo}/{configBundle.instructions.sourcePath}
                        </p>
                      )}
                      {canAuthorApprovedConfig && (
                        <button
                          onClick={() => {
                            setEditingType('instructions')
                            setEditingContent(configBundle.instructions?.content || '')
                            setShowEditor(true)
                          }}
                          className="btn-secondary text-sm flex items-center gap-2"
                        >
                          Edit Base Config
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 mx-auto mb-3" style={STYLES.textMuted} />
                    <p className="mb-4" style={STYLES.textMuted}>No instructions configured</p>
                    {canAuthorApprovedConfig && (
                      <button onClick={() => handleAddConfig('instructions')} className="btn-secondary text-sm">
                        <Plus className="w-4 h-4 inline mr-2" />Add Instructions
                      </button>
                    )}
                  </div>
                )
              )}

              {process.env['NEXT_PUBLIC_ENABLE_LEGACY_APPROVED_CONFIG_TABS'] === 'true' && activeTab === 'commands' && (
                configBundle.commands.length > 0 ? (
                  <div className="space-y-2">
                    {/* Select All Header */}
                    {canAuthorApprovedConfig && configBundle.commands.length > 1 && (
                      <div className="flex items-center gap-2 p-2 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                        <input
                          type="checkbox"
                          checked={configBundle.commands.every((_, idx) => selectedItems.has(`command-${idx}`))}
                          onChange={() => toggleSelectAllOfType('command')}
                          className="w-4 h-4 rounded border-[var(--border-default)] text-[var(--text-secondary)] focus:ring-[var(--border-default)] cursor-pointer"
                        />
                        <span className="text-sm" style={STYLES.textMuted}>Select All Commands</span>
                      </div>
                    )}
                    {configBundle.commands.map((cmd, idx) => {
                      const itemKey = `command-${idx}`
                      const isExpanded = expandedItems.has(itemKey)
                      return (
                        <div key={idx} className="rounded-lg overflow-hidden" style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}>
                          <div
                            className="p-3 flex items-start justify-between cursor-pointer hover:opacity-80"
                            onClick={() => {
                              const newExpanded = new Set(expandedItems)
                              if (isExpanded) {
                                newExpanded.delete(itemKey)
                              } else {
                                newExpanded.add(itemKey)
                              }
                              setExpandedItems(newExpanded)
                            }}
                          >
                            <div className="flex-1 flex items-center gap-2">
                              {canAuthorApprovedConfig && (
                                <input
                                  type="checkbox"
                                  checked={selectedItems.has(itemKey)}
                                  onChange={(e) => { e.stopPropagation(); toggleItemSelection(itemKey) }}
                                  onClick={(e) => e.stopPropagation()}
                                  className="w-4 h-4 rounded border-[var(--border-default)] text-[var(--text-secondary)] focus:ring-[var(--border-default)] cursor-pointer"
                                />
                              )}
                              <ChevronRight className={`w-4 h-4 transition-transform ${isExpanded ? 'rotate-90' : ''}`} style={STYLES.textMuted} />
                              <div>
                                <p className="font-medium text-sm mb-1" style={STYLES.textPrimary}>{cmd.name}</p>
                                {cmd.sourceRepo && <p className="text-xs" style={STYLES.textMuted}>From: {cmd.sourceRepo}</p>}
                              </div>
                            </div>
                            {canAuthorApprovedConfig && (
                              <button
                                onClick={(e) => { e.stopPropagation(); handleRemoveItem('command', idx) }}
                                disabled={removingItemKey === `command-${idx}`}
                                className="text-[var(--status-danger-text)] hover:text-[var(--status-danger-text)] p-1 rounded transition-colors"
                                title="Remove command"
                              >
                                {removingItemKey === `command-${idx}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                              </button>
                            )}
                          </div>
                          {isExpanded && (
                            <div className="px-3 pb-3">
                              {cmd.content ? (
                                <pre
                                  className="text-xs p-3 rounded overflow-x-auto max-h-64 overflow-y-auto"
                                  style={{ backgroundColor: 'var(--bg-code)', color: 'var(--text-code)' }}
                                >
                                  {cmd.content}
                                </pre>
                              ) : (
                                <p className="text-xs italic p-3" style={STYLES.textMuted}>
                                  (No content available - content not synced from discovery)
                                </p>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 mx-auto mb-3" style={STYLES.textMuted} />
                    <p className="mb-4" style={STYLES.textMuted}>No commands configured</p>
                    {canAuthorApprovedConfig && (
                      <button onClick={() => handleAddConfig('command')} className="btn-secondary text-sm">
                        <Plus className="w-4 h-4 inline mr-2" />Add Command
                      </button>
                    )}
                  </div>
                )
              )}

              {process.env['NEXT_PUBLIC_ENABLE_LEGACY_APPROVED_CONFIG_TABS'] === 'true' && activeTab === 'hooks' && (
                configBundle.hooks.length > 0 ? (
                  <div className="space-y-2">
                    {/* Select All Header */}
                    {canAuthorApprovedConfig && configBundle.hooks.length > 1 && (
                      <div className="flex items-center gap-2 p-2 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                        <input
                          type="checkbox"
                          checked={configBundle.hooks.every((_, idx) => selectedItems.has(`hook-${idx}`))}
                          onChange={() => toggleSelectAllOfType('hook')}
                          className="w-4 h-4 rounded border-[var(--border-default)] text-[var(--text-secondary)] focus:ring-[var(--border-default)] cursor-pointer"
                        />
                        <span className="text-sm" style={STYLES.textMuted}>Select All Hooks</span>
                      </div>
                    )}
                    {configBundle.hooks.map((hook, idx) => {
                      const itemKey = `hook-${idx}`
                      return (
                        <div key={idx} className="p-3 rounded-lg flex items-start justify-between" style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}>
                          <div className="flex-1 flex items-center gap-2">
                            {canAuthorApprovedConfig && (
                              <input
                                type="checkbox"
                                checked={selectedItems.has(itemKey)}
                                onChange={() => toggleItemSelection(itemKey)}
                                className="w-4 h-4 rounded border-[var(--border-default)] text-[var(--text-secondary)] focus:ring-[var(--border-default)] cursor-pointer"
                              />
                            )}
                            <div>
                              <p className="font-medium text-sm mb-1" style={STYLES.textPrimary}>{hook.name}</p>
                              {hook.sourceRepo && <p className="text-xs" style={STYLES.textMuted}>From: {hook.sourceRepo}</p>}
                            </div>
                          </div>
                          {canAuthorApprovedConfig && (
                            <button
                              onClick={() => handleRemoveItem('hook', idx)}
                              disabled={removingItemKey === `hook-${idx}`}
                              className="text-[var(--status-danger-text)] hover:text-[var(--status-danger-text)] p-1 rounded transition-colors"
                              title="Remove hook"
                            >
                              {removingItemKey === `hook-${idx}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 mx-auto mb-3" style={STYLES.textMuted} />
                    <p className="mb-4" style={STYLES.textMuted}>No hooks configured</p>
                    {canAuthorApprovedConfig && (
                      <button onClick={() => handleAddConfig('hook')} className="btn-secondary text-sm">
                        <Plus className="w-4 h-4 inline mr-2" />Add Hook
                      </button>
                    )}
                  </div>
                )
              )}

              {process.env['NEXT_PUBLIC_ENABLE_LEGACY_APPROVED_CONFIG_TABS'] === 'true' && activeTab === 'settings' && (
                configBundle.settings ? (
                  <div>
                    <pre className="text-sm rounded-lg p-4 max-h-64 overflow-auto whitespace-pre-wrap font-mono mb-3"
                      style={{ backgroundColor: 'var(--bg-tertiary)', color: 'var(--text-secondary)', border: '1px solid var(--border-subtle)' }}>
                      {configBundle.settings.content}
                    </pre>
                    <div className="flex items-center justify-between">
                      {configBundle.settings.sourceRepo && (
                        <p className="text-xs" style={STYLES.textMuted}>
                          From: {configBundle.settings.sourceRepo}/{configBundle.settings.sourcePath}
                        </p>
                      )}
                      {canAuthorApprovedConfig && (
                        <button
                          onClick={() => handleRemoveItem('settings', 0)}
                          disabled={removingItemKey === 'settings-0'}
                          className="text-sm flex items-center gap-1.5 px-3 py-1.5 rounded-lg transition-colors"
                          style={{ backgroundColor: 'var(--status-danger-light)', color: 'var(--status-danger)' }}
                        >
                          {removingItemKey === 'settings-0' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
                          Remove
                        </button>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 mx-auto mb-3" style={STYLES.textMuted} />
                    <p className="mb-4" style={STYLES.textMuted}>No settings configured</p>
                    {canAuthorApprovedConfig && (
                      <button onClick={() => handleAddConfig('settings')} className="btn-secondary text-sm">
                        <Plus className="w-4 h-4 inline mr-2" />Add Settings
                      </button>
                    )}
                  </div>
                )
              )}

              {process.env['NEXT_PUBLIC_ENABLE_LEGACY_APPROVED_CONFIG_TABS'] === 'true' && activeTab === 'subagents' && (
                configBundle.subagents.length > 0 ? (
                  <div className="space-y-2">
                    {/* Select All Header */}
                    {canAuthorApprovedConfig && configBundle.subagents.length > 1 && (
                      <div className="flex items-center gap-2 p-2 rounded-lg" style={{ backgroundColor: 'var(--bg-secondary)' }}>
                        <input
                          type="checkbox"
                          checked={configBundle.subagents.every((_, idx) => selectedItems.has(`subagent-${idx}`))}
                          onChange={() => toggleSelectAllOfType('subagent')}
                          className="w-4 h-4 rounded border-[var(--border-default)] text-[var(--text-secondary)] focus:ring-[var(--border-default)] cursor-pointer"
                        />
                        <span className="text-sm" style={STYLES.textMuted}>Select All Subagents</span>
                      </div>
                    )}
                    {configBundle.subagents.map((agent, idx) => {
                      const itemKey = `subagent-${idx}`
                      return (
                        <div key={idx} className="p-3 rounded-lg flex items-start justify-between" style={{ backgroundColor: 'var(--bg-tertiary)', border: '1px solid var(--border-subtle)' }}>
                          <div className="flex-1 flex items-center gap-2">
                            {canAuthorApprovedConfig && (
                              <input
                                type="checkbox"
                                checked={selectedItems.has(itemKey)}
                                onChange={() => toggleItemSelection(itemKey)}
                                className="w-4 h-4 rounded border-[var(--border-default)] text-[var(--text-secondary)] focus:ring-[var(--border-default)] cursor-pointer"
                              />
                            )}
                            <div>
                              <p className="font-medium text-sm mb-1" style={STYLES.textPrimary}>{agent.name}</p>
                              {agent.sourceRepo && <p className="text-xs" style={STYLES.textMuted}>From: {agent.sourceRepo}</p>}
                            </div>
                          </div>
                          {canAuthorApprovedConfig && (
                            <button
                              onClick={() => handleRemoveItem('subagent', idx)}
                              disabled={removingItemKey === `subagent-${idx}`}
                              className="text-[var(--status-danger-text)] hover:text-[var(--status-danger-text)] p-1 rounded transition-colors"
                              title="Remove subagent"
                            >
                              {removingItemKey === `subagent-${idx}` ? <Loader2 className="w-4 h-4 animate-spin" /> : <X className="w-4 h-4" />}
                            </button>
                          )}
                        </div>
                      )
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <FileText className="w-12 h-12 mx-auto mb-3" style={STYLES.textMuted} />
                    <p className="mb-4" style={STYLES.textMuted}>No subagents configured</p>
                    {canAuthorApprovedConfig && (
                      <button onClick={() => handleAddConfig('subagent')} className="btn-secondary text-sm">
                        <Plus className="w-4 h-4 inline mr-2" />Add Subagent
                      </button>
                    )}
                  </div>
                )
              )}

              {/* Cursor Rules and .cursorrules tabs removed - GAL uses unified Claude configs (#1339) */}
            <div className="text-xs flex items-center gap-4 flex-wrap mt-4 pt-4" style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
              <span>Version {configBundle.version}</span>
              <span>Updated {new Date(configBundle.updatedAt).toLocaleDateString()}</span>
              <span>by {configBundle.updatedBy}</span>
            </div>
          </>
        ) : (
          <div className="text-center py-8">
            <Shield className="w-12 h-12 mx-auto mb-3" style={STYLES.textMuted} />
            <h3 className="text-lg font-medium mb-2" style={STYLES.textPrimary}>
              No config bundle set yet
            </h3>
            <p className="mb-2 max-w-md mx-auto" style={STYLES.textMuted}>
              The approved config bundle defines what AI agent configurations are allowed in your organization.
            </p>
            <p className="mb-6 text-sm max-w-md mx-auto" style={STYLES.textMuted}>
              Browse discovered configs from your repositories and approve the ones you want to standardize.
            </p>
            {canManageApprovedConfig && (
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => router.push('/discovery#configs')}
                  className="btn-primary text-sm flex items-center gap-2"
                >
                  <FolderOpen className="w-4 h-4" />
                  Browse Discovery
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Org Commands section removed - commands shown in tabs above (#1339) */}

      {showWorkspacePolicyBundlesPanel && (
        <WorkspacePolicyBundlesPanel
          workspaceName={orgName}
          badge={<FlagBadge pageId="project-scope-configs" />}
        />
      )}

      {/* Sync to Local section removed - sync info available in CLI guide (#1339) */}

      {/* Config Editor Modal */}
      {showEditor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="rounded-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden flex flex-col" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}>
            <div className="p-6 pb-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <h3 className="text-xl font-semibold mb-2" style={STYLES.textPrimary}>
                Add {editingType === 'instructions' ? 'Instructions' : editingType === 'command' ? 'Command' : editingType === 'hook' ? 'Hook' : editingType === 'settings' ? 'Settings' : 'Subagent'}
              </h3>
              <p className="text-sm" style={STYLES.textSecondary}>
                This will be included in the org config bundle
              </p>
            </div>

            <div className="p-6 flex-1 overflow-y-auto min-h-0">
              <textarea
                value={editingContent}
                onChange={(e) => setEditingContent(e.target.value)}
                className="input-field w-full h-80 resize-none font-mono"
                placeholder={`# Your ${editingType} content here...`}
              />
            </div>

            <div className="flex justify-between gap-3 p-6 pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <button
                onClick={handleSelectFromDiscovered}
                className="btn-secondary text-sm flex items-center gap-2"
              >
                <FolderOpen className="w-4 h-4" />
                Load from Discovered
              </button>
              <div className="flex gap-3">
                <button
                  onClick={() => { setShowEditor(false); setEditingContent(''); }}
                  className="btn-secondary"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="btn-primary"
                  disabled={!editingContent.trim()}
                >
                  Add to Bundle
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Discovered Configs Picker Modal */}
      {showPicker && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}>
          <div className="rounded-2xl max-w-3xl w-full max-h-[85vh] overflow-hidden flex flex-col" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}>
            <div className="p-6 pb-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <h3 className="text-xl font-semibold mb-2" style={STYLES.textPrimary}>
                Select from Discovered Configs
              </h3>
              <p className="text-sm" style={STYLES.textSecondary}>
                Choose a config from your repositories
              </p>
            </div>

            <div className="p-6 flex-1 overflow-y-auto min-h-0">
              {/* Config Type Filter */}
              <div className="mb-4 flex flex-wrap gap-2">
                {[
                  { value: 'all' as const, label: 'All' },
                  { value: 'instructions' as const, label: 'AGENTS.md' },
                  { value: 'command' as const, label: 'Commands' },
                  { value: 'hook' as const, label: 'Hooks' },
                  { value: 'mcp' as const, label: 'MCP' },
                  { value: 'settings' as const, label: 'Settings' },
                  { value: 'subagent' as const, label: 'Subagents' },
                  { value: 'skill' as const, label: 'Skills' },
                  { value: 'policy' as const, label: 'Policies' },
                  { value: 'workflow' as const, label: 'Workflows' },
                  { value: 'prompt' as const, label: 'Prompts' },
                  { value: 'agent' as const, label: 'Agents' },
                ].map(({ value, label }) => (
                  <button
                    key={value}
                    onClick={() => handleFilterChange(value)}
                    className="px-3 py-1.5 rounded-lg text-sm transition-all"
                    style={{
                      backgroundColor: configTypeFilter === value ? 'var(--accent)' : 'var(--bg-tertiary)',
                      color: configTypeFilter === value ? 'var(--text-on-accent)' : 'var(--text-secondary)',
                      border: `1px solid ${configTypeFilter === value ? 'var(--accent)' : 'var(--border-subtle)'}`
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {loadingDiscovered ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin" style={STYLES.accent} />
                </div>
              ) : filteredConfigs.length === 0 ? (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 mx-auto mb-3" style={STYLES.textMuted} />
                  <p className="mb-4" style={STYLES.textMuted}>
                    {discoveredConfigs.length === 0
                      ? 'No configs discovered yet'
                      : `No ${configTypeFilter === 'all' ? '' : configTypeFilter} configs found`}
                  </p>
                  <p className="text-sm mb-6" style={STYLES.textMuted}>
                    {discoveredConfigs.length === 0
                      ? 'Run a scan from the Discovery page first'
                      : 'Try selecting a different config type'}
                  </p>
                  {discoveredConfigs.length === 0 && (
                    <button
                      onClick={() => { setShowPicker(false); router.push('/discovery'); }}
                      className="btn-secondary text-sm"
                    >
                      Go to Discovery
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredConfigs.map((config, idx) => {
                    const isSelected = selectedConfig === config
                    return (
                      <div
                        key={idx}
                        className="rounded-lg transition-all"
                        style={{
                          backgroundColor: isSelected ? 'var(--accent-bg)' : 'var(--bg-tertiary)',
                          border: isSelected ? '1px solid var(--accent)' : '1px solid var(--border-subtle)'
                        }}
                      >
                        <div
                          onClick={() => setSelectedConfig(config)}
                          className="p-4 cursor-pointer"
                        >
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4" style={STYLES.accent} />
                              <span className="font-medium" style={STYLES.textPrimary}>{config.repo}</span>
                              <span style={STYLES.textMuted}>/ {config.path}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              {isSelected && (
                                <span className="text-xs" style={STYLES.accent}>Selected</span>
                              )}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation()
                                  setPreviewConfig(config)
                                }}
                                className="p-1 rounded transition-colors hover:bg-[var(--surface-overlay)]"
                                style={STYLES.textMuted}
                                title="Preview full content"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </div>
                          </div>
                          <pre
                            className="text-xs rounded p-2 font-mono overflow-hidden max-h-20"
                            style={{ backgroundColor: 'var(--bg-primary)', color: 'var(--text-muted)' }}
                          >
                            {config.content ? config.content.substring(0, 200) + '...' : '(Content not loaded)'}
                          </pre>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 p-6 pt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => setShowPicker(false)}
                className="btn-secondary"
              >
                Cancel
              </button>
              <button
                onClick={() => selectedConfig && handleUseConfig(selectedConfig)}
                className="btn-primary"
                disabled={!selectedConfig}
              >
                Use This Config
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Full-Screen Config Preview Modal */}
      {previewConfig && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}>
          <div className="rounded-2xl p-6 w-full max-w-4xl h-[90vh] flex flex-col" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div>
                <h3 className="text-xl font-semibold flex items-center gap-2" style={STYLES.textPrimary}>
                  <FileText className="w-5 h-5" style={STYLES.accent} />
                  {previewConfig.repo}
                </h3>
                <p className="text-sm mt-1" style={STYLES.textMuted}>
                  {previewConfig.path}
                </p>
              </div>
              <button
                onClick={() => setPreviewConfig(null)}
                className="p-2 rounded-lg transition-colors hover:bg-[var(--surface-overlay)]"
                style={STYLES.textMuted}
                title="Close preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Full Content */}
            <div className="flex-1 overflow-auto">
              {previewLoading ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--accent)' }} />
                </div>
              ) : previewConfig.content ? (
                <pre
                  className="text-sm rounded-lg p-4 font-mono whitespace-pre-wrap h-full"
                  style={{
                    backgroundColor: 'var(--bg-tertiary)',
                    color: 'var(--text-secondary)',
                    border: '1px solid var(--border-subtle)'
                  }}
                >
                  {previewConfig.content}
                </pre>
              ) : (
                <div className="flex items-center justify-center h-full" style={{ color: 'var(--text-muted)' }}>
                  <p>Content unavailable for this config file.</p>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex justify-end gap-3 pt-4 mt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => setPreviewConfig(null)}
                className="btn-secondary"
              >
                Close
              </button>
              <button
                onClick={() => {
                  handleUseConfig(previewConfig)
                  setPreviewConfig(null)
                }}
                className="btn-primary"
              >
                Use This Config
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Per-Item File Preview Modal (#3052) */}
      {filePreviewItem && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}
          onClick={() => setFilePreviewItem(null)}
        >
          <div
            className="rounded-2xl p-6 w-full max-w-3xl max-h-[80vh] flex flex-col"
            style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <div className="min-w-0 flex-1">
                <h3 className="text-lg font-semibold truncate" style={STYLES.textPrimary}>
                  {filePreviewItem.name}
                </h3>
                {filePreviewItem.sourceRepo && (
                  <p className="text-xs mt-1 truncate" style={STYLES.textMuted}>
                    {filePreviewItem.sourceRepo}{filePreviewItem.sourcePath ? `/${filePreviewItem.sourcePath}` : ''}
                  </p>
                )}
              </div>
              <button
                onClick={() => setFilePreviewItem(null)}
                className="p-2 rounded-lg transition-colors hover:bg-[var(--surface-overlay)] flex-shrink-0 ml-4"
                style={STYLES.textMuted}
                title="Close preview (Esc)"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto">
              {filePreviewItem.content ? (
                <pre
                  className="text-sm rounded-lg p-4 font-mono whitespace-pre-wrap"
                  style={{
                    backgroundColor: 'var(--bg-code)',
                    color: 'var(--text-code)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  {filePreviewItem.content}
                </pre>
              ) : (
                <div className="text-center py-12">
                  <FileText className="w-12 h-12 mx-auto mb-3" style={STYLES.textMuted} />
                  <p className="font-medium mb-1" style={STYLES.textSecondary}>Content not available</p>
                  <p className="text-sm" style={STYLES.textMuted}>
                    This config&apos;s content has not been synced from discovery yet.
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end pt-4 mt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => setFilePreviewItem(null)}
                className="btn-primary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Preview Merged Config Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}>
          <div className="rounded-2xl p-6 w-full max-w-4xl h-[90vh] flex flex-col" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}>
            {/* Header */}
            <div className="flex items-center justify-between mb-4 pb-4" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
              <h3 className="text-xl font-semibold" style={STYLES.textPrimary}>
                Preview Merged Config
              </h3>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="p-2 rounded-lg transition-colors hover:bg-[var(--surface-overlay)]"
                style={STYLES.textMuted}
                title="Close preview"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Preview Content */}
            <div className="flex-1 overflow-auto">
              <div className="space-y-6">
                {/* ORG BASE CONFIG Section */}
                <div>
                  <h4 className="text-lg font-semibold mb-3 pb-2" style={{ color: 'var(--text-primary)', borderBottom: '2px solid var(--accent)' }}>
                    ORG BASE CONFIG
                  </h4>
                  {configBundle?.instructions ? (
                    <pre
                      className="text-sm rounded-lg p-4 font-mono whitespace-pre-wrap"
                      style={{
                        backgroundColor: 'var(--bg-tertiary)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border-subtle)'
                      }}
                    >
                      {configBundle.instructions.content}
                    </pre>
                  ) : (
                    <p className="text-sm italic" style={STYLES.textMuted}>
                      No org base config set
                    </p>
                  )}
                </div>

                {/* Commands Section */}
                {configBundle && configBundle.commands.length > 0 && (
                  <div>
                    <h4 className="text-lg font-semibold mb-3 pb-2" style={{ color: 'var(--text-primary)', borderBottom: '2px solid var(--accent)' }}>
                      ORG COMMANDS ({configBundle.commands.length})
                    </h4>
                    <div className="space-y-2">
                      {configBundle.commands.map((cmd, idx) => (
                        <div key={idx}>
                          <p className="text-sm font-medium mb-1" style={STYLES.accent}>
                            {cmd.name}
                          </p>
                          <pre
                            className="text-xs rounded p-3 font-mono whitespace-pre-wrap"
                            style={{
                              backgroundColor: 'var(--bg-tertiary)',
                              color: 'var(--text-secondary)',
                              border: '1px solid var(--border-subtle)'
                            }}
                          >
                            {cmd.content}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Settings Section */}
                {configBundle?.settings && (
                  <div>
                    <h4 className="text-lg font-semibold mb-3 pb-2" style={{ color: 'var(--text-primary)', borderBottom: '2px solid var(--accent)' }}>
                      SETTINGS
                    </h4>
                    <pre
                      className="text-sm rounded-lg p-4 font-mono whitespace-pre-wrap"
                      style={{
                        backgroundColor: 'var(--bg-tertiary)',
                        color: 'var(--text-secondary)',
                        border: '1px solid var(--border-subtle)'
                      }}
                    >
                      {configBundle.settings.content}
                    </pre>
                  </div>
                )}

                {/* Hooks Section */}
                {configBundle && configBundle.hooks.length > 0 && (
                  <div>
                    <h4 className="text-lg font-semibold mb-3 pb-2" style={{ color: 'var(--text-primary)', borderBottom: '2px solid var(--accent)' }}>
                      HOOKS ({configBundle.hooks.length})
                    </h4>
                    <div className="space-y-2">
                      {configBundle.hooks.map((hook, idx) => (
                        <div key={idx}>
                          <p className="text-sm font-medium mb-1" style={STYLES.accent}>
                            {hook.name}
                          </p>
                          <pre
                            className="text-xs rounded p-3 font-mono whitespace-pre-wrap"
                            style={{
                              backgroundColor: 'var(--bg-tertiary)',
                              color: 'var(--text-secondary)',
                              border: '1px solid var(--border-subtle)'
                            }}
                          >
                            {hook.content}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Subagents Section */}
                {configBundle && configBundle.subagents.length > 0 && (
                  <div>
                    <h4 className="text-lg font-semibold mb-3 pb-2" style={{ color: 'var(--text-primary)', borderBottom: '2px solid var(--accent)' }}>
                      SUBAGENTS ({configBundle.subagents.length})
                    </h4>
                    <div className="space-y-2">
                      {configBundle.subagents.map((agent, idx) => (
                        <div key={idx}>
                          <p className="text-sm font-medium mb-1" style={STYLES.accent}>
                            {agent.name}
                          </p>
                          <pre
                            className="text-xs rounded p-3 font-mono whitespace-pre-wrap"
                            style={{
                              backgroundColor: 'var(--bg-tertiary)',
                              color: 'var(--text-secondary)',
                              border: '1px solid var(--border-subtle)'
                            }}
                          >
                            {agent.content}
                          </pre>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 pt-4 mt-4" style={{ borderTop: '1px solid var(--border-subtle)' }}>
              <button
                onClick={() => setShowPreviewModal(false)}
                className="btn-primary"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Clear All Confirmation Modal */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ backgroundColor: 'rgba(0, 0, 0, 0.8)' }}>
          <div className="rounded-xl p-6 max-w-md w-full" style={{ backgroundColor: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-lg" style={{ backgroundColor: 'var(--status-danger-light)' }}>
                <AlertCircle className="w-6 h-6" style={{ color: 'var(--status-danger)' }} />
              </div>
              <h3 className="text-lg font-semibold" style={STYLES.textPrimary}>Clear All Approved Config?</h3>
            </div>
            <p className="mb-6" style={STYLES.textSecondary}>
              This will permanently delete the approved configuration bundle for this workspace.
              Developers will no longer be able to sync this config until you approve a new one.
            </p>
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowClearConfirm(false)}
                className="btn-secondary"
                disabled={isRemoving}
              >
                Cancel
              </button>
              <button
                onClick={handleClearAll}
                className="px-4 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
                style={{ backgroundColor: 'var(--status-danger)', color: 'var(--text-on-accent)' }}
                disabled={isRemoving}
              >
                {isRemoving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                Clear All
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
    </div>
  )
}

export default ApprovedConfig
