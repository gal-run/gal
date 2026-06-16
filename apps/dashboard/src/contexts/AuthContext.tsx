'use client'

import { createContext, useContext, useState, useEffect, useCallback, useRef, type ReactNode } from 'react'
import { GoogleAuthProvider, signInWithPopup, type UserCredential } from 'firebase/auth'
import { authApi, isCrossOriginFallback } from '@/lib/auth-api'
import { auth as firebaseAuth, isFirebaseConfigured } from '@/lib/firebase'
import type { User, AuthStatus } from '@/lib/auth-types'

// BroadcastChannel for syncing auth state across tabs
const AUTH_CHANNEL_NAME = 'gal-auth-channel'

export interface AuthContextType {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  isConfigured: boolean
  isAdmin: boolean  // GitHub org admin = can edit approved config
  isGoogleConfigured: boolean  // Whether Google sign-in is available
  hasGitHubProvider: boolean  // Whether user has GitHub connected
  authError: 'unreachable' | 'not-configured' | null  // Distinguish transient vs config errors
  login: (redirect?: string, forceSelect?: boolean) => void
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
  signInWithGoogle: (redirect?: string) => Promise<void>
}

export const AuthContext = createContext<AuthContextType | null>(null)

/**
 * Determine if an error from authApi.getAuthStatus() is transient and worth retrying.
 * Retries on: network failures, 429 (rate limit), and 5xx server errors.
 */
