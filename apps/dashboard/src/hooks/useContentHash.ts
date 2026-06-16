'use client'

/**
 * useContentHash Hook
 *
 * Task T9: Create useContentHash Hook (FR-015, FR-019)
 *
 * Uses browser SubtleCrypto API for SHA-256 hashing with whitespace normalization.
 */

import { useCallback } from 'react'

export interface UseContentHash {
  computeHash: (content: string) => Promise<string>
}

export function useContentHash(): UseContentHash {
  const computeHash = useCallback(async (content: string): Promise<string> => {
    if (!content) {
      return ''
    }

    try {
      // Normalize whitespace before hashing (FR-019)
      const normalized = content.replace(/\s+/g, ' ').trim()

      // Use SubtleCrypto for SHA-256
      const encoder = new TextEncoder()
      const data = encoder.encode(normalized)
      const hashBuffer = await crypto.subtle.digest('SHA-256', data)

      // Convert to hex string
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
    } catch (error) {
      console.error('Failed to compute content hash:', error)
      return ''
    }
  }, [])

  return { computeHash }
}
