'use client'

import { useState } from 'react'
import { Mail, Lock, Eye, EyeOff, AlertCircle, Loader2 } from 'lucide-react'
import Link from 'next/link'

interface EmailAuthFormProps {
  /**
   * Form mode: 'login' for sign in, 'signup' for registration
   */
  mode: 'login' | 'signup'

  /**
   * Callback when form is submitted
   */
  onSubmit: (email: string, password: string) => Promise<void>

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
 * EmailAuthForm - Reusable email/password authentication form
 *
 * Used for both login and signup flows with Firebase Auth.
 * Features:
 * - Email validation
 * - Password visibility toggle
 * - Loading states
 * - Error display
 * - Link to alternate flow (login <-> signup)
 */
export default function EmailAuthForm({
  mode,
  onSubmit,
  error,
  isLoading: externalLoading,
}: EmailAuthFormProps) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [showConfirmPassword, setShowConfirmPassword] = useState(false)
  const [internalLoading, setInternalLoading] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)

  const isLoading = externalLoading ?? internalLoading
  const isSignup = mode === 'signup'

  const validateForm = (): boolean => {
    // Email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      setValidationError('Please enter a valid email address')
      return false
    }

    // Password validation
    if (password.length < 8) {
      setValidationError('Password must be at least 8 characters')
      return false
    }

    // Confirm password for signup
    if (isSignup && password !== confirmPassword) {
      setValidationError('Passwords do not match')
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
      await onSubmit(email, password)
    } finally {
      setInternalLoading(false)
    }
  }

  const displayError = validationError || error

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
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

      {/* Password Field */}
      <div>
        <label htmlFor="password" className="block text-sm font-medium text-[var(--text-primary)] mb-1">
          Password
        </label>
        <div className="relative">
          <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
          <input
            id="password"
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={isSignup ? 'At least 8 characters' : 'Enter your password'}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            required
            disabled={isLoading}
            className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-sunken)] py-2.5 pl-10 pr-10 text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--glow-medium)] focus:border-[var(--border-interactive)] disabled:opacity-50 disabled:cursor-not-allowed"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
            tabIndex={-1}
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Confirm Password Field (Signup only) */}
      {isSignup && (
        <div>
          <label htmlFor="confirmPassword" className="block text-sm font-medium text-[var(--text-primary)] mb-1">
            Confirm Password
          </label>
          <div className="relative">
            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--text-tertiary)]" />
            <input
              id="confirmPassword"
              type={showConfirmPassword ? 'text' : 'password'}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Confirm your password"
              autoComplete="new-password"
              required
              disabled={isLoading}
              className="w-full rounded-lg border border-[var(--border-default)] bg-[var(--surface-sunken)] py-2.5 pl-10 pr-10 text-[var(--text-primary)] placeholder:text-[var(--text-tertiary)] focus:outline-none focus:ring-2 focus:ring-[var(--glow-medium)] focus:border-[var(--border-interactive)] disabled:opacity-50 disabled:cursor-not-allowed"
            />
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--text-tertiary)] hover:text-[var(--text-primary)]"
              tabIndex={-1}
            >
              {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>
        </div>
      )}

      {/* Forgot Password Link (Login only) */}
      {!isSignup && (
        <div className="text-right">
          <Link
            href="/forgot-password"
            className="text-sm text-[var(--text-link)] hover:underline"
          >
            Forgot password?
          </Link>
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading}
        className="w-full flex items-center justify-center gap-2 rounded-lg bg-[var(--interactive-primary)] px-4 py-2.5 font-semibold text-[var(--text-on-accent)] transition-colors hover:bg-[var(--interactive-primary-hover)] disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            {isSignup ? 'Creating account...' : 'Signing in...'}
          </>
        ) : (
          isSignup ? 'Create account' : 'Sign in with email'
        )}
      </button>

      {/* Alternate Flow Link */}
      <p className="text-center text-sm text-[var(--text-secondary)]">
        {isSignup ? (
          <>
            Already have an account?{' '}
            <Link href="/login" className="text-[var(--text-link)] hover:underline">
              Sign in
            </Link>
          </>
        ) : (
          <>
            Don&apos;t have an account?{' '}
            <Link href="/signup" className="text-[var(--text-link)] hover:underline">
              Sign up
            </Link>
          </>
        )}
      </p>
    </form>
  )
}
