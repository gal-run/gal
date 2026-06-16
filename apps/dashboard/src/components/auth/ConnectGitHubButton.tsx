'use client'

import { Github, Link as LinkIcon, Unlink, Loader2 } from 'lucide-react'
import { useState } from 'react'
import { config } from '@/lib/config'

interface ConnectGitHubButtonProps {
  /**
   * If true, shows "Disconnect" variant instead of "Connect"
   */
  isConnected?: boolean

  /**
   * Callback when disconnect is requested
   */
  onDisconnect?: () => Promise<void>

  /**
   * Optional redirect path after successful connection
   * If not provided, redirects to current page
   */
  redirectPath?: string

  /**
   * Button size variant
   */
  size?: 'sm' | 'md' | 'lg'

  /**
   * Optional click handler (called before redirect)
   */
  onClick?: () => void

  /**
   * If true, disables the button
   */
  disabled?: boolean

  /**
   * Custom class name
   */
  className?: string
}

/**
 * ConnectGitHubButton - Connect or disconnect GitHub account
 *
 * Used by users who signed in with Google/Email to connect their GitHub
 * account for workspace features.
 *
 * Features:
 * - Loading state during redirect/disconnect
 * - Support for redirect paths
 * - Connect and disconnect variants
 */
export default function ConnectGitHubButton({
  isConnected = false,
  onDisconnect,
  redirectPath,
  size = 'md',
  onClick,
  disabled = false,
  className = '',
}: ConnectGitHubButtonProps) {
  const [isLoading, setIsLoading] = useState(false)

  const handleConnect = () => {
    // Call optional click handler
    if (onClick) {
      onClick()
    }

    // Set loading state
    setIsLoading(true)

    // Build GitHub OAuth URL for connecting (not signing in)
    const apiUrl = config.apiUrl
    const authUrl = new URL(`${apiUrl}/auth/github/connect`)

    // Check if we're on a Firebase preview domain (PR preview deployment)
    const isFirebasePreview = window.location.hostname.includes('--') &&
                               window.location.hostname.endsWith('.web.app')

    // Set redirect path
    const finalRedirectPath = redirectPath || window.location.pathname
    if (isFirebasePreview) {
      // On preview domain: pass full origin + path for redirect
      authUrl.searchParams.set('redirect', `${window.location.origin}${finalRedirectPath}`)
    } else {
      // On main domain: pass just the path
      authUrl.searchParams.set('redirect', finalRedirectPath)
    }

    // Redirect to GitHub OAuth for connection
    window.location.href = authUrl.toString()
  }

  const handleDisconnect = async () => {
    if (!onDisconnect) return

    setIsLoading(true)
    try {
      await onDisconnect()
    } finally {
      setIsLoading(false)
    }
  }

  // Size-based styles
  const sizeStyles = {
    sm: 'px-3 py-1.5 text-sm gap-1.5',
    md: 'px-4 py-2 text-sm gap-2',
    lg: 'px-6 py-3 text-base gap-3',
  }

  const iconSizes = {
    sm: 'w-3.5 h-3.5',
    md: 'w-4 h-4',
    lg: 'w-5 h-5',
  }

  if (isConnected) {
    // Disconnect variant
    return (
      <button
        onClick={handleDisconnect}
        disabled={isLoading || disabled}
        aria-busy={isLoading}
        aria-label={isLoading ? 'Disconnecting GitHub...' : 'Disconnect GitHub'}
        className={`flex items-center justify-center rounded-lg font-medium transition-colors border border-[var(--status-danger-text)]/30 text-[var(--status-danger-text)] hover:bg-[var(--status-danger-light)] hover:border-[var(--status-danger-text)]/50 disabled:opacity-50 disabled:cursor-not-allowed ${sizeStyles[size]} ${className}`}
      >
        {isLoading ? (
          <>
            <Loader2 className={`animate-spin ${iconSizes[size]}`} />
            <span>Disconnecting...</span>
          </>
        ) : (
          <>
            <Unlink className={iconSizes[size]} />
            <span>Disconnect GitHub</span>
          </>
        )}
      </button>
    )
  }

  // Connect variant
  return (
    <button
      onClick={handleConnect}
      disabled={isLoading || disabled}
      data-testid="connect-github-button"
      aria-busy={isLoading}
      aria-label={isLoading ? 'Connecting to GitHub...' : 'Connect GitHub'}
      className={`flex items-center justify-center rounded-lg font-medium transition-colors border border-[var(--border-default)] text-[var(--text-primary)] hover:bg-[var(--surface-raised)] hover:border-[var(--border-default)] disabled:opacity-50 disabled:cursor-not-allowed ${sizeStyles[size]} ${className}`}
    >
      {isLoading ? (
        <>
          <Loader2 className={`animate-spin ${iconSizes[size]}`} />
          <span>Connecting...</span>
        </>
      ) : (
        <>
          <Github className={iconSizes[size]} />
          <LinkIcon className={iconSizes[size]} />
          <span>Connect GitHub</span>
        </>
      )}
    </button>
  )
}
