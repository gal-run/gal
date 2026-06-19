'use client'

import { useState, useEffect, useRef } from 'react'
import { AlertCircle, Mail, Loader2 } from 'lucide-react'
import { useSearchParams } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import GitHubAuthButton from '@/components/auth/GitHubAuthButton'
import GoogleAuthButton from '@/components/auth/GoogleAuthButton'
import EmailAuthForm from '@/components/auth/EmailAuthForm'
import { authApi } from '@/lib/auth-api'
import { BRANDING } from '@/lib/branding'
import { GAL_TERMS_URL, GAL_PRIVACY_URL } from '@gal/types'
import { LoginRedirectState } from './login-redirect-state'

export default function LoginPage() {
  const { user, isLoading, isConfigured, isGoogleConfigured, checkAuth, authError } = useAuth()
  const autoRetryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const { isFeatureEnabled } = useFeatureFlags()
  const searchParams = useSearchParams()

  // Feature flag checks for auth options (Issue #1036)
  // In production: only GitHub visible (flags return false)
  // In dev: all options visible (flags return true)
  const showGoogleAuth = isFeatureEnabled('auth.google') && isGoogleConfigured
  const showEmailAuth = isFeatureEnabled('auth.email')

  // Auth mode state: 'social' (GitHub/Google) or 'email'
  const [authMode, setAuthMode] = useState<'social' | 'email'>('social')
  const [emailError, setEmailError] = useState<string | null>(null)

  // Get the intended destination from query params (sanitized to prevent open redirects / invalid paths)
  const rawRedirect = searchParams.get('redirect') || '/'
  const redirectPath = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') && !rawRedirect.includes('://') && !rawRedirect.startsWith('/auth/') && !rawRedirect.startsWith('/api/')
    ? rawRedirect
    : '/'
  const forceSelect = searchParams.get('force_select') === 'true'

  // Get error from query params (set by auth callback on failure)
  const error = searchParams.get('error')

  // Auto-retry when API is unreachable (every 10s)
  useEffect(() => {
    if (authError === 'unreachable' && !isLoading) {
      autoRetryTimerRef.current = setTimeout(() => {
        checkAuth()
      }, 10_000)
    }
    return () => {
      if (autoRetryTimerRef.current) {
        clearTimeout(autoRetryTimerRef.current)
        autoRetryTimerRef.current = null
      }
    }
  }, [authError, isLoading, checkAuth])

  // Handle email login
  const handleEmailLogin = async (email: string, password: string) => {
    setEmailError(null)
    const result = await authApi.loginWithEmail(email, password)

    if (!result.success) {
      setEmailError(result.error || 'Login failed')
      return
    }

    // Refresh auth state to get the logged-in user
    await checkAuth()
  }

  // Redirect to intended destination if already logged in
  useEffect(() => {
    if (user && typeof window !== 'undefined') {
      window.location.replace(redirectPath)
    }
  }, [user, redirectPath])

  // Show a visible redirect state while navigation is pending.
  if (user) {
    return <LoginRedirectState />
  }

  return (
    <div className="min-h-screen bg-surface-base flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--surface-sunken)] mb-4">
            <svg viewBox="0 0 36 36" fill="none" className="w-10 h-10" data-testid="logo" role="img" aria-label={BRANDING.logoLabel}>
              <path d="M8 12L18 6L28 12V18L18 12L8 18V12Z" fill="var(--brand-gal)" />
              <path d="M8 18L18 12L28 18V24L18 18L8 24V18Z" fill="var(--brand-gal)" fillOpacity="0.6" />
              <path d="M8 24L18 18L28 24V30L18 24L8 30V24Z" fill="var(--brand-gal)" fillOpacity="0.3" />
            </svg>
          </div>
          <h1 className="text-2xl font-bold gradient-text mb-2">{BRANDING.missionControlName}</h1>
          <p className="text-[var(--text-secondary)]">Sign in to manage your AI agent configurations</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-[var(--status-danger-light)] border border-[var(--status-danger-text)]/30 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[var(--status-danger-text)] mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-[var(--status-danger-text)] mb-1">Authentication Failed</h3>
              <p className="text-sm text-[var(--status-danger-text)]">
                {error === 'oauth_not_configured' && 'GitHub OAuth is not configured. Please contact your administrator.'}
                {error === 'oauth_init_failed' && 'Failed to initiate GitHub authentication. Please try again.'}
                {error === 'missing_parameters' && 'Authentication callback missing required parameters.'}
                {error === 'invalid_state' && 'Invalid or expired authentication session. Please try again.'}
                {error === 'access_denied' && 'You denied access to GitHub. Sign in requires GitHub authorization.'}
                {error === 'email_not_verified' && 'Please verify your email before signing in. Check your inbox.'}
                {!['oauth_not_configured', 'oauth_init_failed', 'missing_parameters', 'invalid_state', 'access_denied', 'email_not_verified'].includes(error) &&
                  `Authentication error: ${error}. Please try again.`}
              </p>
            </div>
          </div>
        )}

        {/* Login Card */}
        <div className="card p-8">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[var(--accent)]"></div>
            </div>
          ) : authError === 'unreachable' ? (
            <div className="text-center py-4">
              <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-[var(--accent)]" />
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Connecting to server...</h2>
              <p className="text-[var(--text-secondary)] text-sm mb-4">
                The API is temporarily unreachable. Retrying automatically...
              </p>
              <button
                onClick={() => checkAuth()}
                className="text-[var(--text-link)] hover:underline text-sm"
              >
                Retry Now
              </button>
            </div>
          ) : !isConfigured ? (
            <div className="text-center py-4">
              <AlertCircle className="w-12 h-12 text-[var(--status-warning)] mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Authentication Not Configured</h2>
              <p className="text-[var(--text-secondary)] text-sm mb-4">
                Sign in is not available. Please contact your administrator to configure authentication.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="text-[var(--text-link)] hover:underline text-sm"
              >
                Refresh Page
              </button>
            </div>
          ) : authMode === 'social' ? (
            <>
              {/* GitHub Sign-In (recommended for org features) */}
              <GitHubAuthButton
                redirectPath={redirectPath}
                forceSelect={forceSelect}
                variant="primary"
              />

              {/* Divider - only show if Google auth is available */}
              {showGoogleAuth && (
                <div className="relative my-6">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-[var(--border-default)]"></div>
                  </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="bg-[var(--surface-raised)] px-4 text-[var(--text-secondary)]">or continue with</span>
                  </div>
                </div>
              )}

              {/* Google Sign-In (alternative) - controlled by auth.google feature flag */}
              {showGoogleAuth && (
                <GoogleAuthButton
                  redirectPath={redirectPath}
                  variant="primary"
                />
              )}

              {/* Email Sign-In Option - controlled by auth.email feature flag */}
              {showEmailAuth && (
                <>
                  <div className="relative my-6">
                    <div className="absolute inset-0 flex items-center">
                      <div className="w-full border-t border-[var(--border-default)]"></div>
                    </div>
                    <div className="relative flex justify-center text-sm">
                      <span className="bg-[var(--surface-raised)] px-4 text-[var(--text-secondary)]">or</span>
                    </div>
                  </div>

                  <button
                    onClick={() => setAuthMode('email')}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 border border-[var(--border-default)] text-[var(--text-primary)] font-medium rounded-lg hover:bg-[var(--surface-raised)] transition-colors"
                  >
                    <Mail className="w-5 h-5" />
                    Sign in with email
                  </button>
                </>
              )}

              <p className="text-center text-[var(--text-tertiary)] text-sm mt-6">
                By signing in, you agree to our{' '}
                <a href={GAL_TERMS_URL} target="_blank" rel="noopener noreferrer" className="text-[var(--text-link)] hover:underline">
                  Terms of Service
                </a>
                {' '}and{' '}
                <a href={GAL_PRIVACY_URL} target="_blank" rel="noopener noreferrer" className="text-[var(--text-link)] hover:underline">
                  Privacy Policy
                </a>
                .
                {!showGoogleAuth && !showEmailAuth && ' GitHub sign-in grants access to organization features.'}
              </p>

              {(showGoogleAuth || showEmailAuth) && (
                <p className="text-center text-[var(--text-tertiary)] text-xs mt-2">
                  <span className="text-[var(--accent)]">Tip:</span> Sign in with GitHub to access organization features.
                  {showGoogleAuth && ' Google'}{showGoogleAuth && showEmailAuth && ' and'}{showEmailAuth && ' email'} users can connect GitHub later.
                </p>
              )}
            </>
          ) : (
            <>
              {/* Email Sign-In Form */}
              <EmailAuthForm
                mode="login"
                onSubmit={handleEmailLogin}
                error={emailError}
              />

              {/* Back to social login */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[var(--border-default)]"></div>
                </div>
                  <div className="relative flex justify-center text-sm">
                    <span className="bg-[var(--surface-raised)] px-4 text-[var(--text-secondary)]">or</span>
                  </div>
                </div>

              <button
                onClick={() => {
                  setAuthMode('social')
                  setEmailError(null)
                }}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 border border-[var(--border-default)] text-[var(--text-secondary)] font-medium rounded-lg hover:bg-[var(--surface-raised)] transition-colors"
              >
                Continue with GitHub{showGoogleAuth ? ' or Google' : ''}
              </button>
            </>
          )}
        </div>

        {/* Footer */}
        <p className="text-center text-[var(--text-tertiary)] text-xs mt-8">
          {BRANDING.fullProductName}
          <br />
          {BRANDING.footerTagline}
        </p>
      </div>
    </div>
  )
}
