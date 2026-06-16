// Build provenance meta tags removed (#3886).
// Exposing the exact deployed git SHA in HTML responses allows attackers to
// confirm which CVEs apply to the running version. The meta tags have been
// removed to reduce this information-disclosure surface.

export function BuildProvenanceMeta() {
  return null
}

export const BUILD_PROVENANCE_META_NAMES = {} as const
