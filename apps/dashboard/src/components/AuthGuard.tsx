'use client'

/**
 * AuthGuard — client-side authentication gate with proper state resolution (#6513)
 *
 * This component ensures:
 * 1. Auth state is definitively resolved before rendering protected content
 * 2. Expired/invalid sessions are treated as logged out
 * 3. Feature flags are only checked after auth is confirmed
 * 4. Demo mode bypasses all auth checks
 *
 * State machine:
 * - LOADING: Auth check in progress → show spinner
 * - NOT_CONFIGURED: Auth system not set up → show error message
 * - AUTHENTICATED: Valid user session → render children
 * - UNAUTHENTICATED: No valid session → redirect to login
 * - DEMO_MODE: Demo mode enabled → bypass all checks
 */

import { useEffect, useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { Loader2, AlertCircle } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { isDemoMode } from '@/lib/demo-guard'

type AuthState = 'LOADING' | 'NOT_CONFIGURED' | 'AUTHENTICATED' | 'UNAUTHENTICATED' | 'DEMO_MODE'

interface AuthGuardProps {
  children: React.ReactNode
  /** If true, skip the auth check (used for nested routes that have their own guard) */
  skip?: boolean
}

export function AuthGuard({ children, skip }: AuthGuardProps) {
  const { user, isLoading, isConfigured, authError } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const [hasRedirected, setHasRedirected] = useState(false)

  // Derive auth state
  const authState: AuthState = (() => {
    if (skip) return 'AUTHENTICATED'
    if (isDemoMode()) return 'DEMO_MODE'
    if (isLoading) return 'LOADING'
    if (!isConfigured || authError === 'not-configured') return 'NOT_CONFIGURED'
    if (user) return 'AUTHENTICATED'
    return 'UNAUTHENTICATED'
  })()

  // Redirect to login when unauthenticated (only once)
  useEffect(() => {
    if (authState === 'UNAUTHENTICATED' && !hasRedirected) {
      setHasRedirected(true)
      const loginUrl = new URL('/login', window.location.origin)
      loginUrl.searchParams.set('redirect', pathname)
      router.replace(loginUrl.toString())
    }
  }, [authState, hasRedirected, router, pathname])

  // Loading state
  if (authState === 'LOADING') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: 'var(--surface-base)' }}>
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: 'var(--text-muted)' }} />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Verifying session...
        </p>
      </div>
    )
  }

  // Not configured state
  if (authState === 'NOT_CONFIGURED') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6" style={{ background: 'var(--surface-base)' }}>
        <AlertCircle className="w-12 h-12" style={{ color: 'var(--status-warning)' }} />
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          Authentication Not Configured
        </h1>
        <p className="text-sm text-center max-w-md" style={{ color: 'var(--text-secondary)' }}>
          This application has not been set up for authentication. Please contact your administrator or check your configuration.
        </p>
      </div>
    )
  }

  // Unauthenticated state (redirecting)
  if (authState === 'UNAUTHENTICATED') {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4" style={{ background: 'var(--surface-base)' }}>
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--text-muted)' }} />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          Redirecting to login...
        </p>
      </div>
    )
  }

  // Demo mode or authenticated → render children
  return <>{children}</>
}
