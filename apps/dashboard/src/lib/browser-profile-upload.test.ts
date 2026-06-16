import { describe, expect, it } from 'vitest'

import {
  analyzeBrowserProfileUpload,
  mergeBrowserProfileUploadDomains,
} from './browser-profile-upload'

describe('browser profile upload helpers', () => {
  it('analyzes storage-state payloads for upload preview', () => {
    const analysis = analyzeBrowserProfileUpload(
      JSON.stringify({
        cookies: [
          { name: 'sid', domain: '.github.com', path: '/', expires: 1_775_633_333 },
          { name: 'api', domain: 'api.github.com', path: '/', expires: -1 },
        ],
        origins: [{ origin: 'https://docs.github.com' }],
      }),
    )

    expect(analysis).toEqual({
      cookieCount: 2,
      originCount: 1,
      inferredDomains: ['api.github.com', 'docs.github.com', 'github.com'],
      earliestExpiry: 1_775_633_333,
    })
  })

  it('merges typed and inferred domains into a normalized list', () => {
    expect(
      mergeBrowserProfileUploadDomains(
        'GitHub.com, support.github.com',
        ['docs.github.com', 'github.com'],
      ),
    ).toEqual(['docs.github.com', 'github.com', 'support.github.com'])
  })
})
