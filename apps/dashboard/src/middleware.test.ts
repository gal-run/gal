/**
 * Tests for middleware.ts — nonce-based CSP, auth checks, RSC header guard, JWT validation.
 *
 * Follow-up to PR #4099 which introduced nonce-based CSP without tests.
 * Issue: #3876 (nonce CSP), #3967 (connect-src localhost in dev)
 * Issue: #6553 (JWT session validation)
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { NextResponse } from 'next/server'
import * as jose from 'jose'
import { middleware } from './middleware'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeRequest(options: {
  origin?: string
  pathname?: string
  cookies?: Record<string, string>
  headers?: Record<string, string>
} = {}) {
  const url = new URL(options.pathname ?? '/', options.origin ?? 'https://app.gal.run')
  const headers = new Headers(options.headers ?? {})
  const cookies = {
    get: (name: string) =>
      options.cookies?.[name] ? { name, value: options.cookies[name] } : undefined,
  }
  const nextUrl = Object.assign(new URL(url.toString()), {
    clone: () => new URL(url.toString()),
  })
  return {
    nextUrl,
    url: url.toString(),
    headers,
    cookies,
  } as unknown as import('next/server').NextRequest
}

function getCsp(response: NextResponse): string {
  return response.headers.get('Content-Security-Policy') ?? ''
}

function parseScriptSrc(csp: string): string {
  return csp.split(';').find(d => d.trim().startsWith('script-src'))?.trim() ?? ''
}

function parseConnectSrc(csp: string): string {
  return csp.split(';').find(d => d.trim().startsWith('connect-src'))?.trim() ?? ''
}

function parseWorkerSrc(csp: string): string {
  return csp.split(';').find(d => d.trim().startsWith('worker-src'))?.trim() ?? ''
}

const TEST_JWT_SECRET = 'test-jwt-secret-key-for-middleware-tests'
const JWT_ISSUERS = ['gal-run-api', 'gal-api']

async function createTestJwt(payload: jose.JWTPayload, secret: string = TEST_JWT_SECRET): Promise<string> {
  const secretKey = new TextEncoder().encode(secret)
  return new jose.SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .sign(secretKey)
}

async function createValidJwt(issuer: string = 'gal-run-api'): Promise<string> {
  const secretKey = new TextEncoder().encode(TEST_JWT_SECRET)
  return new jose.SignJWT({ sub: 'user-123', email: 'test@example.com' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuer)
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(secretKey)
}

async function createExpiredJwt(issuer: string = 'gal-run-api'): Promise<string> {
  const secretKey = new TextEncoder().encode(TEST_JWT_SECRET)
  return new jose.SignJWT({ sub: 'user-123' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer(issuer)
    .setIssuedAt()
    .setExpirationTime('-1h')
    .sign(secretKey)
}

async function createJwtWithWrongSecret(): Promise<string> {
  const wrongSecret = new TextEncoder().encode('wrong-secret')
  return new jose.SignJWT({ sub: 'user-123' })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuer('gal-run-api')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(wrongSecret)
}

// ---------------------------------------------------------------------------
// CSP nonce
// ---------------------------------------------------------------------------

describe('CSP nonce', () => {
  it('sets Content-Security-Policy on every response', async () => {
    const res = await middleware(makeRequest({ pathname: '/login' }))
    expect(getCsp(res)).toBeTruthy()
  })

  it('includes a nonce in script-src', async () => {
    const res = await middleware(makeRequest({ pathname: '/login' }))
    expect(parseScriptSrc(getCsp(res))).toMatch(/'nonce-[A-Za-z0-9+/=]+'/)
  })

  it('generates a unique nonce per request', async () => {
    const r1 = await middleware(makeRequest({ pathname: '/login' }))
    const r2 = await middleware(makeRequest({ pathname: '/login' }))
    const n1 = parseScriptSrc(getCsp(r1)).match(/'nonce-([^']+)'/)?.[1]
    const n2 = parseScriptSrc(getCsp(r2)).match(/'nonce-([^']+)'/)?.[1]
    expect(n1).toBeTruthy()
    expect(n2).toBeTruthy()
    expect(n1).not.toBe(n2)
  })

  it('nonce is 16-byte base64 (24 chars)', async () => {
    const res = await middleware(makeRequest({ pathname: '/login' }))
    const nonce = parseScriptSrc(getCsp(res)).match(/'nonce-([^']+)'/)?.[1]
    expect(nonce).toMatch(/^[A-Za-z0-9+/=]{24}$/)
  })

  it('does not include unsafe-inline in script-src', async () => {
    const res = await middleware(makeRequest({ pathname: '/login' }))
    expect(parseScriptSrc(getCsp(res))).not.toContain("'unsafe-inline'")
  })

  it('sets object-src to none', async () => {
    const res = await middleware(makeRequest({ pathname: '/login' }))
    expect(getCsp(res)).toContain("object-src 'none'")
  })

  it('does not include unsafe-eval in production', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.resetModules()
    const { middleware: mw } = await import('./middleware')
    const res = await mw(makeRequest({ pathname: '/login' }))
    expect(parseScriptSrc(getCsp(res))).not.toContain("'unsafe-eval'")
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('includes unsafe-eval in development (webpack source maps)', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.resetModules()
    const { middleware: mw } = await import('./middleware')
    const res = await mw(makeRequest({ pathname: '/login' }))
    expect(parseScriptSrc(getCsp(res))).toContain("'unsafe-eval'")
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('includes localhost in connect-src in development (#3967)', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    vi.resetModules()
    const { middleware: mw } = await import('./middleware')
    const res = await mw(makeRequest({ pathname: '/login' }))
    const connectSrc = parseConnectSrc(getCsp(res))
    expect(connectSrc).toContain('http://localhost:3000')
    expect(connectSrc).toContain('ws://localhost:3000')
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('does not include localhost in connect-src in production (#3967)', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.resetModules()
    const { middleware: mw } = await import('./middleware')
    const res = await mw(makeRequest({ pathname: '/login' }))
    expect(parseConnectSrc(getCsp(res))).not.toContain('localhost')
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('includes api.gal.run in connect-src (production API origin, different from app.gal.run)', async () => {
    const res = await middleware(makeRequest({ pathname: '/login' }))
    expect(parseConnectSrc(getCsp(res))).toContain('https://api.gal.run')
  })

  it('includes firebasedatabase.app in connect-src for EU RTDB WebSocket (#4310)', async () => {
    const res = await middleware(makeRequest({ pathname: '/login' }))
    const connectSrc = parseConnectSrc(getCsp(res))
    expect(connectSrc).toContain('https://*.firebasedatabase.app')
    expect(connectSrc).toContain('wss://*.firebasedatabase.app')
  })

  it('includes worker-src with self and blob: (dropped from old CSP in #4099)', async () => {
    const res = await middleware(makeRequest({ pathname: '/login' }))
    const workerSrc = parseWorkerSrc(getCsp(res))
    expect(workerSrc).toContain("'self'")
    expect(workerSrc).toContain('blob:')
  })
})

// ---------------------------------------------------------------------------
// Auth redirect
// ---------------------------------------------------------------------------

describe('auth redirect', () => {
  beforeEach(async () => {
    vi.stubEnv('JWT_SECRET', '')
    vi.stubEnv('NODE_ENV', 'production')
    vi.resetModules()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('allows public routes without a session cookie', async () => {
    const { middleware: mw } = await import('./middleware')
    for (const route of ['/login', '/signup', '/forgot-password', '/auth/error']) {
      const res = await mw(makeRequest({ pathname: route }))
      expect(res.status).toBeLessThan(300)
    }
  })

  it('redirects to /login when no session and no auth header', async () => {
    const { middleware: mw } = await import('./middleware')
    const res = await mw(makeRequest({ pathname: '/dashboard' }))
    expect(res.status).toBeGreaterThanOrEqual(300)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('preserves redirect pathname as URL-encoded param', async () => {
    const { middleware: mw } = await import('./middleware')
    const res = await mw(makeRequest({ pathname: '/dashboard/settings' }))
    const location = res.headers.get('location') ?? ''
    expect(location).toContain('redirect=')
    expect(decodeURIComponent(location)).toContain('/dashboard/settings')
  })

  it('allows request with gal_session cookie (without JWT_SECRET, skips validation)', async () => {
    const { middleware: mw } = await import('./middleware')
    const res = await mw(makeRequest({ pathname: '/dashboard', cookies: { gal_session: 'abc' } }))
    expect(res.status).toBeLessThan(300)
  })

  it('allows request with connect.sid cookie (without JWT_SECRET, skips validation)', async () => {
    const { middleware: mw } = await import('./middleware')
    const res = await mw(makeRequest({ pathname: '/dashboard', cookies: { 'connect.sid': 'abc' } }))
    expect(res.status).toBeLessThan(300)
  })

  it('allows request with authorization header on trusted preview/local hosts', async () => {
    const { middleware: mw } = await import('./middleware')
    const res = await mw(makeRequest({
      origin: 'http://localhost:3000',
      pathname: '/dashboard',
      headers: { authorization: 'Bearer t' },
    }))
    expect(res.status).toBeLessThan(300)
  })

  it('redirects request with authorization header on production hosts', async () => {
    const { middleware: mw } = await import('./middleware')
    const res = await mw(makeRequest({
      pathname: '/dashboard',
      headers: { authorization: 'Bearer t' },
    }))
    expect(res.status).toBeGreaterThanOrEqual(300)
    expect(res.headers.get('location')).toContain('/login')
  })

  it('allows request with authorization header on preview hosts', async () => {
    const { middleware: mw } = await import('./middleware')
    const res = await mw(makeRequest({
      origin: 'https://preview.web.app',
      pathname: '/dashboard',
      headers: { authorization: 'Bearer t' },
    }))
    expect(res.status).toBeLessThan(300)
  })
})

// ---------------------------------------------------------------------------
// RSC header corruption guard
// ---------------------------------------------------------------------------

describe('RSC header corruption guard', () => {
  it('passes valid next-router-state-tree without error', async () => {
    const req = makeRequest({
      pathname: '/login',
      headers: { 'next-router-state-tree': encodeURIComponent(JSON.stringify({ s: 1 })) },
    })
    expect(() => middleware(req)).not.toThrow()
    expect(getCsp(await middleware(req))).toBeTruthy()
  })

  it('handles corrupted next-router-state-tree without throwing', async () => {
    const req = makeRequest({
      pathname: '/login',
      headers: { 'next-router-state-tree': '{corrupted%%not-json' },
    })
    expect(() => middleware(req)).not.toThrow()
  })

  it('still sets CSP when RSC headers are corrupted', async () => {
    const req = makeRequest({
      pathname: '/login',
      headers: { 'next-router-state-tree': '{corrupted%%not-json' },
    })
    expect(getCsp(await middleware(req))).toBeTruthy()
  })
})

// ---------------------------------------------------------------------------
// Demo mode
// ---------------------------------------------------------------------------

describe('demo mode', () => {
  beforeEach(() => { vi.stubEnv('NEXT_PUBLIC_DEMO_MODE', 'true') })
  afterEach(() => { vi.unstubAllEnvs() })

  it('skips auth redirect', async () => {
    const res = await middleware(makeRequest({ pathname: '/dashboard' }))
    expect(res.status).toBeLessThan(300)
  })

  it('still sets CSP', async () => {
    const res = await middleware(makeRequest({ pathname: '/dashboard' }))
    expect(getCsp(res)).toBeTruthy()
    expect(parseScriptSrc(getCsp(res))).toContain("'nonce-")
  })
})

// ---------------------------------------------------------------------------
// JWT session validation (#6553)
// ---------------------------------------------------------------------------

describe('JWT session validation', () => {
  beforeEach(() => {
    vi.stubEnv('JWT_SECRET', TEST_JWT_SECRET)
    vi.stubEnv('NODE_ENV', 'production')
    vi.resetModules()
  })
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  describe('session cookie validation', () => {
    it('allows request with valid JWT in gal_session cookie', async () => {
      const validToken = await createValidJwt()
      const res = await middleware(makeRequest({
        pathname: '/dashboard',
        cookies: { gal_session: validToken },
      }))
      expect(res.status).toBeLessThan(300)
    })

    it('allows request with valid JWT in connect.sid cookie', async () => {
      const validToken = await createValidJwt()
      const res = await middleware(makeRequest({
        pathname: '/dashboard',
        cookies: { 'connect.sid': validToken },
      }))
      expect(res.status).toBeLessThan(300)
    })

    it('accepts gal-run-api issuer', async () => {
      const token = await createValidJwt('gal-run-api')
      const res = await middleware(makeRequest({
        pathname: '/dashboard',
        cookies: { gal_session: token },
      }))
      expect(res.status).toBeLessThan(300)
    })

    it('accepts gal-api issuer', async () => {
      const token = await createValidJwt('gal-api')
      const res = await middleware(makeRequest({
        pathname: '/dashboard',
        cookies: { gal_session: token },
      }))
      expect(res.status).toBeLessThan(300)
    })

    it('redirects to login when JWT is expired', async () => {
      const expiredToken = await createExpiredJwt()
      const res = await middleware(makeRequest({
        pathname: '/dashboard',
        cookies: { gal_session: expiredToken },
      }))
      expect(res.status).toBeGreaterThanOrEqual(300)
      expect(res.headers.get('location')).toContain('/login')
    })

    it('adds reason=session_expired when JWT is expired', async () => {
      const expiredToken = await createExpiredJwt()
      const res = await middleware(makeRequest({
        pathname: '/dashboard',
        cookies: { gal_session: expiredToken },
      }))
      const location = res.headers.get('location') ?? ''
      expect(location).toContain('reason=session_expired')
    })

    it('redirects to login when JWT has invalid signature', async () => {
      const invalidToken = await createJwtWithWrongSecret()
      const res = await middleware(makeRequest({
        pathname: '/dashboard',
        cookies: { gal_session: invalidToken },
      }))
      expect(res.status).toBeGreaterThanOrEqual(300)
      expect(res.headers.get('location')).toContain('/login')
    })

    it('redirects to login when JWT is malformed', async () => {
      const res = await middleware(makeRequest({
        pathname: '/dashboard',
        cookies: { gal_session: 'not.a.valid.jwt' },
      }))
      expect(res.status).toBeGreaterThanOrEqual(300)
      expect(res.headers.get('location')).toContain('/login')
    })

    it('redirects to login when JWT has invalid issuer', async () => {
      const secretKey = new TextEncoder().encode(TEST_JWT_SECRET)
      const invalidIssuerToken = await new jose.SignJWT({ sub: 'user-123' })
        .setProtectedHeader({ alg: 'HS256' })
        .setIssuer('invalid-issuer')
        .setIssuedAt()
        .setExpirationTime('1h')
        .sign(secretKey)

      const res = await middleware(makeRequest({
        pathname: '/dashboard',
        cookies: { gal_session: invalidIssuerToken },
      }))
      expect(res.status).toBeGreaterThanOrEqual(300)
      expect(res.headers.get('location')).toContain('/login')
    })
  })

  describe('bearer token validation (trusted hosts)', () => {
    it('allows request with valid Bearer token on localhost', async () => {
      const validToken = await createValidJwt()
      const res = await middleware(makeRequest({
        origin: 'http://localhost:3000',
        pathname: '/dashboard',
        headers: { authorization: `Bearer ${validToken}` },
      }))
      expect(res.status).toBeLessThan(300)
    })

    it('redirects request with expired Bearer token on localhost', async () => {
      const expiredToken = await createExpiredJwt()
      const res = await middleware(makeRequest({
        origin: 'http://localhost:3000',
        pathname: '/dashboard',
        headers: { authorization: `Bearer ${expiredToken}` },
      }))
      expect(res.status).toBeGreaterThanOrEqual(300)
      expect(res.headers.get('location')).toContain('/login')
    })

    it('redirects request with invalid Bearer token on localhost', async () => {
      const invalidToken = await createJwtWithWrongSecret()
      const res = await middleware(makeRequest({
        origin: 'http://localhost:3000',
        pathname: '/dashboard',
        headers: { authorization: `Bearer ${invalidToken}` },
      }))
      expect(res.status).toBeGreaterThanOrEqual(300)
      expect(res.headers.get('location')).toContain('/login')
    })
  })

  describe('missing JWT_SECRET handling', () => {
    it('logs warning and allows request in development when JWT_SECRET is missing', async () => {
      vi.stubEnv('NODE_ENV', 'development')
      vi.stubEnv('JWT_SECRET', '')
      vi.resetModules()
      const warnSpy = vi.spyOn(console, 'warn')

      const { middleware: mw } = await import('./middleware')
      const res = await mw(makeRequest({
        pathname: '/dashboard',
        cookies: { gal_session: 'any-token' },
      }))

      expect(res.status).toBeLessThan(300)
      expect(warnSpy).toHaveBeenCalledWith(
        '[middleware] JWT_SECRET not set - skipping token validation in development'
      )

      warnSpy.mockRestore()
    })

    it('allows request in production when JWT_SECRET is missing (falls back to cookie existence check)', async () => {
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('JWT_SECRET', '')
      vi.resetModules()

      const { middleware: mw } = await import('./middleware')
      const res = await mw(makeRequest({
        pathname: '/dashboard',
        cookies: { gal_session: 'any-token' },
      }))

      expect(res.status).toBeLessThan(300)
    })
  })
})
