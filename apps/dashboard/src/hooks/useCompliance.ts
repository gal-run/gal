'use client'

import { useState, useCallback } from 'react'
import { api } from '@/lib/api'

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

export interface ComplianceIssue {
  severity: 'low' | 'medium' | 'high' | 'critical'
  type: string
  description: string
  location?: string
  recommendation: string
  evidence?: string
  affectedPlatforms?: string[]
  affectedRepos?: string[]
}

export interface MissingHookReport {
  repoName: string
  platform: string
  missingHookTypes: string[]
  hasSafetyHook: boolean
  recommendation: string
}

export interface VersionDriftReport {
  commandName: string
  platform: string
  versions: {
    repoName: string
    contentHash: string
    contentLength: number
    version: number
  }[]
  driftSeverity: 'low' | 'medium' | 'high' | 'critical'
  recommendation: string
}

export interface CrossPlatformGapReport {
  configName: string
  configType: 'command' | 'rule' | 'hook' | 'settings'
  presentIn: {
    platform: string
    repoName: string
  }[]
  missingIn: string[]
  recommendation: string
}

export interface ComplianceReport {
  workspaceName: string
  scannedAt: string
  issues: ComplianceIssue[]
  missingHooks: MissingHookReport[]
  versionDrift: VersionDriftReport[]
  crossPlatformGaps: CrossPlatformGapReport[]
  overallComplianceScore: number
  passed: boolean
}

export interface FixSuggestion {
  type: 'add_hook' | 'sync_command' | 'sync_rule' | 'update_settings'
  targetRepo: string
  targetPlatform: string
  fileName: string
  content: string
  sourceRepo?: string
  sourcePlatform?: string
  description: string
}

export interface FixReport {
  workspaceName: string
  generatedAt: string
  fixes: FixSuggestion[]
  totalFixes: number
  byType: {
    add_hook: number
    sync_command: number
    sync_rule: number
    update_settings: number
  }
}

export function useCompliance() {
  const [loading, setLoading] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [report, setReport] = useState<ComplianceReport | null>(null)
  const [fixes, setFixes] = useState<FixReport | null>(null)

  const getHeaders = useCallback(() => {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    }
    const token = api.getAuthToken()
    if (token) {
      headers['Authorization'] = `Bearer ${token}`
    }
    return headers
  }, [])

  // Get compliance report (cached or fresh)
  const getComplianceReport = useCallback(async (workspaceName: string, forceRefresh = false) => {
    setLoading(true)
    setError(null)

    try {
      const url = `${API_URL}/workspaces/${workspaceName}/compliance${forceRefresh ? '?refresh=true' : ''}`
      const response = await fetch(url, {
        headers: getHeaders(),
      })

      if (!response.ok) {
        throw new Error(`Failed to get compliance report: ${response.statusText}`)
      }

      const data = await response.json()
      setReport(data.report)
      return data.report
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      return null
    } finally {
      setLoading(false)
    }
  }, [getHeaders])

  // Run a new compliance scan
  const runComplianceScan = useCallback(async (workspaceName: string) => {
    setScanning(true)
    setError(null)

    try {
      const response = await fetch(`${API_URL}/workspaces/${workspaceName}/compliance/scan`, {
        method: 'POST',
        headers: getHeaders(),
      })

      if (!response.ok) {
        throw new Error(`Failed to run compliance scan: ${response.statusText}`)
      }

      const data = await response.json()
      setReport(data.report)
      return data.report
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      return null
    } finally {
      setScanning(false)
    }
  }, [getHeaders])

  // Generate fixes for compliance issues
  const generateFixes = useCallback(async (workspaceName: string) => {
    setLoading(true)
    setError(null)

    try {
      const response = await fetch(`${API_URL}/workspaces/${workspaceName}/fixes/generate`, {
        method: 'POST',
        headers: getHeaders(),
      })

      if (!response.ok) {
        throw new Error(`Failed to generate fixes: ${response.statusText}`)
      }

      const data = await response.json()
      setFixes(data.fixes)
      return data.fixes
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      return null
    } finally {
      setLoading(false)
    }
  }, [getHeaders])

  // Reset state
  const reset = useCallback(() => {
    setReport(null)
    setFixes(null)
    setError(null)
  }, [])

  return {
    loading,
    scanning,
    error,
    report,
    fixes,
    getComplianceReport,
    runComplianceScan,
    generateFixes,
    reset,
  }
}
