import {
  normalizeBrowserProfileDomains,
  parseBrowserProfileStorageState,
  summarizeBrowserProfileStorageState,
  type BrowserProfileStorageStateSummary,
} from '@gal/core'

export interface BrowserProfileUploadAnalysis
  extends BrowserProfileStorageStateSummary {}

export function analyzeBrowserProfileUpload(
  rawStorageState: string,
): BrowserProfileUploadAnalysis {
  const parsed = parseBrowserProfileStorageState(rawStorageState)
  return summarizeBrowserProfileStorageState(parsed)
}

export function mergeBrowserProfileUploadDomains(
  rawDomainsInput: string,
  inferredDomains: string[],
): string[] {
  const typedDomains = rawDomainsInput
    .split(',')
    .map((domain) => domain.trim())
    .filter(Boolean)

  return normalizeBrowserProfileDomains([
    ...typedDomains,
    ...inferredDomains,
  ])
}
