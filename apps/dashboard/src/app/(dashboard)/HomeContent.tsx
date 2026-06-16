'use client'

import { ArrowRight, Terminal, BarChart3, Check, Loader2 } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useState, useEffect } from 'react'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { useAuth } from '@/contexts/AuthContext'
import { useIsOnboardingComplete } from '@/hooks/useIsOnboardingComplete'
import { VSCODE_INSTALL_GUIDE_PATH } from '@/lib/config'
import { api } from '@/lib/api'
import type { PersonalGitHubStatus } from '@gal/types'
import { isDemoMode } from '@/lib/demo-guard'
import { loadHomeGitHubBootstrap } from '@/lib/dashboard-startup'

// Brand logos as SVG components
const GitHubLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
    <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
  </svg>
)

const VSCodeLogo = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor" style={{ color: 'var(--brand-vscode)' }}>
    <path d="M17.583 2.603l-4.016 3.897L7.632 2.093 2.459 4.81v14.38l5.173 2.717 5.935-4.507 4.016 3.897 4.958-2.503V5.106l-4.958-2.503zM7.632 15.29V8.71L12.2 12l-4.568 3.29zm9.951.968l-3.742-2.882V10.624l3.742-2.882v8.516z"/>
  </svg>
)

/**
 * Home Page - Premium dashboard landing
 *
 * Visually rich landing page inspired by Linear/Vercel dashboards:
 * - Hero section with impactful heading and subtitle
 * - Feature cards with hover effects and status indicators
 * - Secondary section for CLI and plan upgrade
 */
