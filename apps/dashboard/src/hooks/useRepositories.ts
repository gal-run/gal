'use client'

import { useState, useEffect, useCallback } from 'react'
import { api, type Repository } from '@/lib/api'
import { isDemoMode } from '@/lib/demo-guard'

const DEMO_REPOSITORIES: Repository[] = [
  { id: '1', name: 'web-app', owner: 'acme-corp', fullName: 'acme-corp/web-app', hasAgentConfigs: true, configCount: 3 },
  { id: '2', name: 'api-service', owner: 'acme-corp', fullName: 'acme-corp/api-service', hasAgentConfigs: true, configCount: 2 },
  { id: '3', name: 'cli', owner: 'acme-corp', fullName: 'acme-corp/cli', hasAgentConfigs: true, configCount: 1 },
  { id: '4', name: 'infra', owner: 'acme-corp', fullName: 'acme-corp/infra', hasAgentConfigs: false, configCount: 0 },
  { id: '5', name: 'data-pipeline', owner: 'acme-corp', fullName: 'acme-corp/data-pipeline', hasAgentConfigs: true, configCount: 2 },
]

export function useRepositories() {
  const [repositories, setRepositories] = useState<Repository[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchRepositories = useCallback(async () => {
    if (isDemoMode()) {
      setRepositories(DEMO_REPOSITORIES)
      setLoading(false)
      return
    }
    setLoading(true)
    setError(null)
    try {
      const repos = await api.getRepositories()
      setRepositories(repos)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch repositories')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchRepositories()
  }, [fetchRepositories])

  return { repositories, loading, error, refresh: fetchRepositories }
}
