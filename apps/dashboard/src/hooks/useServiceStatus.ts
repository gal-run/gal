'use client'

import { useState, useEffect, useCallback } from 'react'
import { api } from '@/lib/api'

export interface ServiceStatus {
  api: 'online' | 'offline' | 'checking'
  ai: 'online' | 'offline' | 'checking'
  github: 'connected' | 'not-connected' | 'checking'
}

export function useServiceStatus(pollInterval = 30000) {
  const [status, setStatus] = useState<ServiceStatus>({
    api: 'checking',
    ai: 'checking',
    github: 'checking',
  })
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  const checkStatus = useCallback(async () => {
    const [apiHealth, aiHealth, githubStatus] = await Promise.all([
      api.checkAPIHealth(),
      api.checkAIHealth(),
      api.getGitHubAppStatus(),
    ])

    setStatus({
      api: apiHealth ? 'online' : 'offline',
      ai: aiHealth ? 'online' : 'offline',
      github: githubStatus.installed ? 'connected' : 'not-connected',
    })
    setLastChecked(new Date())
  }, [])

  useEffect(() => {
    // Initial check and periodic polling - checkStatus sets state on mount which is expected
    checkStatus()
    const interval = setInterval(checkStatus, pollInterval)
    return () => clearInterval(interval)
  }, [checkStatus, pollInterval])

  return { status, lastChecked, refresh: checkStatus }
}
