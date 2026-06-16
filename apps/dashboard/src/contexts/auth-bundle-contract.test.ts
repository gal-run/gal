import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const authContextSource = readFileSync(
  join(__dirname, 'AuthContext.tsx'),
  'utf8',
)

const loginPageSource = readFileSync(
  join(__dirname, '..', 'app', '(auth)', 'login', 'page.tsx'),
  'utf8',
)

const signupPageSource = readFileSync(
  join(__dirname, '..', 'app', '(auth)', 'signup', 'page.tsx'),
  'utf8',
)

const forgotPasswordPageSource = readFileSync(
  join(__dirname, '..', 'app', '(auth)', 'forgot-password', 'page.tsx'),
  'utf8',
)

describe('auth bundle contracts', () => {
  it('keeps the public auth path on the auth-only API client', () => {
    for (const source of [authContextSource, loginPageSource, signupPageSource, forgotPasswordPageSource]) {
      expect(source).toContain("from '@/lib/auth-api'")
      expect(source).not.toContain("from '@/lib/api'")
    }
  })
})
