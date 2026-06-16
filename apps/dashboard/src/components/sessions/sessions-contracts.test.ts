import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const backgroundAgentsPageSource = readFileSync(
  join(__dirname, 'BackgroundAgentsPage.tsx'),
  'utf8',
)

const sessionListSource = readFileSync(
  join(__dirname, 'SessionList.tsx'),
  'utf8',
)

const newSessionModalSource = readFileSync(
  join(__dirname, 'NewSessionModal.tsx'),
  'utf8',
)

const configSource = readFileSync(
  join(__dirname, '../../lib/config.ts'),
  'utf8',
)

const sessionsPageSource = readFileSync(
  join(__dirname, '../../app/(dashboard)/sessions/page.tsx'),
  'utf8',
)

const structuredLogsViewSource = readFileSync(
  join(__dirname, 'StructuredLogsView.tsx'),
  'utf8',
)

const backgroundAgentsHelpersSource = readFileSync(
  join(__dirname, 'background-agents-page-helpers.ts'),
  'utf8',
)

describe('sessions surface regression contracts', () => {
  it('keeps GitHub workflow link wiring on session status badges (#781)', () => {
    expect(configSource).toContain("backgroundAgentGitHubRepo: process.env.NEXT_PUBLIC_BACKGROUND_AGENT_GITHUB_REPO ?? ''")
    expect(backgroundAgentsPageSource).toContain("workflowRunId && dashboardConfig.backgroundAgentGitHubRepo ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''")
    expect(backgroundAgentsPageSource).toContain("title={workflowRunId && dashboardConfig.backgroundAgentGitHubRepo ? 'View GitHub Actions workflow' : undefined}")
    expect(backgroundAgentsPageSource).toContain('https://github.com/${dashboardConfig.backgroundAgentGitHubRepo}/actions/runs/${workflowRunId}')
    expect(sessionListSource).toContain("title={workflowRunId && dashboardConfig.backgroundAgentGitHubRepo ? 'View GitHub Actions workflow' : undefined}")
  })

  it('keeps session output download action and file export utility in list rows (#782)', () => {
    expect(sessionListSource).toContain('async function downloadSessionOutput(sessionId: string, sessionName?: string): Promise<void>')
    // Download filename is now emitted via triggerBlobDownload helper (#6566)
    expect(sessionListSource).toContain('`session-${sessionName || sessionId.slice(0, 8)}-output.txt`')
    expect(sessionListSource).toContain('const [downloading, setDownloading] = useState(false)')
    expect(sessionListSource).toContain('await downloadSessionOutput(session.id, session.name)')
  })

  it('keeps surfaced session-creation errors and absolute API session endpoints (#1529, #1442)', () => {
    expect(backgroundAgentsPageSource).toContain('const [createError, setCreateError] = useState<string | null>(null)')
    expect(backgroundAgentsPageSource).toContain('Failed to create session:')
    expect(backgroundAgentsPageSource).toContain('{createError && (')
    expect(backgroundAgentsPageSource).toContain("import { getUserFriendlyError, isNetworkError } from '@/lib/errors'")
    expect(backgroundAgentsPageSource).toContain("function logBackgroundSessionFetchError(message: string, error: unknown): void")
    expect(backgroundAgentsPageSource).toContain("setSessionError(getUserFriendlyError(err, 'Failed to load session.'))")
    expect(backgroundAgentsPageSource).toContain("error: getUserFriendlyError(error, 'Failed to load sessions.'),")
    expect(backgroundAgentsPageSource).toContain('api.fetchWithAuth(`${api.baseUrl}/api/sessions`, {')
    expect(backgroundAgentsPageSource).toContain('api.fetchWithAuth(`${api.baseUrl}/api/sessions/${sessionId}`)')
  })

  it('keeps polling refresh cadence, queue tab visibility, and branch selector UX contracts (#2159, #1923, #1679, #1913)', () => {
    expect(backgroundAgentsPageSource).toContain('Auto-refresh sessions list every 15 seconds (#2159)')
    expect(backgroundAgentsPageSource).toContain('AUTO_REFRESH_INTERVAL_MS = 15_000')
    expect(backgroundAgentsPageSource).toContain("const defaultBranch = branches.find(b => b.name === 'main') ||")
    expect(backgroundAgentsPageSource).toContain("branches.find(b => b.name === 'master') ||")
    expect(backgroundAgentsPageSource).toContain('const [branchSearchQuery, setBranchSearchQuery] = useState(\'\')')
    expect(backgroundAgentsPageSource).toContain('const filteredBranches = useMemo(() => {')
    expect(sessionsPageSource).toContain('{activeTab === \'queue\' && (')
    expect(sessionsPageSource).toContain('<QueueTabContent />')
  })

  it('keeps new-session auto-switch to Active tab and preserves creation progress feedback (#1645, #1914)', () => {
    expect(backgroundAgentsPageSource).toContain('Auto-switch to Active tab when new session is created')
    expect(backgroundAgentsPageSource).toContain("setActiveTab('active')")
    expect(backgroundAgentsPageSource).toContain('setCreatingSession(true)')
    expect(backgroundAgentsPageSource).toContain("disabled={!chatInput.trim() || creatingSession")
    expect(backgroundAgentsPageSource).toContain("creatingSession ? (")
    expect(backgroundAgentsPageSource).toContain('Loader2 className="w-5 h-5 animate-spin"')
  })

  it('keeps explicit initial-task capture for new background sessions and falls back to the session name for legacy callers (#15m-cancel-regression)', () => {
    expect(newSessionModalSource).toContain("const [initialPrompt, setInitialPrompt] = useState('')")
    expect(newSessionModalSource).toContain("setError('Initial task is required')")
    expect(newSessionModalSource).toContain('Task *')
    expect(newSessionModalSource).toContain('agents-kali-runc')
    expect(newSessionModalSource).toContain('requires security/admin role')
    expect(backgroundAgentsPageSource).toContain("const effectiveInitialPrompt = initialCommand?.trim() || trimmedName")
    expect(backgroundAgentsPageSource).toContain('initialPrompt: effectiveInitialPrompt')
  })

  it('keeps actionable auth-state guidance on credential expiry/absence before command execution (#1918, #1912)', () => {
    expect(backgroundAgentsPageSource).toContain("if (errorData.code === 'CREDENTIALS_NOT_CONFIGURED' || errorData.code === 'CREDENTIALS_EXPIRED' || errorData.code === 'CREDENTIALS_REQUIRED')")
    expect(backgroundAgentsPageSource).toContain('gal auth ${provider} --api-key <key>')
    expect(backgroundAgentsPageSource).toContain('Select an organization workspace to access approved commands.')
    expect(backgroundAgentsPageSource).toContain('No approved commands configured. Add commands in the Approved Config page.')
  })

  it('keeps session-card title truncation to prevent badge overlap in dense rows (#1926)', () => {
    expect(sessionListSource).toContain('className="text-sm font-medium truncate min-w-0 flex-1"')
    expect(sessionListSource).toContain('<SessionStatusBadge status={session.status} workflowRunId={session.workflowRunId} />')
  })

  it('keeps user-visible command-expansion and preflight warnings in session surfaces (#4765)', () => {
    expect(backgroundAgentsPageSource).toContain('function SessionMetadataWarningBanner')
    expect(backgroundAgentsPageSource).toContain('getSessionMetadataWarning(session.metadata)')
    expect(backgroundAgentsHelpersSource).toContain('Command expansion failed')
    expect(backgroundAgentsHelpersSource).toContain('dispatchReadiness')
    expect(structuredLogsViewSource).toContain('commandExpansionMeta')
    expect(structuredLogsViewSource).toContain('[GAL] Command expansion failed')
    expect(structuredLogsViewSource).toContain('preflightWarning')
  })
})