function isRetryableError(error: unknown): boolean {
  // Network errors (fetch failed, no internet, DNS, CORS)
  if (error instanceof TypeError) return true

  // HTTP errors with status codes
  if (error && typeof error === 'object' && 'status' in error) {
    const status = (error as { status: number }).status
    return status === 429 || status >= 500
  }

  // Check error message for common transient patterns
  if (error instanceof Error) {
    const msg = error.message.toLowerCase()
    return msg.includes('network') ||
           msg.includes('fetch') ||
           msg.includes('timeout') ||
           msg.includes('503') ||
           msg.includes('502') ||
           msg.includes('429') ||
           msg.includes('failed to fetch')
  }

  return false
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [isConfigured, setIsConfigured] = useState(false)
  const [authError, setAuthError] = useState<'unreachable' | 'not-configured' | null>(null)
  const authChannelRef = useRef<BroadcastChannel | null>(null)
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const checkAuth = useCallback(async () => {
    // Clear any pending retry timer
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current)
      retryTimerRef.current = null
    }

    setIsLoading(true)
    setAuthError(null)

    const RETRY_DELAYS = [1000, 3000, 5000] // Exponential backoff: 1s, 3s, 5s

    for (let attempt = 0; attempt <= RETRY_DELAYS.length; attempt++) {
      try {
        // Debug: Log auth check attempt
        if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
          console.log(`[AuthContext] Checking auth status (attempt ${attempt + 1})...`)
          console.log('[AuthContext] localStorage token present:', !!localStorage.getItem('gal_auth_token'))
        }

        // Auth is now handled via httpOnly cookies set by server
        // Just check auth status - cookies are sent automatically
        const status: AuthStatus = await authApi.getAuthStatus()

        // Debug: Log auth response
        if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
          console.log('[AuthContext] Auth status response:', {
            configured: status.configured,
            hasUser: !!status.user,
            userLogin: status.user?.login
          })
        }

        setIsConfigured(status.configured)
        setUser(status.user)
        setAuthError(status.configured ? null : 'not-configured')

        // If user became null (session expired), broadcast to other tabs
        if (!status.user && authChannelRef.current) {
          authChannelRef.current.postMessage({ type: 'session_expired' })
        }

        setIsLoading(false)
        return // Success - exit retry loop
      } catch (error) {
        const isRetryable = isRetryableError(error)

        // Don't log auth errors to console in production
        if (process.env.NODE_ENV === 'development') {
          console.error(`[AuthContext] Auth check failed (attempt ${attempt + 1}, retryable=${isRetryable}):`, error)
        }

        if (isRetryable && attempt < RETRY_DELAYS.length) {
          // Wait before retrying
          await new Promise(resolve => {
            retryTimerRef.current = setTimeout(resolve, RETRY_DELAYS[attempt])
          })
          continue
        }

        // All retries exhausted or non-retryable error
        setUser(null)
        setAuthError(isRetryable ? 'unreachable' : 'not-configured')
        setIsLoading(false)
        return
      }
    }
  }, [])

  // Set up BroadcastChannel for cross-tab auth sync
  useEffect(() => {
    if (typeof BroadcastChannel !== 'undefined') {
      const channel = new BroadcastChannel(AUTH_CHANNEL_NAME)
      authChannelRef.current = channel

      channel.onmessage = (event) => {
        if (event.data?.type === 'logout' || event.data?.type === 'session_expired') {
          // Another tab logged out or session expired - sync state.
          // Sign out Firebase so the 401 auto-retry cannot silently re-authenticate
          // using firebaseAuth.currentUser in a background tab.
          if (firebaseAuth) {
            firebaseAuth.signOut().catch(() => {
              // Ignore sign-out errors in background tabs
            })
          }
          // Clear cross-origin localStorage token
          try {
            localStorage.removeItem('gal_auth_token')
          } catch {
            // Ignore localStorage errors
          }
          setUser(null)
        } else if (event.data?.type === 'login') {
          // Another tab logged in - refresh our state
          checkAuth()
        }
      }

      return () => {
        channel.close()
        authChannelRef.current = null
      }
    }
  }, [checkAuth])

  // Capture session token from URL hash (set by GitHub OAuth redirect)
  // and run initial auth check. Combined to avoid duplicate checkAuth() calls on mount.
  useEffect(() => {
    if (isCrossOriginFallback()) {
      const hash = window.location.hash
      const match = hash.match(/gal_session=([^&]+)/)
      if (match) {
        const token = decodeURIComponent(match[1])
        try {
          localStorage.setItem('gal_auth_token', token)
        } catch {
          // Ignore localStorage errors (e.g. private browsing)
        }
        // Strip gal_session from fragment, preserving any other hash content
        // (e.g. hash-based routes like #/dashboard)
        const cleanHash = hash
          .replace(/[#&]?gal_session=[^&]+/, '')
          .replace(/^#&/, '#') // fix leading #& if token was first param
        const rawUrl = window.location.pathname + window.location.search + (cleanHash && cleanHash !== '#' ? cleanHash : '')
        // Guard against protocol-relative URLs (e.g. //auth/me) that arise when
        // pathname is '/' and cleanHash starts with '/' (no leading '#').
        // Browsers interpret '//...' as a cross-origin URL, causing a SecurityError
        // in history.replaceState (#5748).
        const newUrl = rawUrl.startsWith('//') ? '/' + rawUrl.replace(/^\/+/, '') : rawUrl
        history.replaceState(null, '', newUrl)
      }
    }
    // Always run initial auth check (whether or not a hash token was captured)
    checkAuth()
  }, [checkAuth])

  // Proactive token refresh: schedule refresh 5 minutes before JWT expiry.
  // Falls back to periodic 5-minute polling if JWT parsing fails (cookie-only/production).
  useEffect(() => {
    if (!user) return

    let timeoutId: ReturnType<typeof setTimeout> | undefined
    let intervalId: ReturnType<typeof setInterval> | undefined
    let cancelled = false

    const scheduleRefresh = () => {
      // Try to parse JWT expiry from localStorage token
      try {
        const token = localStorage.getItem('gal_auth_token')
        if (token) {
          const parts = token.split('.')
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]))
            if (payload.exp) {
              const expiresAtMs = payload.exp * 1000
              const refreshAtMs = expiresAtMs - 5 * 60 * 1000 // 5 min before expiry
              const delayMs = refreshAtMs - Date.now()

              if (delayMs > 0) {
                // Schedule proactive refresh before expiry
                timeoutId = setTimeout(async () => {
                  if (cancelled) return
                  try {
                    const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000'
                    const headers: Record<string, string> = { 'Content-Type': 'application/json' }
                    const currentToken = localStorage.getItem('gal_auth_token')
                    if (currentToken) {
                      headers['Authorization'] = `Bearer ${currentToken}`
                    }
                    const response = await fetch(`${apiUrl}/auth/session/refresh`, {
                      method: 'POST',
                      headers,
                      credentials: 'include',
                    })

                    if (response.ok) {
                      const data = await response.json()
                      if (data.sessionToken) {
                        try {
                          localStorage.setItem('gal_auth_token', data.sessionToken)
                        } catch {
                          // Ignore localStorage errors
                        }
                      }
                      // Reschedule for the new token's expiry
                      if (!cancelled) scheduleRefresh()
                    } else if (response.status === 401) {
                      // Session beyond grace period — force re-login
                      setUser(null)
                      if (authChannelRef.current) {
                        authChannelRef.current.postMessage({ type: 'session_expired' })
                      }
                    }
                  } catch {
                    // Network error — don't log user out, try again later
                    if (!cancelled) {
                      timeoutId = setTimeout(() => {
                        if (!cancelled) scheduleRefresh()
                      }, 60 * 1000) // Retry in 1 minute
                    }
                  }
                }, delayMs)
                return // Successfully scheduled — skip fallback
              }
            }
          }
        }
      } catch {
        // JWT parsing failed — fall through to periodic check
      }

      // Fallback: periodic 5-minute check (cookie-only mode / production)
      intervalId = setInterval(() => {
        if (cancelled) return
        authApi.getAuthStatus().then(status => {
          if (!status.user) {
            setUser(null)
            if (authChannelRef.current) {
              authChannelRef.current.postMessage({ type: 'session_expired' })
            }
          }
        }).catch(() => {
          // Network error — don't log user out
        })
      }, 5 * 60 * 1000)
    }

    scheduleRefresh()

    return () => {
      cancelled = true
      if (timeoutId) clearTimeout(timeoutId)
      if (intervalId) clearInterval(intervalId)
    }
  }, [user])

  const login = useCallback((redirect?: string, forceSelect?: boolean) => {
    // Check if we're on a Firebase preview domain (PR preview deployment)
    // If so, pass the full origin URL so OAuth redirects back to this preview
    const isFirebasePreview = window.location.hostname.includes('--') &&
                               window.location.hostname.endsWith('.web.app');

    let redirectUrl = redirect || '/';
    if (isFirebasePreview) {
      // On preview domain: pass full origin + path for redirect
      redirectUrl = `${window.location.origin}${redirectUrl}`;
    }

    const loginUrl = authApi.getLoginUrl(redirectUrl, forceSelect)
    window.location.href = loginUrl
  }, [])

  const logout = useCallback(async () => {
    await authApi.logout()
    // Clear localStorage token (cross-origin fallback)
    try {
      localStorage.removeItem('gal_auth_token')
    } catch {
      // Ignore localStorage errors
    }
    // Also sign out from Firebase if configured
    if (firebaseAuth) {
      try {
        await firebaseAuth.signOut()
      } catch (error) {
        // Ignore Firebase sign-out errors
        if (process.env.NODE_ENV === 'development') {
          console.log('[AuthContext] Firebase sign-out error (ignored):', error)
        }
      }
    }
    setUser(null)
    // Broadcast logout to other tabs
    if (authChannelRef.current) {
      authChannelRef.current.postMessage({ type: 'logout' })
    }
  }, [])

  /**
   * Sign in with Google using Firebase Auth
   * After successful Firebase sign-in, sends the ID token to our backend for verification
   * and session creation (using httpOnly cookies like GitHub auth)
   */
  const signInWithGoogle = useCallback(async (redirect?: string) => {
    if (!firebaseAuth || !isFirebaseConfigured) {
      throw new Error('Google sign-in is not configured')
    }

    setIsLoading(true)

    try {
      // Sign in with Google via Firebase
      const provider = new GoogleAuthProvider()
      provider.setCustomParameters({
        prompt: 'select_account', // Always show account picker
      })

      const result: UserCredential = await signInWithPopup(firebaseAuth, provider)

      // Get the Firebase ID token
      const idToken = await result.user.getIdToken()

      if (process.env.NODE_ENV === 'development') {
        console.log('[AuthContext] Google sign-in successful, verifying with backend...', {
          email: result.user.email,
          displayName: result.user.displayName,
        })
      }

      // Send ID token to backend for verification and session creation
      const apiUrl = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000'
      const response = await fetch(`${apiUrl}/auth/google/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ idToken }),
        credentials: 'include', // Important: include cookies for session
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to verify Google sign-in')
      }

      const data = await response.json()

      if (process.env.NODE_ENV === 'development') {
        console.log('[AuthContext] Backend verification successful:', {
          hasUser: !!data.user,
          hasGitHub: data.user?.hasGitHubProvider,
        })
      }

      // Store session token in localStorage for cross-origin fallback
      if (isCrossOriginFallback() && data.sessionToken) {
        try {
          localStorage.setItem('gal_auth_token', data.sessionToken)
        } catch {
          // Ignore localStorage errors
        }
      }

      // Update local state with user from backend
      setUser(data.user)

      // Broadcast login to other tabs
      if (authChannelRef.current) {
        authChannelRef.current.postMessage({ type: 'login' })
      }

      // Redirect if specified
      if (redirect) {
        window.location.href = redirect.startsWith('http')
          ? redirect
          : redirect
      }
    } catch (error) {
      console.error('[AuthContext] Google sign-in error:', error)
      throw error
    } finally {
      setIsLoading(false)
    }
  }, [])

  // Clean up retry timer on unmount
  useEffect(() => {
    return () => {
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current)
      }
    }
  }, [])

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: !!user,
    isConfigured,
    isAdmin: user?.isAdmin ?? false,
    isGoogleConfigured: isFirebaseConfigured,
    hasGitHubProvider: user?.githubId !== undefined && user?.githubId > 0,
    authError,
    login,
    logout,
    checkAuth,
    signInWithGoogle,
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
