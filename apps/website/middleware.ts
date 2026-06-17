import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

/**
 * VULN-002 SOC 2 pentest (2026-04-16): website Content-Security-Policy had
 * 'unsafe-inline' in script-src. Replace the static CSP in next.config.ts with
 * a per-request nonce-based policy so script-src no longer needs 'unsafe-inline'.
 *
 * Next.js `next/script` components automatically read the `x-nonce` request
 * header and propagate the nonce to every inline script they emit (e.g. GA,
 * GTM, hydration). Server components can also read the nonce via `headers()`.
 *
 * style-src keeps 'unsafe-inline' for now — Next.js/Tailwind emit inline style
 * attributes that would need a larger refactor to nonce or hash. Script XSS is
 * the primary pentest concern; inline-style XSS has a far lower blast radius.
 */
function generateNonce(): string {
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  return btoa(String.fromCharCode(...Array.from(bytes)))
}

export function middleware(request: NextRequest) {
  const nonce = generateNonce()
  const isDev = process.env.NODE_ENV === 'development'
  // Next.js dev server requires 'unsafe-eval' for source-maps and HMR.
  const scriptEval = isDev ? " 'unsafe-eval'" : ''

  const csp = [
    "default-src 'self'",
    // Nonce allowlists our own <Script> tags; GTM is still explicitly listed.
    `script-src 'self' 'nonce-${nonce}'${scriptEval} https://www.googletagmanager.com`,
    `script-src-elem 'self' 'nonce-${nonce}'${scriptEval} https://www.googletagmanager.com`,
    // Kept as-is — Next.js/Tailwind emit inline style attributes (lower XSS risk).
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: https: blob:",
    "font-src 'self' data:",
    "connect-src 'self' https://www.google-analytics.com https://www.googletagmanager.com https://analytics.google.com",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ')

  const reqHeaders = new Headers(request.headers)
  reqHeaders.set('x-nonce', nonce)
  const res = NextResponse.next({ request: { headers: reqHeaders } })
  res.headers.set('Content-Security-Policy', csp)
  return res
}

export const config = {
  matcher: [
    /*
     * Skip static chunks, Next.js image optimiser, favicons, install scripts,
     * and any `/api` routes so the middleware only runs on HTML responses.
     */
    '/((?!_next/static|_next/image|favicon\\.ico|favicon\\.svg|install\\.sh|install\\.ps1|api).*)',
  ],
}
