import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const structuredLogsViewSource = readFileSync(
  join(__dirname, 'StructuredLogsView.tsx'),
  'utf8',
)

const dashboardPageSource = readFileSync(
  join(__dirname, '../../app/(dashboard)/dashboard/page.tsx'),
  'utf8',
)

const backgroundAgentsPageSource = readFileSync(
  join(__dirname, 'BackgroundAgentsPage.tsx'),
  'utf8',
)

describe('dashboard/session runtime guard contracts', () => {
  it('keeps live-session-status gating so resumed sessions can accept input again (#2294)', () => {
    expect(structuredLogsViewSource).toContain('const sessionStatusRef = ref(sessionDatabase, `sessions/${sessionId}/metadata/status`)')
    expect(structuredLogsViewSource).toContain('setLiveSessionStatus(status)')
    expect(structuredLogsViewSource).toContain("if (liveSessionStatus === 'TERMINATED' || liveSessionStatus === 'FAILED')")
    expect(structuredLogsViewSource).toContain('/api/sessions/${sessionId}/resume')
    expect(structuredLogsViewSource).toContain('/api/sessions/${sessionId}/input')
  })

  it('keeps DOM-reconciliation error boundary retry protection around dashboard rendering (#2643, #2675, #2677)', () => {
    expect(dashboardPageSource).toContain('class DashboardErrorBoundary extends Component<')
    expect(dashboardPageSource).toContain("error.name === 'NotFoundError'")
    expect(dashboardPageSource).toContain("error.message.includes('insertBefore')")
    expect(dashboardPageSource).toContain("error.message.includes('removeChild')")
    expect(dashboardPageSource).toContain("error.message.includes('appendChild')")
    expect(dashboardPageSource).toContain('if (this.state.hasError && this.state.retryCount < 3)')
    expect(dashboardPageSource).toContain('<DashboardErrorBoundary>')
  })

  it('keeps sessions UI stabilization guards for list loading, polling, and terminal retries (#1925)', () => {
    expect(backgroundAgentsPageSource).toContain('SessionListSkeleton')
    expect(backgroundAgentsPageSource).toContain('AUTO_REFRESH_INTERVAL_MS = 15_000')
    expect(backgroundAgentsPageSource).toContain('<TerminalErrorBoundary sessionId={selectedSession.id} onRetry={() => fetchSelectedSession(selectedSession.id)}>')
    expect(backgroundAgentsPageSource).toContain('setCreateError(error instanceof Error ? error.message : \'Failed to create session\')')
  })
})
