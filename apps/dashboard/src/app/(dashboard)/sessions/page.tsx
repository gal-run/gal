'use client'

/**
 * Sessions Page (Issue #658)
 *
 * Unified Sessions page that merges the Background Agents and AI Session
 * (Interactive) pages into a single view with tab-based filtering.
 *
 * Tabs:
 *   - All:         Shows both background and interactive sessions
 *   - Background:  Background agent sessions (terminal output, GitHub Actions)
 *   - Interactive: Interactive chat/workflow sessions
 *   - Queue:       Work-item queue health (pending/active/completed counts)
 *   - Observability: Supervisor/worker metrics and orchestration health
 *
 * Migrated from apps/dashboard/src/pages/Sessions.tsx to Next.js App Router.
 *
 * #6513: Route-level feature flag guard to prevent direct URL access bypass.
 */

import { useState } from 'react'
import { Terminal, MessageSquare, Layers, ListChecks, Activity, Key, Network } from 'lucide-react'
import BackgroundAgentsPage from '@/components/sessions/BackgroundAgentsPage'
import InteractiveSessionPage from '@/components/sessions/InteractiveSessionPage'
import { QueueTabContent } from '@/components/sessions/QueueTabContent'
import { SupervisorWorkerPanel } from '@/components/sessions/SupervisorWorkerPanel'
import { DependencyCredentialsPanel } from '@/components/sessions/DependencyCredentialsPanel'
import { SwarmSessionsPage } from '@/components/sessions/SwarmSessionsPage'
import { FeatureGate } from '@/components/FeatureGate'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { isDemoMode } from '@/lib/demo-guard'

type SessionsTab = 'all' | 'background' | 'interactive' | 'queue' | 'observability' | 'credentials' | 'swarm'

interface TabConfig {
  id: SessionsTab
  label: string
  icon: typeof Terminal
  description: string
}

const TABS: TabConfig[] = [
  {
    id: 'all',
    label: 'All',
    icon: Layers,
    description: 'All sessions',
  },
  {
    id: 'background',
    label: 'Background',
    icon: Terminal,
    description: 'Background agent sessions running in GitHub Actions',
  },
  {
    id: 'interactive',
    label: 'Interactive',
    icon: MessageSquare,
    description: 'Interactive chat sessions for triggering workflows',
  },
  {
    id: 'queue',
    label: 'Queue',
    icon: ListChecks,
    description: 'Work-item queue health and operator view',
  },
  {
    id: 'observability',
    label: 'Observability',
    icon: Activity,
    description: 'Supervisor/worker metrics and orchestration health',
  },
  {
    id: 'credentials',
    label: 'Credentials',
    icon: Key,
    description: 'Dependency credentials for background agents',
  },
  {
    id: 'swarm',
    label: 'Swarm',
    icon: Network,
    description: 'GPU swarm run sessions',
  },
]

function SessionsPage() {
  const [activeTab, setActiveTab] = useState<SessionsTab>('background')
  const { user, isLoading } = useAuth()
  const { isPageVisibleForUser, loading: flagsLoading } = useFeatureFlags()
  const selectedWorkspace = useSelectedWorkspace()
  const userOrgs = user?.organizations ?? []

  // #6513: Wait for auth and feature flags to resolve before checking access
  // This prevents race conditions where auth hasn't resolved yet
  if (isLoading || flagsLoading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-6 h-6 border-2 border-current border-t-transparent rounded-full" />
      </div>
    )
  }

  // #6513: Require authentication before checking feature flags
  // If user is null after loading completes, TermsGate will redirect to login
  // This is a defense-in-depth check to ensure we don't show content to unauthenticated users
  // In demo mode, bypass authentication requirement
  if (!user && !isDemoMode()) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <div className="animate-spin w-6 h-6 border-2 border-current border-t-transparent rounded-full" />
      </div>
    )
  }

  // #6513: Route-level feature flag guard — prevent direct URL access
  if (!isPageVisibleForUser('background-agents', userOrgs, selectedWorkspace)) {
    return <FeatureGate pageId="background-agents" />
  }

  return (
    <div className="flex flex-col h-full">
      {/* Tab Bar */}
      <div
        className="flex items-center px-4 border-b flex-shrink-0"
        style={{ borderColor: 'var(--border-subtle)', backgroundColor: 'var(--bg-primary)' }}
      >
        {TABS.map((tab) => {
          const Icon = tab.icon
          const isActive = activeTab === tab.id
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className="flex items-center gap-2 px-4 py-3 text-sm font-medium transition-all duration-200 relative hover:bg-[var(--surface-sunken)]"
              style={{
                color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
              }}
              title={tab.description}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
              {isActive && (
                <div
                  className="absolute bottom-0 left-0 right-0 h-0.5 bg-[var(--interactive-primary)] dark:bg-[var(--text-tertiary)]"
                />
              )}
            </button>
          )
        })}
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {/* Background tab (and "All" - shows background sessions with full UI) */}
        {(activeTab === 'background' || activeTab === 'all') && (
          <div className="h-full">
            <BackgroundAgentsPage />
          </div>
        )}

        {/* Interactive tab */}
        {activeTab === 'interactive' && (
          <div className="h-full overflow-auto">
            <InteractiveSessionPage />
          </div>
        )}

        {/* Queue tab */}
        {activeTab === 'queue' && (
          <div className="h-full overflow-auto">
            <QueueTabContent />
          </div>
        )}

        {/* Observability tab */}
        {activeTab === 'observability' && (
          <div className="h-full overflow-auto p-6">
            <SupervisorWorkerPanel />
          </div>
        )}

        {/* Credentials tab */}
        {activeTab === 'credentials' && (
          <div className="h-full overflow-auto p-6">
            <DependencyCredentialsPanel />
          </div>
        )}

        {/* Swarm tab */}
        {activeTab === 'swarm' && (
          <div className="h-full overflow-auto">
            <SwarmSessionsPage />
          </div>
        )}
      </div>
    </div>
  )
}

export default SessionsPage
