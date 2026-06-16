'use client'

import { Github, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { config } from '@/lib/config'

interface GitHubAuthButtonProps {
  /**
   * Optional redirect path after successful authentication
   * If not provided, redirects to dashboard home
   */
  redirectPath?: string

  /**
   * If true, forces GitHub to show account picker
   * Useful after logout to allow different account selection
   */
  forceSelect?: boolean

  /**
   * Button variant style
   */
  variant?: 'primary' | 'secondary'

  /**
   * Optional click handler (called before redirect)
   */
  onClick?: () => void
}

/**
 * GitHubAuthButton - Initiates GitHub OAuth flow
 *
 * When clicked, redirects user to GitHub authorization page.
 * After successful auth, GitHub redirects back to our callback URL.
 *
 * Features:
 * - Loading state during redirect
 * - Error handling for auth failures
 * - Support for redirect paths
 * - Force account selection option
 */
export default function GitHubAuthButton({
  redirectPath,
  forceSelect = false,
  variant = 'primary',
  onClick,
}: GitHubAuthButtonProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleClick = () => {
    // Call optional click handler
    if (onClick) {
      onClick()
    }

    // Set loading state
    setIsLoading(true)

    // Build GitHub OAuth URL
    const apiUrl = config.apiUrl
    const authUrl = new URL(`${apiUrl}/auth/github`)

    // Add redirect path if provided
    // Check if we're on a Firebase preview domain (PR preview deployment)
    // If so, pass the full origin URL so OAuth redirects back to this preview
    const isFirebasePreview = window.location.hostname.includes('--') &&
                               window.location.hostname.endsWith('.web.app')

    if (redirectPath) {
      if (isFirebasePreview) {
        // On preview domain: pass full origin + path for redirect
        authUrl.searchParams.set('redirect', `${window.location.origin}${redirectPath}`)
      } else {
        // On main domain: pass just the path
        authUrl.searchParams.set('redirect', redirectPath)
      }
    } else if (isFirebasePreview) {
      // No specific path, but on preview - redirect to preview origin
      authUrl.searchParams.set('redirect', window.location.origin)
    }

    // Add force_select parameter if needed
    if (forceSelect) {
      authUrl.searchParams.set('force_select', 'true')
    }

    // Redirect to GitHub OAuth
    window.location.href = authUrl.toString()
  }

  // Primary variant: dark background with GitHub branding
  if (variant === 'primary') {
    return (
      <button
        onClick={handleClick}
        disabled={isLoading}
        data-testid="sign-in-button"
        aria-busy={isLoading}
        aria-label={isLoading ? 'Redirecting to GitHub...' : 'Sign in with GitHub'}
        className="w-full flex items-center justify-center gap-3 px-6 py-3 rounded-lg font-semibold transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        style={{
          backgroundColor: '#24292e',
          color: '#ffffff',
        }}
        onMouseOver={(e) => (e.currentTarget.style.backgroundColor = '#2f363d')}
        onMouseOut={(e) => (e.currentTarget.style.backgroundColor = '#24292e')}
      >
        {isLoading ? (
          <>
            <Loader2 className="w-5 h-5 animate-spin" />
            <span>Redirecting to GitHub...</span>
          </>
        ) : (
          <>
            <Github className="w-5 h-5" />
            <span>Sign in with GitHub</span>
          </>
        )}
      </button>
    )
  }

  // Secondary variant: outlined button for "Connect GitHub" flows
  return (
    <button
      onClick={handleClick}
      disabled={isLoading}
      aria-busy={isLoading}
      aria-label={isLoading ? 'Connecting to GitHub...' : 'Connect GitHub'}
      className="flex items-center justify-center gap-2 px-4 py-2 border border-[var(--border-default)] text-[var(--text-primary)] rounded-lg font-medium hover:bg-[var(--surface-raised)] hover:border-[var(--border-default)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
    >
      {isLoading ? (
        <>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span>Connecting...</span>
        </>
      ) : (
        <>
          <Github className="w-4 h-4" />
          <span>Connect GitHub</span>
        </>
      )}
    </button>
  )
}