export default function HomeContent() {
  const router = useRouter()
  const { isPageVisibleForUser } = useFeatureFlags()
  const { user } = useAuth()
  const { isOnboardingComplete } = useIsOnboardingComplete()

  // GitHub connection status
  const [githubStatus, setGithubStatus] = useState<PersonalGitHubStatus>({ connected: false, username: undefined })
  const [githubLoading, setGithubLoading] = useState(true)
  // Track whether GitHub App has installations (live API = primary source)
  const [hasInstallations, setHasInstallations] = useState(false)

  // Check if billing page is visible (internal feature flag) - Fix for #1227, #1274
  // Uses shared useIsOnboardingComplete hook to ensure consistency with sidebar navigation.
  const userOrgs = user?.organizations || []
  const showBillingUpgrade = isPageVisibleForUser('billing', userOrgs) && isOnboardingComplete

  // #1620: Use live GitHub API (hasInstallations) as primary source of truth
  // Firestore orgs may be empty on fresh dev; live API is always current
  const showConnectedStatus = hasInstallations || githubStatus.connected

  // Fetch GitHub connection status on mount
  useEffect(() => {
    const fetchGitHubStatus = async () => {
      if (isDemoMode()) {
        setGithubStatus({ connected: true, username: 'sarah-chen' })
        setHasInstallations(true)
        setGithubLoading(false)
        return
      }
      setGithubLoading(true)
      try {
        const bootstrap = await loadHomeGitHubBootstrap({
          getPersonalGitHubStatus: () => api.getPersonalGitHubStatus(),
          getGitHubAppStatus: () => api.getGitHubAppStatus(),
        })
        setGithubStatus(bootstrap.githubStatus)
        setHasInstallations(bootstrap.hasInstallations)
      } catch (err) {
        console.error('Failed to fetch GitHub status:', err)
      } finally {
        setGithubLoading(false)
      }
    }
    fetchGitHubStatus()
  }, [])

  return (
    <div className="min-h-full p-6 md:p-8 lg:p-12 relative" data-testid="home-page">
      <div className="max-w-4xl mx-auto relative">

        {/* Hero Section */}
        <div className="mb-12 animate-fade-in-up">
          <div className="section-badge mb-4">
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: 'var(--text-tertiary)' }} />
            Getting started
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight text-[var(--text-primary)] mb-3">
            Welcome to GAL
          </h1>
          <p className="text-lg text-[var(--text-secondary)] max-w-xl leading-relaxed">
            Set up your governance layer in minutes. Connect your tools, sync your configs, and ship with confidence.
          </p>
        </div>

        {/* Primary Feature Cards - 2 column grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-12 animate-fade-in-up animate-delay-2">

          {/* Install in IDE Card */}
          <div className="feature-card group p-7">
            <div className="flex items-start justify-between mb-4">
              <div className="icon-container green bg-[var(--surface-sunken)]">
                <VSCodeLogo />
              </div>
            </div>

            <h2 className="font-semibold text-[var(--text-primary)] mb-1">
              Install GAL in your IDE
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-5">
              Get the extension for VS Code, Cursor, Windsurf, or VSCodium.
            </p>

            <a
              href={VSCODE_INSTALL_GUIDE_PATH}
              className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors duration-150"
              style={{ color: 'var(--interactive-primary)' }}
              onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--interactive-primary-hover)' }}
              onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--interactive-primary)' }}
            >
              Install extension
              <ArrowRight className="w-3.5 h-3.5" />
            </a>
          </div>

          {/* Connect GitHub Card */}
          <div className="feature-card group p-7" data-testid="github-connection">
            <div className="flex items-start justify-between mb-4">
              <div className="icon-container green bg-[var(--surface-sunken)]">
                <GitHubLogo />
              </div>

              {/* Status badge - shown when connected */}
              {!githubLoading && showConnectedStatus && (
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium"
                  style={{ backgroundColor: 'var(--status-success-light)', color: 'var(--status-success-text)' }}
                >
                  <span
                    className="rounded-full"
                    style={{ width: '8px', height: '8px', backgroundColor: 'var(--status-success)' }}
                  />
                  Connected
                </span>
              )}
            </div>

            <h2 className="font-semibold text-[var(--text-primary)] mb-1">
              Connect your repositories
            </h2>
            <p className="text-sm text-[var(--text-secondary)] mb-5">
              Link GitHub to discover configs, enforce policies, and sync across your org.
            </p>

            {githubLoading ? (
              // Loading state
              <div className="flex items-center gap-2" data-testid="github-status">
                <Loader2 className="w-4 h-4 animate-spin text-[var(--text-muted)]" />
                <span className="text-sm text-[var(--text-secondary)]">Checking connection...</span>
              </div>
            ) : showConnectedStatus ? (
              // Connected state - Bug #1272: Only show when BOTH OAuth connected AND workspaces exist
              <div data-testid="github-status">
                <div className="flex items-center gap-2 mb-4">
                  <div
                    className="w-8 h-8 rounded-lg flex items-center justify-center"
                    style={{ backgroundColor: 'var(--status-success-light)' }}
                  >
                    <Check className="w-4 h-4" style={{ color: 'var(--status-success)' }} />
                  </div>
                  <div>
                    <div className="text-sm font-medium text-[var(--text-primary)]">@{githubStatus.username}</div>
                  </div>
                </div>
                <button
                  onClick={() => router.push('/settings?tab=github')}
                  className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors duration-150"
                  style={{ color: 'var(--interactive-primary)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--interactive-primary-hover)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--interactive-primary)' }}
                >
                  Manage connection
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              // Not connected state - Bug #1272: Show when no workspaces (even if OAuth connected)
              <div data-testid="github-status">
                <a
                  href={`https://github.com/apps/${process.env['NEXT_PUBLIC_GITHUB_APP_SLUG'] || 'gal-governance-agentic-layer'}/installations/new`}
                  className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors duration-150"
                  style={{ color: 'var(--interactive-primary)' }}
                  onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--interactive-primary-hover)' }}
                  onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--interactive-primary)' }}
                >
                  Connect GitHub
                  <ArrowRight className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>
        </div>

        {/* Secondary Section */}
        <div className="mb-12 animate-fade-in-up animate-delay-3">
          <p className="section-badge mb-4 flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-[var(--accent-neon)]" />
            Next steps
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Install CLI Card */}
            <div className="feature-card group p-7">
              <div className="flex items-start gap-4">
                <div className="icon-container green flex-shrink-0 bg-[var(--surface-sunken)]">
                  <Terminal className="w-5 h-5" style={{ color: 'var(--interactive-primary)' }} />
                </div>
                <div className="min-w-0">
                  <h3 className="font-semibold text-[var(--text-primary)] mb-1">
                    Install the GAL CLI
                  </h3>
                  <p className="text-sm text-[var(--text-secondary)] mb-3">
                    Sync configurations to your local machine
                  </p>
                  <button
                    onClick={() => router.push('/get-started')}
                    className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors duration-150"
                    style={{ color: 'var(--interactive-primary)' }}
                    onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--interactive-primary-hover)' }}
                    onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--interactive-primary)' }}
                  >
                    Get started
                    <ArrowRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            {/* Upgrade plan Card - only visible when billing page is enabled (internal feature flag) */}
            {showBillingUpgrade && (
              <div className="feature-card group p-7">
                <div className="flex items-start gap-4">
                  <div className="icon-container green flex-shrink-0 bg-[var(--surface-sunken)]">
                    <BarChart3 className="w-5 h-5" style={{ color: 'var(--interactive-primary)' }} />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold text-[var(--text-primary)] mb-1">
                      Upgrade your plan
                    </h3>
                    <p className="text-sm text-[var(--text-secondary)] mb-3">
                      Get enforcement, automation, and enterprise features
                    </p>
                    <button
                      onClick={() => router.push('/billing')}
                      className="inline-flex items-center gap-1.5 text-sm font-medium transition-colors duration-150"
                      style={{ color: 'var(--interactive-primary)' }}
                      onMouseEnter={(e) => { e.currentTarget.style.color = 'var(--interactive-primary-hover)' }}
                      onMouseLeave={(e) => { e.currentTarget.style.color = 'var(--interactive-primary)' }}
                    >
                      Compare plans
                      <ArrowRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  )
}
