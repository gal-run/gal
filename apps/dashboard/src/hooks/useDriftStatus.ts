'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'
import type { DriftStatusReport } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-guard'

const DEMO_DRIFT_REPORTS: DriftStatusReport[] = [
  {
    projectId: 'acme-corp/web-app',
    status: 'in-sync',
    driftedFiles: [],
    lastChecked: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 5 * 60 * 1000).toISOString(),
  },
  {
    projectId: 'acme-corp/api-service',
    status: 'in-sync',
    driftedFiles: [],
    lastChecked: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
  },
  {
    projectId: 'acme-corp/cli',
    status: 'drifted',
    driftedFiles: [{ path: 'CLAUDE.md', type: 'claude-md', changeType: 'modified' }],
    lastChecked: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(),
  },
]

export function useDriftStatus(orgName: string | null | undefined) {
  const [reports, setReports] = useState<DriftStatusReport[]>([])
  const [loading, setLoading] = useState(false)

  const fetchDriftStatus = useCallback(async () => {
    if (!orgName) return
    if (isDemoMode()) {
      setReports(DEMO_DRIFT_REPORTS)
      return
    }
    setLoading(true)
    try {
      const data = await api.getOrgDriftStatus(orgName)
      setReports(data)
    } catch (err) {
      console.error('Failed to fetch drift status:', err)
    } finally {
      setLoading(false)
    }
  }, [orgName])

  useEffect(() => {
    fetchDriftStatus()
  }, [fetchDriftStatus])

  const getProjectDrift = useCallback(
    (projectId: string): DriftStatusReport | undefined =>
      reports.find((r) => r.projectId === projectId),
    [reports]
  )

  return { reports, loading, refresh: fetchDriftStatus, getProjectDrift }
}
