'use client'

import { Suspense } from 'react'
import { AlertTriangle, ArrowLeft, RefreshCw } from 'lucide-react'
import { useSearchParams, useRouter } from 'next/navigation'

function AuthErrorContent() {
  const searchParams = useSearchParams()
  const router = useRouter()

  const error = searchParams.get('error') || 'unknown_error'

  const errorMessages: Record<string, { title: string; description: string }> = {
    access_denied: {
      title: 'Access Denied',
      description: 'You denied access to your GitHub account. Please try again if you want to sign in.',
    },
    missing_state: {
      title: 'Invalid Request',
      description: 'The authentication request was invalid. Please try signing in again.',
    },
    invalid_state: {
      title: 'Session Expired',
      description: 'Your login session expired. Please try signing in again.',
    },
    missing_code: {
      title: 'Authentication Failed',
      description: 'GitHub did not provide an authorization code. Please try again.',
    },
    unknown_error: {
      title: 'Something Went Wrong',
      description: 'An unexpected error occurred during authentication.',
    },
  }

  const { title, description } = errorMessages[error] || {
    title: 'Authentication Error',
    description: error,
  }

  return (
    <div className="min-h-screen bg-surface-base flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center">
        {/* Error Icon */}
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[var(--status-danger-light)] mb-6">
          <AlertTriangle className="w-8 h-8 text-[var(--status-danger)]" />
        </div>

        {/* Error Message */}
        <h1 className="text-2xl font-bold text-[var(--text-primary)] mb-2">{title}</h1>
        <p className="text-[var(--text-secondary)] mb-8">{description}</p>

        {/* Actions */}
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <button
            onClick={() => router.push('/login')}
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--interactive-primary)] px-6 py-3 font-semibold text-[var(--text-on-accent)] transition-colors hover:bg-[var(--interactive-primary-hover)]"
          >
            <RefreshCw className="w-4 h-4" />
            Try Again
          </button>

          <button
            onClick={() => router.push('/')}
            className="inline-flex items-center justify-center gap-2 rounded-lg border border-[var(--border-default)] bg-[var(--surface-raised)] px-6 py-3 font-semibold text-[var(--text-primary)] transition-colors hover:bg-[var(--surface-sunken)]"
          >
            <ArrowLeft className="w-4 h-4" />
            Go Home
          </button>
        </div>
      </div>
    </div>
  )
}

export default function AuthErrorPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-surface-base flex items-center justify-center p-4">
          <div className="text-[var(--text-secondary)]">Loading...</div>
        </div>
      }
    >
      <AuthErrorContent />
    </Suspense>
  )
}
