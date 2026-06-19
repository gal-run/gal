'use client'

import { useState, useEffect, useCallback } from 'react'
import { isDemoMode } from '@/lib/demo-guard'
import {
  DEMO_AGENT_SECURITY_POLICIES,
  DEMO_ENFORCEMENT_COMPLIANCE,
  DEMO_AUDIT_LOGS,
  DEMO_AUDIT_SUMMARY,
  DEMO_SYSTEM_POLICIES,
  DEMO_ENFORCEMENT_EVENTS,
  DEMO_DOMAIN_ACCESS_STATS,
  DEMO_DOMAIN_EXCEPTION_ITEMS,
  DEMO_ENFORCEMENT_HOOKS,
  DEMO_SDLC_STATES,
  DEMO_SDLC_GATES,
  DEMO_SDLC_ENFORCEMENT,
  DEMO_SDLC_COMPLIANCE,
  DEMO_SECURITY_STANDARDS,
  DEMO_TOOL_POLICIES,
} from '@/lib/demo-data'
import {
  api,
  type AgentSecurityPolicyItem,
  type ComplianceStatusResponse,
  type AuditLogsResponse,
  type AuditSummaryResponse,
  type DomainStatsResponse,
  type DomainExceptionItem,
  type EnforcementHookItem,
  type SdlcStateItem,
  type SdlcGateConfig,
  type SdlcEnforcementConfigResponse,
  type SdlcComplianceStatusResponse,
  type SecurityStandardItem,
  type ToolPolicyItem,
  type SystemPolicyItem,
  type EnforcementEventsResponse,
} from '@/lib/api'

// Generic list hook
function useEnforcementList<T>(
  orgName: string | null,
  fetcher: (org: string) => Promise<T[]>,
) {
  const [items, setItems] = useState<T[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!orgName) {
      setItems([])
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const data = await fetcher(orgName)
      setItems(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }, [orgName, fetcher])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { items, loading, error, refresh }
}

// Generic single-object hook
function useEnforcementData<T>(
  orgName: string | null,
  fetcher: (org: string) => Promise<T | null>,
) {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!orgName) {
      setData(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await fetcher(orgName)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch data')
    } finally {
      setLoading(false)
    }
  }, [orgName, fetcher])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { data, loading, error, refresh }
}

export function useAgentSecurityPolicies(orgName: string | null) {
  const fetchPolicies = useCallback(
    (org: string) => {
      if (isDemoMode()) return Promise.resolve(DEMO_AGENT_SECURITY_POLICIES)
      return api.getAgentSecurityPolicies(org)
    },
    [],
  )
  return useEnforcementList<AgentSecurityPolicyItem>(orgName, fetchPolicies)
}

export function useComplianceStatus(orgName: string | null) {
  const fetcher = useCallback(
    (org: string) => {
      if (isDemoMode()) return Promise.resolve(DEMO_ENFORCEMENT_COMPLIANCE)
      return api.getComplianceStatus(org)
    },
    [],
  )
  return useEnforcementData<ComplianceStatusResponse>(orgName, fetcher)
}

export function useAuditLogs(orgName: string | null, params?: { sessionType?: string; action?: string; severity?: string }) {
  const [data, setData] = useState<AuditLogsResponse>({ entries: [], total: 0, limit: 50, offset: 0 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!orgName) {
      setData({ entries: [], total: 0, limit: 50, offset: 0 })
      setLoading(false)
      return
    }
    if (isDemoMode()) {
      setData(DEMO_AUDIT_LOGS)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await api.getAuditLogs(orgName, params)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch audit logs')
    } finally {
      setLoading(false)
    }
  }, [orgName, params?.sessionType, params?.action, params?.severity])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { ...data, loading, error, refresh }
}

export function useAuditSummary(orgName: string | null) {
  const fetcher = useCallback(
    (org: string) => {
      if (isDemoMode()) return Promise.resolve(DEMO_AUDIT_SUMMARY)
      return api.getAuditSummary(org)
    },
    [],
  )
  return useEnforcementData<AuditSummaryResponse>(orgName, fetcher)
}

