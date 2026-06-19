'use client'

import { useState, useEffect, useCallback } from 'react'
import {
  api,
  type ToolComplianceStatusResponse,
  type ToolComplianceDriftResponse,
  type ToolExceptionsResponse,
  type ToolException,
  type ToolImpactPreviewResponse,
} from '@/lib/api'
import { isDemoMode } from '@/lib/demo-guard'
import { DEMO_TOOL_COMPLIANCE_STATUS, DEMO_TOOL_EXCEPTIONS } from '@/lib/demo-data'

export function useToolComplianceStatus(orgName: string | null) {
  const [data, setData] = useState<ToolComplianceStatusResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!orgName) {
      setData(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      if (isDemoMode()) {
        setData(DEMO_TOOL_COMPLIANCE_STATUS)
        setLoading(false)
        return
      }
      const result = await api.getToolComplianceStatus(orgName)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch compliance status')
    } finally {
      setLoading(false)
    }
  }, [orgName])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { data, loading, error, refresh: fetch }
}

export function useToolComplianceDrift(orgName: string | null) {
  const [data, setData] = useState<ToolComplianceDriftResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!orgName) {
      setData(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await api.getToolComplianceDrift(orgName)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch drift data')
    } finally {
      setLoading(false)
    }
  }, [orgName])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { data, loading, error, refresh: fetch }
}

export function useToolExceptions(orgName: string | null) {
  const [data, setData] = useState<ToolExceptionsResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetch = useCallback(async () => {
    if (!orgName) {
      setData(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      if (isDemoMode()) {
        setData(DEMO_TOOL_EXCEPTIONS)
        setLoading(false)
        return
      }
      const result = await api.getToolExceptions(orgName)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch exceptions')
    } finally {
      setLoading(false)
    }
  }, [orgName])

  useEffect(() => {
    fetch()
  }, [fetch])

  return { data, loading, error, refresh: fetch }
}

export function useCreateToolException(orgName: string | null) {
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const createException = useCallback(
    async (exception: { repo: string; rule: string; justification: string }): Promise<ToolException | null> => {
      if (!orgName) throw new Error('No organization selected')
      setCreating(true)
      setError(null)
      try {
        const result = await api.createToolException(orgName, exception)
        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to create exception'
        setError(msg)
        throw err
      } finally {
        setCreating(false)
      }
    },
    [orgName],
  )

  return { createException, creating, error }
}

export function useToolImpactPreview(orgName: string | null) {
  const [data, setData] = useState<ToolImpactPreviewResponse | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const preview = useCallback(
    async (denyBaseline: string[]) => {
      if (!orgName) return
      setLoading(true)
      setError(null)
      try {
        const result = await api.getToolImpactPreview(orgName, denyBaseline)
        setData(result)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to compute impact preview')
      } finally {
        setLoading(false)
      }
    },
    [orgName],
  )

  const reset = useCallback(() => {
    setData(null)
    setError(null)
  }, [])

  return { data, loading, error, preview, reset }
}
