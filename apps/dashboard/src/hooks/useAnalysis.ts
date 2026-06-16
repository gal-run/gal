'use client'

import { useState, useCallback } from 'react'
import { api, type AnalysisResponse } from '@/lib/api'

export function useAnalysis() {
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<AnalysisResponse | null>(null)
  const [error, setError] = useState<string | null>(null)

  const analyze = useCallback(async (configs: { file: string; content: string }[]) => {
    setAnalyzing(true)
    setError(null)
    setResult(null)
    try {
      const response = await api.analyzeConfigs(configs)
      if (response) {
        setResult(response)
      } else {
        setError('Analysis service unavailable')
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Analysis failed')
    } finally {
      setAnalyzing(false)
    }
    return result
  }, [result])

  const reset = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  return { analyze, analyzing, result, error, reset }
}
