import { describe, expect, it } from 'vitest'

import {
  isGalRunHost,
  isTrustedBearerFallbackHost,
  shouldUseBrowserBearerFallback,
} from './auth-hosts'

describe('auth host allowlists', () => {
  it('treats gal.run hosts as production first-party hosts', () => {
    expect(isGalRunHost('app.gal.run')).toBe(true)
    expect(isGalRunHost('api.gal.run')).toBe(true)
    expect(isGalRunHost('demo.example.com')).toBe(false)
  })

  it('allows bearer fallback only on trusted local or preview hosts', () => {
    expect(isTrustedBearerFallbackHost('localhost')).toBe(true)
    expect(isTrustedBearerFallbackHost('127.0.0.1')).toBe(true)
    expect(isTrustedBearerFallbackHost('preview.web.app')).toBe(true)
    expect(isTrustedBearerFallbackHost('preview.firebaseapp.com')).toBe(true)
    expect(isTrustedBearerFallbackHost('app.gal.run')).toBe(false)
    expect(isTrustedBearerFallbackHost('staging.example.com')).toBe(false)
  })

  it('keeps first-party gal.run deployments cookie-only', () => {
    expect(
      shouldUseBrowserBearerFallback(
        'https://app.gal.run',
        'https://api.gal.run',
      ),
    ).toBe(false)
  })

  it('allows local and preview hosts to use bearer fallback against a different API origin', () => {
    expect(
      shouldUseBrowserBearerFallback(
        'http://localhost:3001',
        'https://api.gal.run',
      ),
    ).toBe(true)

    expect(
      shouldUseBrowserBearerFallback(
        'https://preview.web.app',
        'https://api.gal.run',
      ),
    ).toBe(true)
  })

  it('rejects untrusted custom hosts', () => {
    expect(
      shouldUseBrowserBearerFallback(
        'https://staging.example.com',
        'https://api.gal.run',
      ),
    ).toBe(false)
  })
})
