'use client'

import { useState } from 'react'
import { Mail, AlertCircle, Loader2, CheckCircle, ArrowLeft } from 'lucide-react'
import Link from 'next/link'

interface PasswordResetFormProps {
  /**
   * Callback when form is submitted
   */
  onSubmit: (email: string) => Promise<void>

  /**
   * Optional error message to display
   */
  error?: string | null

  /**
   * Optional loading state override
   */
  isLoading?: boolean
}

/**
 * PasswordResetForm - Form for requesting password reset email
 *
 * Used on the forgot password page with Firebase Auth.
 * Features:
 * - Email validation
 * - Success state with instructions
 * - Loading states
 * - Error display
 * - Link back to login
 */
export default function PasswordResetForm({
  onSubmit,
  error,
  isLoading: externalLoading,
}: PasswordResetFormProps) {
  const [email, setEmail] = useState('')
  const [internalLoading, setInternalLoading] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [isSuccess, setIsSuccess] = useState(false)

  const isLoading = externalLoading ?? internalLoading

  const validateForm = (): boolean => {
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setValidationError('Please enter a valid email address')
      return false
    }

    setValidationError(null)
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!validateForm()) {
      return
    }

    setInternalLoading(true)
    try {
      await onSubmit(email)
      setIsSuccess(true)
    } finally {
      setInternalLoading(false)
    }
  }

  const displayError = validationError || error

  // Success state - show instructions
  if (isSuccess) {
    return (
      <div className="space-y-6">
        <div className="text-center">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-[var(--status-success-light)] mb-4">
            <CheckCircle className="w-6 h-6 text-[var(--status-success-text)]" />
          </div>
          <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">Check your email</h2>
          <p className="text-[var(--text-secondary)] text-sm">
            We sent a password reset link to{' '}
            <span className="text-[var(--text-primary)] font-medium">{email}</span>
          </p>
        </div>

        <div className="p-4 bg-[var(--surface-sunken)] border border-[var(--border-default)] rounded-lg">
          <p className="text-sm text-[var(--text-primary)]">
            Click the link in the email to reset your password. If you don&apos;t see it,
            check your spam folder.
          </p>
        </div>

        <div className="space-y-3">
          <button
            onClick={() => {
              setIsSuccess(false)
              setEmail('')
            }}
            className="w-full px-4 py-2.5 border border-[var(--border-default)] text-[var(--text-primary)] font-medium rounded-lg hover:bg-[var(--surface-raised)] transition-colors"
          >
            Try a different email
          </button>

          <Link
            href="/login"
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-[var(--text-link)] hover:underline"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to sign in
          </Link>
        </div>
      </div>
    )
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Description */}
      <p className="text-[var(--text-secondary)] text-sm">
        Enter your email address and we&apos;ll send you a link to reset your password.
      </p>

      {/* Error Display */}
      {displayError && (
        <div className="p-3 bg-[var(--status-danger-light)] border border-[var(--status-danger-text)]/30 rounded-lg flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-[var(--status-danger-text)] mt-0.5 flex-shrink-0" />
          <p className="text-sm text-[var(--status-danger-text)]">{displayError}</p>
        </div>
      )}

      {/* Email Field */}
      <div>
        <label htmlFor="email" className="block text-sm font-medium text-[var(--text-primary)] mb-1">
          Email
        </label>
        <div className="relative">
          <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            autoComplete="email"
            required
            disabled={isLoading}
            className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-sunken)] py-2.5 pl-10 pr-4 text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--glow-medium)] focus:border-[var(--border-interactive)] disabled:opacity-50 disabled:cursor-not-allowed"
          />
        </div>
      </div>

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-[var(--interactive-primary)] px-4 py-2.5 font-semibold text-[var(--text-on-accent)] transition-colors hover:bg-[var(--interactive-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Sending...
          </>
        ) : (
          'Send reset link'
        )}
      </button>

      {/* Back to Login Link */}
      <Link
        href="/login"
        className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        Back to sign in
      </Link>
    </form>
  )
}
