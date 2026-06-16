'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/contexts/AuthContext'
import PasswordResetForm from '@/components/auth/PasswordResetForm'
import { authApi } from '@/lib/auth-api'
import { BRANDING } from '@/lib/branding'

export default function ForgotPasswordPage() {
  const { user, isLoading } = useAuth()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)

  // Handle password reset request
  const handlePasswordReset = async (email: string) => {
    setError(null)
    const result = await authApi.requestPasswordReset(email)

    if (!result.success) {
      setError(result.message || 'Failed to send reset email')
      throw new Error(result.message || 'Failed to send reset email')
    }

    // Success is handled by PasswordResetForm component
  }

  // Redirect to home if already logged in
  useEffect(() => {
    if (user) {
      router.replace('/')
    }
  }, [user, router])

  // Don't render form if user is already logged in (redirect is pending)
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
          <h1 className="text-2xl font-bold gradient-text mb-2">Reset your password</h1>
          <p className="text-[var(--text-secondary)]">We&apos;ll send you a link to reset it</p>
        </div>

        {/* Password Reset Card */}
        <div className="card p-8">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[var(--accent)]"></div>
            </div>
          ) : (
            <PasswordResetForm
              onSubmit={handlePasswordReset}
              error={error}
            />
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
