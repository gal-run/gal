import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import * as jose from 'jose'
import { isTrustedBearerFallbackHost } from './lib/auth-hosts'

// Public routes that don't require authentication
const PUBLIC_ROUTES = ['/login', '/signup', '/forgot-password', '/auth/error']

// JWT configuration (must match API's AuthService)
const JWT_ISSUERS = ['gal-run-api', 'gal-api']
const CLOCK_SKEW_BUFFER_SECONDS = 60 // Allow 60 seconds of clock skew

/**
 * Result of JWT validation
 */
interface JwtValidationResult {
  valid: boolean
  expired?: boolean
  payload?: jose.JWTPayload
  error?: string
}

/**
 * Validate a JWT session token.
 *
 * This function verifies the JWT signature using JWT_SECRET, checks the issuer,
 * and validates the expiration claim with a small clock skew buffer.
 *
 * @param token - The JWT token string to validate
 * @param jwtSecret - The secret key for verification
 * @returns Validation result with payload if valid
 */
async function validateSessionJwt(token: string, jwtSecret: string): Promise<JwtValidationResult> {
  try {
    const secretKey = new TextEncoder().encode(jwtSecret)

    for (const issuer of JWT_ISSUERS) {
      try {
        const { payload } = await jose.jwtVerify(token, secretKey, {
          issuer,
          algorithms: ['HS256'],
          clockTolerance: CLOCK_SKEW_BUFFER_SECONDS,
        })

        return { valid: true, payload }
      } catch (err) {
        if (err instanceof jose.errors.JWTClaimValidationFailed) {
          continue
        }
        if (err instanceof jose.errors.JWSSignatureVerificationFailed) {
          continue
        }
        throw err
      }
    }

    return { valid: false, error: 'Invalid issuer' }
  } catch (err) {
    if (err instanceof jose.errors.JWTExpired) {
      return { valid: false, expired: true, error: 'Token expired' }
    }
    if (err instanceof jose.errors.JWTInvalid) {
      return { valid: false, error: 'Invalid token format' }
    }
    if (err instanceof jose.errors.JWSSignatureVerificationFailed) {
      return { valid: false, error: 'Invalid signature' }
    }
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    return { valid: false, error: errorMessage }
  }
}

/**
 * Validate that the Next-Router-State-Tree header can be parsed.
 *
 * WORKAROUND: Cloud Run CDN corrupts Next-Router-State-Tree on
 * custom domains. Safe to remove when corruption is no longer observed.
 * Track: https://github.com/firebase/firebase-tools/issues/7265
 *
 * Next.js App Router sends this header as URL-encoded JSON during client-side
 * navigations (RSC requests). When a CDN or reverse proxy corrupts the header
 * value — by double-encoding, truncating, or stripping special characters —
 * the Next.js server fails with:
 *
 *   "The router state header was sent but could not be parsed." (error #10)
 *
 * If the header is present but cannot be parsed, we return false so the
 * middleware can strip the RSC-related headers and force a clean full-page
 * render instead of a 500 error.
 */
function isRouterStateHeaderValid(request: NextRequest): boolean {
  const stateHeader = request.headers.get('next-router-state-tree')
  if (!stateHeader) return true // no header = normal page request, fine

  // Try parsing raw first (header may already be decoded by the proxy),
  // then fall back to URL-decode + parse (the standard Next.js path).
  try {
    JSON.parse(stateHeader)
    return true
  } catch {
    try {
      JSON.parse(decodeURIComponent(stateHeader))
      return true
    } catch {
      return false
    }
  }
}

/**
 * Generate a cryptographically random base64 nonce for Content-Security-Policy.
 * Uses the Web Crypto API which is available in both Edge and Node.js runtimes.
 */
function generateNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...Array.from(bytes)))
}

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Generate a fresh nonce for every request — used in CSP script-src.
  const nonce = generateNonce()

  // Build the Content-Security-Policy header with the per-request nonce.
  // Replaces the static CSP in next.config.ts so that 'unsafe-inline' can be
  // removed from script-src (nonce allowlists the one legitimate inline script:
  // ThemeScript in layout.tsx).
  // 'unsafe-eval' is kept in development only: Next.js webpack (no --turbopack)
  // wraps modules in eval() for source maps, requiring it in dev.
  // #3967: connect-src includes localhost origins in development.
  const isDev = process.env.NODE_ENV === 'development'
  const connectSrcDev = isDev ? ' http://localhost:3000 ws://localhost:3000' : ''
  const scriptSrcEval = isDev ? " 'unsafe-eval'" : ''
  const csp = [
    "default-src 'self'",
    // apis.google.com is NOT matched by *.googleapis.com — must be listed explicitly (#3989)
    // https://*.firebasedatabase.app is required for RTDB long-polling fallback (.lp script injection)
    `script-src 'self' 'nonce-${nonce}'${scriptSrcEval} https://*.firebaseapp.com https://*.googleapis.com https://apis.google.com https://*.firebasedatabase.app`,
    `script-src-elem 'self' 'nonce-${nonce}'${scriptSrcEval} https://*.firebaseapp.com https://*.googleapis.com https://apis.google.com https://*.firebasedatabase.app`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    // https://api.gal.run is the production API origin (different from app.gal.run — 'self' does not cover it)
    `connect-src 'self' https://api.gal.run https://*.googleapis.com https://*.firebaseio.com https://*.firebase.com wss://*.firebaseio.com https://*.firebasedatabase.app wss://*.firebasedatabase.app https://*.sentry.io https://*.google-analytics.com https://*.analytics.google.com${connectSrcDev}`,
    // worker-src was in the old static CSP — blob: is needed for workers created from blob URLs
    "worker-src 'self' blob:",
    // https://*.firebasedatabase.app is required for RTDB iframe messaging bridge (long-polling fallback)
    "frame-src https://*.firebaseapp.com https://*.firebasedatabase.app",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')

  /**
   * Finalise a NextResponse by:
   *  1. Threading x-nonce into request headers so Server Components can read
   *     it via `await headers()` from 'next/headers'.
   *  2. Setting the Content-Security-Policy response header for the browser.
   */
  function buildResponse(reqHeaders: Headers): NextResponse {
    reqHeaders.set('x-nonce', nonce)
    const res = NextResponse.next({ request: { headers: reqHeaders } })
    res.headers.set('Content-Security-Policy', csp)
    return res
  }

  // -----------------------------------------------------------------------
  // 0. Demo mode bypass — when NEXT_PUBLIC_DEMO_MODE=true, skip all auth
  //    checks so unauthenticated visitors can browse the live demo freely.
  // -----------------------------------------------------------------------
  const isDemoMode = process.env['NEXT_PUBLIC_DEMO_MODE'] === 'true'
  if (isDemoMode) {
    // Still apply RSC header sanitisation so Next.js renders correctly on
    // Cloud Run CDN (re-use same logic below but return early).
    const headers = new Headers(request.headers)
    if (!isRouterStateHeaderValid(request)) {
      headers.delete('next-router-state-tree')
      headers.delete('next-router-prefetch')
      headers.delete('rsc')
      const url = request.nextUrl.clone()
      url.searchParams.delete('_rsc')
    }
    return buildResponse(headers)
  }

  // -----------------------------------------------------------------------
  // 1. RSC header corruption guard
  //
  // WORKAROUND: Cloud Run CDN corrupts Next-Router-State-Tree on
  // custom domains. When the header is present but malformed, strip all
  // RSC-related headers so Next.js performs a clean full-page render instead
  // of returning a 500 error.
  //
  // Important: We do NOT return early here — the request must still pass
  // through auth checks below. We only sanitise the headers and continue.
  // -----------------------------------------------------------------------
  const requestHeaders = new Headers(request.headers)

  if (!isRouterStateHeaderValid(request)) {
    console.warn('[middleware] Stripped corrupted RSC headers', {
      pathname,
      host: request.headers.get('host'),
      headerLength: request.headers.get('next-router-state-tree')?.length,
    })

    requestHeaders.delete('next-router-state-tree')
    requestHeaders.delete('next-router-prefetch')
    requestHeaders.delete('rsc')
  }

  // -----------------------------------------------------------------------
  // 2. Auth check — allow public routes without a session
  // -----------------------------------------------------------------------
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return buildResponse(requestHeaders)
  }

  // Check for auth session cookie
  const sessionCookie = request.cookies.get('gal_session') || request.cookies.get('connect.sid')

  if (!sessionCookie) {
    // Bearer fallback is only allowed on explicit local/preview hosts.
    const authHeader = request.headers.get('authorization')
    const hasBearerHeader = typeof authHeader === 'string' && authHeader.startsWith('Bearer ')
    const canUseBearerFallback =
      hasBearerHeader && isTrustedBearerFallbackHost(request.nextUrl.hostname)

    if (!canUseBearerFallback) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }

    // Bearer token fallback for trusted hosts - validate the bearer token
    if (hasBearerHeader) {
      const bearerToken = authHeader!.slice(7) // Remove 'Bearer ' prefix
      const jwtSecret = process.env.JWT_SECRET

      if (!jwtSecret) {
        // Missing JWT_SECRET in dev - skip validation but log warning
        if (process.env.NODE_ENV === 'development') {
          console.warn('[middleware] JWT_SECRET not set - skipping token validation in development')
        }
      } else {
        const result = await validateSessionJwt(bearerToken, jwtSecret)
        if (!result.valid) {
          const loginUrl = new URL('/login', request.url)
          loginUrl.searchParams.set('redirect', pathname)
          return NextResponse.redirect(loginUrl)
        }
      }
    }
  } else {
    // Validate the session JWT token
    const jwtSecret = process.env.JWT_SECRET

    if (!jwtSecret) {
      // Missing JWT_SECRET in dev - skip validation but log warning
      if (process.env.NODE_ENV === 'development') {
        console.warn('[middleware] JWT_SECRET not set - skipping token validation in development')
      }
    } else {
      const result = await validateSessionJwt(sessionCookie.value, jwtSecret)

      if (!result.valid) {
        // Invalid or expired token - redirect to login
        const loginUrl = new URL('/login', request.url)
        loginUrl.searchParams.set('redirect', pathname)
        if (result.expired) {
          loginUrl.searchParams.set('reason', 'session_expired')
        }
        return NextResponse.redirect(loginUrl)
      }
    }
  }

  return buildResponse(requestHeaders)
}

export const config = {
  matcher: [
    /*
     * Match all routes except:
     *  - _next/static  (static file chunks)
     *  - _next/image   (image optimisation endpoint)
     *  - favicon.ico   (browser default favicon request)
     *  - favicon.svg   (custom SVG favicon)
     *  - monitoring    (Sentry tunnel route — bypasses ad blockers)
     *  - api           (API routes)
     *
     * NOTE: The previous matcher only excluded favicon.svg, meaning
     * favicon.ico requests hit the middleware, failed auth, redirected to
     * /login, and triggered the RSC header parse error. Now both are
     * excluded.
     */
    '/((?!_next/static|_next/image|favicon\\.ico|favicon\\.svg|monitoring|api|health).*)',
  ],
}
