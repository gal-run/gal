'use client'

import { useState, useEffect, useCallback } from 'react'
import { api, type ProjectOverride } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-guard'
import { DEMO_PROJECT_OVERRIDES } from '@/lib/demo-data'

export function useProjectOverrides(orgName: string | null, status?: ProjectOverride['status']) {
  const [overrides, setOverrides] = useState<ProjectOverride[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchOverrides = useCallback(async () => {
    if (!orgName) {
      setOverrides([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      if (isDemoMode()) {
        const filtered = status ? DEMO_PROJECT_OVERRIDES.filter(o => o.status === status) : DEMO_PROJECT_OVERRIDES
        setOverrides(filtered)
        setLoading(false)
        return
      }
      const data = await api.getProjectOverrides(orgName, status)
      setOverrides(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch overrides')
    } finally {
      setLoading(false)
    }
  }, [orgName, status])

  useEffect(() => {
    fetchOverrides()
  }, [fetchOverrides])

  return { overrides, loading, error, refresh: fetchOverrides }
}

export function useCreateOverride(orgName: string | null) {
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createOverride = useCallback(
    async (override: {
      projectName: string
      policyType: ProjectOverride['policyType']
      definition: Record<string, unknown>
    }) => {
      if (!orgName) throw new Error('No organization selected')
      setCreating(true)
      setError(null)
      try {
        const result = await api.createProjectOverride(orgName, override)
        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to create override'
        setError(msg)
        throw err
      } finally {
        setCreating(false)
      }
    },
    [orgName],
  )

  return { createOverride, creating, error }
}

export function useDeleteOverride(orgName: string | null) {
  const [deleting, setDeleting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const deleteOverride = useCallback(
    async (overrideId: string) => {
      if (!orgName) throw new Error('No organization selected')
      setDeleting(true)
      setError(null)
      try {
        const success = await api.deleteProjectOverride(orgName, overrideId)
        if (!success) throw new Error('Failed to delete override')
        return true
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to delete override'
        setError(msg)
        throw err
      } finally {
        setDeleting(false)
      }
    },
    [orgName],
  )

  return { deleteOverride, deleting, error }
}

export function useReviewOverride(orgName: string | null) {
  const [reviewing, setReviewing] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const reviewOverride = useCallback(
    async (overrideId: string, action: 'approve' | 'reject', reason?: string) => {
      if (!orgName) throw new Error('No organization selected')
      setReviewing(true)
      setError(null)
      try {
        const result = await api.reviewProjectOverride(orgName, overrideId, action, reason)
        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to review override'
        setError(msg)
        throw err
      } finally {
        setReviewing(false)
      }
    },
    [orgName],
  )

  return { reviewOverride, reviewing, error }
}
