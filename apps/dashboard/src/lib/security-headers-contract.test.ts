import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const dashboardNextConfigSource = readFileSync(
  join(__dirname, '../../next.config.ts'),
  'utf8',
)

// Dashboard CSP is set per-request in middleware.ts (nonce-based, #3876/#3967).
// next.config.ts intentionally omits it — checked below.
const dashboardMiddlewareSource = readFileSync(
  join(__dirname, '../middleware.ts'),
  'utf8',
)

const websiteNextConfigSource = readFileSync(
  join(__dirname, '../../../website/next.config.ts'),
  'utf8',
)

// Website CSP was migrated to middleware.ts (VULN-002 SOC 2 pentest 2026-04-16)
// so 'unsafe-inline' can be dropped from script-src via per-request nonces.
const websiteMiddlewareSource = readFileSync(
  join(__dirname, '../../../website/middleware.ts'),
  'utf8',
)

describe('web security header contracts', () => {
  it('keeps X-Powered-By disabled on dashboard and website Next.js configs (#2583)', () => {
    expect(dashboardNextConfigSource).toContain('poweredByHeader: false')
    expect(websiteNextConfigSource).toContain('poweredByHeader: false')
  })

  it('keeps CSP and baseline security headers configured on dashboard and website surfaces (#2582)', () => {
    // Dashboard: CSP is set per-request in middleware.ts, NOT in next.config.ts (#3876/#3967)
    expect(dashboardNextConfigSource).not.toContain("key: 'Content-Security-Policy'")
    expect(dashboardNextConfigSource).not.toContain("key: 'Content-Security-Policy-Report-Only'")
    expect(dashboardNextConfigSource).toContain('headers: [')
    expect(dashboardNextConfigSource).toContain('...securityHeaders')

    // Dashboard CSP lives in middleware.ts (nonce-based)
    expect(dashboardMiddlewareSource).toContain('Content-Security-Policy')
    // apis.google.com is not matched by *.googleapis.com — must be listed explicitly (#3989)
    expect(dashboardMiddlewareSource).toContain('https://apis.google.com')

    // Website: CSP is now set per-request in middleware.ts (VULN-002) so
    // next.config.ts no longer contains the header key. Nonce-based policy in
    // middleware allows removing 'unsafe-inline' from script-src.
    expect(websiteNextConfigSource).not.toContain("key: 'Content-Security-Policy'")
    expect(websiteNextConfigSource).not.toContain("key: 'Content-Security-Policy-Report-Only'")
    expect(websiteNextConfigSource).toContain('headers: securityHeaders')
    expect(websiteNextConfigSource).toContain("key: 'X-Frame-Options'")

    expect(websiteMiddlewareSource).toContain('Content-Security-Policy')
    expect(websiteMiddlewareSource).toContain("'nonce-")
    // VULN-002: script-src must NOT contain 'unsafe-inline'. The source uses
    // backtick template literals; look at the script-src directive strings
    // specifically (bounded by the template-literal backtick and comma).
    const scriptSrcDirective = websiteMiddlewareSource.match(
      /`script-src[^`]*`/,
    )?.[0]
    expect(scriptSrcDirective).toBeDefined()
    expect(scriptSrcDirective).not.toContain("'unsafe-inline'")
    const scriptSrcElemDirective = websiteMiddlewareSource.match(
      /`script-src-elem[^`]*`/,
    )?.[0]
    expect(scriptSrcElemDirective).toBeDefined()
    expect(scriptSrcElemDirective).not.toContain("'unsafe-inline'")
  })
})
