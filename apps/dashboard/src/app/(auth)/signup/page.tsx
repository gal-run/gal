'use client'

import { useState, useEffect } from 'react'
import { AlertCircle, CheckCircle } from 'lucide-react'
import { useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { useAuth } from '@/contexts/AuthContext'
import { useFeatureFlags } from '@/contexts/FeatureFlagsContext'
import GitHubAuthButton from '@/components/auth/GitHubAuthButton'
import GoogleAuthButton from '@/components/auth/GoogleAuthButton'
import EmailAuthForm from '@/components/auth/EmailAuthForm'
import { authApi } from '@/lib/auth-api'
import { BRANDING } from '@/lib/branding'
import { GAL_TERMS_URL, GAL_PRIVACY_URL } from '@gal/types'

export default function SignupPage() {
  const { user, isLoading, isConfigured, isGoogleConfigured } = useAuth()
  const { isFeatureEnabled } = useFeatureFlags()
  const router = useRouter()
  const searchParams = useSearchParams()

  // Registration state
  const [emailError, setEmailError] = useState<string | null>(null)
  const [registrationSuccess, setRegistrationSuccess] = useState(false)
  const [registeredEmail, setRegisteredEmail] = useState('')

  // Get the intended destination from query params (sanitized to prevent open redirects / invalid paths)
  // Mirrors the same validation used in login/page.tsx to block protocol-relative URLs
  // such as //auth/me that cause a SecurityError in history.replaceState (#5748).
  const rawRedirect = searchParams.get('redirect') || '/'
  const redirectPath = rawRedirect.startsWith('/') && !rawRedirect.startsWith('//') && !rawRedirect.includes('://')
    ? rawRedirect
    : '/'
  const forceSelect = searchParams.get('force_select') === 'true'

  // Get error from query params
  const error = searchParams.get('error')

  // Handle email registration
  const handleEmailSignup = async (email: string, password: string) => {
    setEmailError(null)
    const result = await authApi.registerWithEmail(email, password)

    if (!result.success) {
      setEmailError(result.error || 'Registration failed')
      return
    }

    // Show success message with email verification instructions
    setRegisteredEmail(email)
    setRegistrationSuccess(true)
  }

  // Redirect to intended destination if already logged in
  useEffect(() => {
    if (user) {
      router.replace(redirectPath)
    }
  }, [user, redirectPath, router])

  // Don't render signup form if user is already logged in (redirect is pending)
  if (user) {
    return null
  }

  return (
    <div className="min-h-screen bg-surface-base flex items-center justify-center p-4">
      <div className="max-w-md w-full">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--accent-bg)] mb-4">
            <img
              src="/favicon.svg"
              alt={BRANDING.logoLabel}
              className="w-10 h-10"
              data-testid="logo"
            />
          </div>
          <h1 className="text-2xl font-bold gradient-text mb-2">Create your account</h1>
          <p className="text-[var(--text-secondary)]">Get started with {BRANDING.missionControlName}</p>
        </div>

        {/* Error Alert */}
        {error && (
          <div className="mb-6 p-4 bg-[var(--status-danger-light)] border border-[var(--status-danger-text)]/30 rounded-lg flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-[var(--status-danger-text)] mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-[var(--status-danger-text)] mb-1">Registration Failed</h3>
              <p className="text-sm text-[var(--status-danger-text)]">
                {error === 'email_in_use' && 'An account with this email already exists.'}
                {error === 'weak_password' && 'Password is too weak. Use at least 8 characters.'}
                {!['email_in_use', 'weak_password'].includes(error) &&
                  `Registration error: ${error}. Please try again.`}
              </p>
            </div>
          </div>
        )}

        {/* Registration Card */}
        <div className="card p-8">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[var(--accent)]"></div>
            </div>
          ) : !isConfigured ? (
            <div className="text-center py-4">
              <AlertCircle className="w-12 h-12 text-[var(--status-warning)] mx-auto mb-4" />
              <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-2">Service Temporarily Unavailable</h2>
              <p className="text-[var(--text-secondary)] text-sm mb-4">
                Registration is temporarily unavailable. Please try again later.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="text-[var(--text-link)] hover:underline text-sm"
              >
                Refresh Page
              </button>
            </div>
          ) : registrationSuccess ? (
            // Registration success - email verification required
            <div className="text-center py-4">
              <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--status-success-light)] mb-4">
                <CheckCircle className="w-6 h-6 text-[var(--status-success-text)]" />
              </div>
              <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Check your email</h2>
              <p className="text-[var(--text-secondary)] text-sm mb-4">
                We sent a verification link to{' '}
                <span className="text-[var(--text-primary)] font-medium">{registeredEmail}</span>
              </p>

              <div className="p-4 bg-[var(--surface-sunken)] border border-[var(--border-default)] rounded-lg mb-6">
                <p className="text-sm text-[var(--text-primary)]">
                  Click the link in the email to verify your account. Once verified, you can sign in.
                  If you don&apos;t see it, check your spam folder.
                </p>
              </div>

              <div className="space-y-3">
                <Link
                  href="/login"
                  className="w-full flex items-center justify-center rounded-lg bg-[var(--interactive-primary)] px-4 py-2.5 font-semibold text-[var(--text-on-accent)] transition-colors hover:bg-[var(--interactive-primary-hover)]"
                >
                  Go to sign in
                </Link>

                <button
                  onClick={() => {
                    setRegistrationSuccess(false)
                    setRegisteredEmail('')
                  }}
                  className="w-full px-4 py-2.5 border border-[var(--border-default)] text-[var(--text-primary)] font-medium rounded-lg hover:bg-[var(--surface-raised)] transition-colors"
                >
                  Register another email
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Email Registration Form */}
              <EmailAuthForm
                mode="signup"
                onSubmit={handleEmailSignup}
                error={emailError}
              />

              {/* Divider */}
              <div className="relative my-6">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-[var(--border-default)]"></div>
                </div>
                <div className="relative flex justify-center text-sm">
                  <span className="bg-[var(--surface-raised)] px-4 text-[var(--text-secondary)]">or sign up with</span>
                </div>
              </div>

              {/* Social Sign-Up Options */}
              <div className="space-y-3">
                <GitHubAuthButton
                  redirectPath={redirectPath}
                  forceSelect={forceSelect}
                  variant="secondary"
                />

                {isFeatureEnabled('auth.google') && isGoogleConfigured && (
                  <GoogleAuthButton
                    redirectPath={redirectPath}
                    variant="secondary"
                  />
                )}
              </div>

              <p className="text-center text-[var(--text-tertiary)] text-sm mt-6">
                By creating an account, you agree to our{' '}
                <a href={GAL_TERMS_URL} className="text-[var(--text-link)] hover:underline">Terms of Service</a>
                {' '}and{' '}
                <a href={GAL_PRIVACY_URL} className="text-[var(--text-link)] hover:underline">Privacy Policy</a>.
              </p>

              <p className="text-center text-[var(--text-tertiary)] text-xs mt-2">
                <span className="text-[var(--accent)]">Tip:</span> Sign up with GitHub to access organization features.
                Email users can connect GitHub later.
              </p>
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
