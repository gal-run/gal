import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

import { LoginRedirectState } from './login-redirect-state'

describe('LoginRedirectState', () => {
  it('renders an explicit redirect state for authenticated users (#5543)', () => {
    const markup = renderToStaticMarkup(<LoginRedirectState />)

    expect(markup).toContain('Redirecting to your dashboard...')
    expect(markup).toContain('We found an active session.')
    expect(markup).toContain('data-testid="login-redirect-state"')
    expect(markup).not.toBe('')
  })
})
