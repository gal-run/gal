import React from 'react'
import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { BuildProvenanceMeta } from './BuildProvenanceMeta'

describe('BuildProvenanceMeta', () => {
  it('renders nothing — commit SHA and build time are not exposed in HTML (#3886)', () => {
    const markup = renderToStaticMarkup(<BuildProvenanceMeta />)
    expect(markup).toBe('')
    expect(markup).not.toContain('gal-build-commit')
    expect(markup).not.toContain('gal-build-time')
  })
})
