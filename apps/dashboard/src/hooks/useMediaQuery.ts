'use client'

import { useState, useEffect } from 'react'

/**
 * Custom hook to track media query matches
 * @param query - CSS media query string (e.g., '(max-width: 767px)')
 * @returns boolean indicating if the media query matches
 */
export function useMediaQuery(query: string): boolean {
  // #3990: Use SSR-safe initial value (false) to prevent React hydration mismatch.
  // The lazy initializer that read window.matchMedia caused error #418 because the
  // server always rendered false while the client could render true. We now set the
  // correct value in a useEffect (two-pass render) so server and client initial HTML
  // remain identical.
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const mql = window.matchMedia(query)
    // Sync initial value after mount (client-only)
    setMatches(mql.matches)
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches)
    mql.addEventListener('change', handler)
    return () => mql.removeEventListener('change', handler)
  }, [query])

  return matches
}
