import { getEnvironment } from './config'
import type { AuthStatus, User } from './auth-types'

const API_BASE_URL = process.env['NEXT_PUBLIC_API_URL'] || 'http://localhost:3000'
const DEFAULT_REQUEST_TIMEOUT_MS = 30_000
const FAST_STATUS_TIMEOUT_MS = 10_000

function isGalRunHost(hostname: string): boolean {
  return hostname === 'gal.run' || hostname.endsWith('.gal.run')
}

export function isCrossOriginFallback(): boolean {
  if (typeof window === 'undefined') return false
  try {
    const apiUrl = new URL(API_BASE_URL)
    const appOrigin = window.location.origin
    const apiOrigin = apiUrl.origin

    if (appOrigin === apiOrigin) return false

    if (getEnvironment() === 'prod') {
      const appHost = window.location.hostname.toLowerCase()
      const apiHost = apiUrl.hostname.toLowerCase()
      if (isGalRunHost(appHost) && isGalRunHost(apiHost)) {
        return false
      }
    }

    return true
  } catch {
    return false
  }
}

function getAuthHeaders(): HeadersInit {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
  }

  if (isCrossOriginFallback()) {
    let localToken: string | null = null
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localToken = localStorage.getItem('gal_auth_token')
      }
    } catch {
      // Ignore localStorage errors
    }

    if (localToken) {
      headers['Authorization'] = `Bearer ${localToken}`
    }
  }

  return headers
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = !options.signal && timeoutMs > 0 ? new AbortController() : undefined
  const timeoutId = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : undefined

  try {
    return await fetch(url, {
      ...options,
      signal: controller?.signal ?? options.signal,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error(`Request timeout: ${url} did not respond within ${timeoutMs / 1000} seconds`)
    }
    throw error
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }
  }
}

async function fetchAuth(
  path: string,
  options: RequestInit = {},
  timeoutMs: number = DEFAULT_REQUEST_TIMEOUT_MS,
): Promise<Response> {
  return fetchWithTimeout(
    `${API_BASE_URL}${path}`,
    {
      ...options,
      headers: {
        ...getAuthHeaders(),
        ...options.headers,
      },
      credentials: 'include',
    },
    timeoutMs,
  )
}

export const authApi = {
  get baseUrl(): string {
    return API_BASE_URL
  },

  getLoginUrl(redirect?: string, forceSelect?: boolean): string {
    const url = new URL(`${API_BASE_URL}/auth/github`)
    if (redirect) {
      url.searchParams.set('redirect', redirect)
    }
    if (forceSelect) {
      url.searchParams.set('force_select', 'true')
    }
    return url.toString()
  },

  async getAuthStatus(): Promise<AuthStatus> {
    try {
      const response = await fetchAuth('/auth/status', {}, FAST_STATUS_TIMEOUT_MS)
      if (!response.ok) {
        return { configured: false, user: null }
      }
      return response.json()
    } catch {
      return { configured: false, user: null }
    }
  },

  async logout(): Promise<void> {
    await fetchAuth('/auth/logout', {
      method: 'POST',
    })
  },

  async registerWithEmail(email: string, password: string): Promise<{
    success: boolean
    message?: string
    userId?: string
    error?: string
    errorCode?: string
  }> {
    try {
      const response = await fetchAuth('/auth/email/register', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      return response.json()
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Registration failed',
        errorCode: 'network_error',
      }
    }
  },

  async loginWithEmail(email: string, password: string): Promise<{
    success: boolean
    user?: User
    error?: string
    errorCode?: string
    sessionToken?: string
  }> {
    try {
      const response = await fetchAuth('/auth/email/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      })
      const data = await response.json()

      if (isCrossOriginFallback() && data.sessionToken) {
        try {
          localStorage.setItem('gal_auth_token', data.sessionToken)
        } catch {
          // Ignore localStorage errors
        }
      }

      return data
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Login failed',
        errorCode: 'network_error',
      }
    }
  },

  async requestPasswordReset(email: string): Promise<{
    success: boolean
    message?: string
  }> {
    try {
      const response = await fetchAuth('/auth/email/reset-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      })
      return response.json()
    } catch {
      return { success: true, message: 'If an account exists, a password reset link has been sent.' }
    }
  },

  async resendVerificationEmail(email: string): Promise<{
    success: boolean
    message?: string
    error?: string
    errorCode?: string
  }> {
    try {
      const response = await fetchAuth('/auth/email/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email }),
      })
      return response.json()
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to resend verification',
        errorCode: 'network_error',
      }
    }
  },
}
