'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'

interface GoogleAuthButtonProps {
  /**
   * Optional redirect path after successful authentication
   * If not provided, redirects to dashboard home
   */
  redirectPath?: string

  /**
   * Button variant style
   */
  variant?: 'primary' | 'secondary'

  /**
   * Optional click handler (called before sign-in)
   */
  onClick?: () => void
}

/**
 * GoogleAuthButton - Initiates Google OAuth flow via Firebase Auth
 *
 * When clicked, opens Google sign-in popup via Firebase Auth.
 * After successful auth, sends Firebase ID token to backend for verification.
 *
 * Features:
 * - Loading state during authentication
 * - Error handling for auth failures
 * - Account linking for same email
 */
export default function GoogleAuthButton({
  redirectPath,
  variant = 'primary',
  onClick,
}: GoogleAuthButtonProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { signInWithGoogle } = useAuth()

  const handleClick = async () => {
    // Call optional click handler
    if (onClick) {
      onClick()
    }

    setIsLoading(true)
    setError(null)

    try {
      await signInWithGoogle(redirectPath)
    } catch (err) {
      console.error('[GoogleAuthButton] Sign-in error:', err)
      setError(err instanceof Error ? err.message : 'Sign-in failed')
      setIsLoading(false)
    }
  }

  // Primary variant: bordered button with Google icon
  if (variant === 'primary') {
    return (
      <div className="w-full">
        <button
          onClick={handleClick}
          disabled={isLoading}
          data-testid="google-sign-in-button"
          aria-busy={isLoading}
          aria-label={isLoading ? 'Signing in with Google...' : 'Sign in with Google'}
          className="w-full flex items-center justify-center gap-3 px-6 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            backgroundColor: 'var(--surface-raised)',
            color: 'var(--text-primary)',
            border: '1px solid var(--border-default)',
          }}
        >
          {isLoading ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>Signing in...</span>
            </>
          ) : (
            <>
              <GoogleIcon className="w-5 h-5" />
              <span>Sign in with Google</span>
            </>
          )}
        </button>
        {error && (
          <p className="mt-2 text-sm text-[var(--status-danger-text)] text-center" role="alert">{error}</p>
        )}
      </div>
    )
  }

  // Secondary variant: outlined button
  return (
    <div className="w-full">
      <button
        onClick={handleClick}
        disabled={isLoading}
        aria-busy={isLoading}
        aria-label={isLoading ? 'Signing in with Google...' : 'Sign in with Google'}
        className="flex items-center justify-center gap-2 px-4 py-2 border border-[var(--border-default)] text-[var(--text-primary)] rounded-lg font-medium hover:bg-[var(--surface-raised)] hover:border-[var(--border-default)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            <span>Signing in...</span>
          </>
        ) : (
          <>
            <GoogleIcon className="w-4 h-4" />
            <span>Sign in with Google</span>
          </>
        )}
      </button>
      {error && (
        <p className="mt-2 text-sm text-[var(--status-danger-text)] text-center" role="alert">{error}</p>
      )}
    </div>
  )
}

/**
 * Google "G" icon as SVG component
 */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  )
}
