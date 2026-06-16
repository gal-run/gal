'use client'

import { Suspense } from 'react'
import { useEffect, useState } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { Loader2, AlertTriangle, ArrowRight, CheckCircle } from 'lucide-react'

type SetupState = 'loading' | 'success' | 'cancelled' | 'error'

/**
 * GitHub App Setup Callback Page
 *
 * Handles the redirect from GitHub after installing the GAL GitHub App.
 * GitHub sends users to /github/setup with:
 * - installation_id: The GitHub App installation ID
 * - setup_action: 'install' or 'cancel'
 *
 * Note: The actual organization sync is handled by GitHub webhooks.
 * This page shows a brief loading state and redirects to settings (with auto-sync).
 *
 * @see https://github.com/Scheduler-Systems/gal/issues/488
 */
function GitHubSetupContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const [state, setState] = useState<SetupState>('loading')

  const installationId = searchParams.get('installation_id')
  const setupAction = searchParams.get('setup_action')

  useEffect(() => {
    // Handle cancel action - user cancelled GitHub App installation
    if (setupAction === 'cancel') {
      // Use setTimeout to avoid sync setState in effect (react-hooks/set-state-in-effect)
      const stateTimer = setTimeout(() => setState('cancelled'), 0)
      const rawCancelState = searchParams.get('state')
      const cancelRedirect = rawCancelState && rawCancelState.startsWith('/') && !rawCancelState.startsWith('//') && !rawCancelState.includes('://')
        ? rawCancelState
        : '/settings?tab=github'
      const timer = setTimeout(() => {
        router.push(cancelRedirect)
      }, 1500)
      return () => {
        clearTimeout(stateTimer)
        clearTimeout(timer)
      }
    }

    // Handle missing params - redirect to settings immediately
    if (!installationId && !setupAction) {
      router.push('/settings?tab=github')
      return
    }

    // For successful installation:
    // 1. Show loading state for 500ms (so tests can verify it)
    // 2. Transition to success state
    // 3. Redirect to settings after 2s total
    const loadingTimer = setTimeout(() => {
      setState('success')
    }, 500)

    const redirectTimer = setTimeout(() => {
      const rawState = searchParams.get('state')
      const redirectPath = rawState && rawState.startsWith('/') && !rawState.startsWith('//') && !rawState.includes('://')
        ? rawState
        : '/settings?tab=github&sync=1'
      router.push(redirectPath)
    }, 2500)

    return () => {
      clearTimeout(loadingTimer)
      clearTimeout(redirectTimer)
    }
  }, [installationId, setupAction, router, searchParams])

  // Loading state
  if (state === 'loading') {
    return (
      <div
        className="min-h-screen bg-surface-base flex items-center justify-center p-4"
        data-testid="github-setup"
      >
        <div className="max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--accent-bg)] mb-6">
            <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Connecting GitHub</h1>
          <p className="text-[var(--text-secondary)]">Please wait...</p>
        </div>
      </div>
    )
  }

  // Cancelled state
  if (state === 'cancelled') {
    return (
      <div
        className="min-h-screen bg-surface-base flex items-center justify-center p-4"
        data-testid="github-setup"
      >
        <div className="max-w-md w-full text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--status-warning-light)] mb-6">
            <AlertTriangle className="w-8 h-8 text-[var(--status-warning)]" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">Installation Cancelled</h1>
          <p className="text-[var(--text-secondary)] mb-4">Redirecting to settings...</p>
          <button
            onClick={() => router.push('/settings?tab=github')}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] px-6 py-3 font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
          >
            <ArrowRight className="w-4 h-4" />
            Go to Settings
          </button>
        </div>
      </div>
    )
  }

  // Success state
  return (
    <div
      className="min-h-screen bg-surface-base flex items-center justify-center p-4"
      data-testid="github-setup"
    >
      <div className="max-w-md w-full text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--status-success-light)] mb-6">
          <CheckCircle className="w-8 h-8 text-[var(--status-success)]" />
        </div>
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">GitHub App Installed!</h1>
        <p className="text-[var(--text-secondary)] mb-4">Redirecting to settings...</p>
        <div className="flex items-center justify-center gap-2 text-[var(--accent)]">
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Loading organization data...</span>
        </div>
      </div>
    </div>
  )
}

export default function GitHubSetup() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-surface-base flex items-center justify-center p-4">
          <div className="max-w-md w-full text-center">
            <Loader2 className="w-8 h-8 text-[var(--accent)] animate-spin mx-auto mb-4" />
            <p className="text-[var(--text-secondary)]">Loading...</p>
          </div>
        </div>
      }
    >
      <GitHubSetupContent />
    </Suspense>
  )
}