export function useDomainAccessStats(orgName: string | null) {
  const fetcher = useCallback(
    (org: string) => {
      if (isDemoMode()) return Promise.resolve(DEMO_DOMAIN_ACCESS_STATS)
      return api.getDomainAccessStats(org)
    },
    [],
  )
  return useEnforcementData<DomainStatsResponse>(orgName, fetcher)
}

export function useDomainExceptions(orgName: string | null) {
  const fetcher = useCallback(
    async (org: string) => {
      if (isDemoMode()) return DEMO_DOMAIN_EXCEPTION_ITEMS
      return (await api.getDomainExceptions(org)).exceptions
    },
    [],
  )
  return useEnforcementList<DomainExceptionItem>(orgName, fetcher)
}

export function useEnforcementHooks(orgName: string | null) {
  const fetcher = useCallback(
    (org: string) => {
      if (isDemoMode()) return Promise.resolve(DEMO_ENFORCEMENT_HOOKS)
      return api.getEnforcementHooks(org)
    },
    [],
  )
  return useEnforcementList<EnforcementHookItem>(orgName, fetcher)
}

export function useSdlcStates(orgName: string | null) {
  const fetcher = useCallback(
    (org: string) => {
      if (isDemoMode()) return Promise.resolve(DEMO_SDLC_STATES)
      return api.getSdlcStates(org)
    },
    [],
  )
  return useEnforcementList<SdlcStateItem>(orgName, fetcher)
}

export function useSdlcGates(orgName: string | null) {
  const fetcher = useCallback(
    (org: string) => {
      if (isDemoMode()) return Promise.resolve(DEMO_SDLC_GATES)
      return api.getSdlcGates(org)
    },
    [],
  )
  return useEnforcementData<SdlcGateConfig>(orgName, fetcher)
}

export function useSdlcEnforcementConfig(orgName: string | null) {
  const fetcher = useCallback(
    (org: string) => {
      if (isDemoMode()) return Promise.resolve(DEMO_SDLC_ENFORCEMENT)
      return api.getSdlcEnforcementConfig(org)
    },
    [],
  )
  return useEnforcementData<SdlcEnforcementConfigResponse>(orgName, fetcher)
}

export function useSdlcCompliance(orgName: string | null) {
  const fetcher = useCallback(
    (org: string) => {
      if (isDemoMode()) return Promise.resolve(DEMO_SDLC_COMPLIANCE)
      return api.getSdlcComplianceStatus(org)
    },
    [],
  )
  return useEnforcementData<SdlcComplianceStatusResponse>(orgName, fetcher)
}

export function useSecurityStandards(orgName: string | null) {
  const fetcher = useCallback(
    (org: string) => {
      if (isDemoMode()) return Promise.resolve(DEMO_SECURITY_STANDARDS)
      return api.getSecurityStandards(org)
    },
    [],
  )
  return useEnforcementList<SecurityStandardItem>(orgName, fetcher)
}

export function useToolPolicies(orgName: string | null) {
  const fetcher = useCallback(
    (org: string) => {
      if (isDemoMode()) return Promise.resolve(DEMO_TOOL_POLICIES)
      return api.getToolPolicies(org)
    },
    [],
  )
  return useEnforcementList<ToolPolicyItem>(orgName, fetcher)
}

export function useSystemPolicies(orgName: string | null) {
  const fetcher = useCallback(
    (org: string) => {
      if (isDemoMode()) return Promise.resolve(DEMO_SYSTEM_POLICIES)
      return api.getSystemPolicies(org)
    },
    [],
  )
  return useEnforcementList<SystemPolicyItem>(orgName, fetcher)
}

export function useEnforcementEvents(orgName: string | null) {
  const [data, setData] = useState<EnforcementEventsResponse>({ events: [], total: 0, limit: 50 })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    if (!orgName) {
      setData({ events: [], total: 0, limit: 50 })
      setLoading(false)
      return
    }
    if (isDemoMode()) {
      setData(DEMO_ENFORCEMENT_EVENTS)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const result = await api.getEnforcementEvents(orgName)
      setData(result)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch events')
    } finally {
      setLoading(false)
    }
  }, [orgName])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { ...data, loading, error, refresh }
}
