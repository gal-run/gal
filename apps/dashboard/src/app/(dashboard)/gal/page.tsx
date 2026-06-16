'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { Zap } from 'lucide-react'
import { useSelectedWorkspace } from '@/hooks/useSelectedWorkspace'
import { api } from '@/lib/api'

interface Decision {
  id: string
  ts: number
  command: string
  decision: string
  confidence: number
  bucket: string
}

interface Stats {
  model: string
  total: number
  clears: number
  holds: number
  avg_confidence: number
}

const SCENARIOS = [
  { label: 'ls -la', features: { evidence_complete: true, latency_measured: true, approval_refs_complete: true, detection_count: 0 } },
  { label: 'rm -rf', features: { evidence_complete: true, operator_review_required: true, latency_measured: true, approval_refs_complete: true, detection_count: 1 } },
  { label: 'curl|bash', features: { vehicles_present: true, evidence_complete: true, operator_review_required: true, latency_measured: true, approval_refs_complete: true, detection_count: 1 } },
  { label: 'task', features: { people_present: true, evidence_complete: true, latency_measured: true, approval_refs_complete: true, detection_count: 0 } },
]

export default function GalPage() {
  const selectedWorkspace = useSelectedWorkspace()
  const orgName = selectedWorkspace ?? null
  const [feed, setFeed] = useState<Decision[]>([])
  const [stats, setStats] = useState<Stats>({ model: '', total: 0, clears: 0, holds: 0, avg_confidence: 0 })
  const [loading, setLoading] = useState(false)
  const feedRef = useRef<HTMLDivElement>(null)

  const infer = useCallback(async (features: any) => {
    setLoading(true)
    try {
      const res = await api.fetchWithAuth(`${api.baseUrl}/gal/infer?org=${encodeURIComponent(orgName ?? '')}`, { method: 'POST', body: JSON.stringify({ features }) })
      const data = await res.json()
      const entry: Decision = { id: String(Date.now()), ts: Date.now(), command: 'manual', decision: data.decision, confidence: data.confidence, bucket: data.calibration_bucket }
      setFeed(prev => [entry, ...prev].slice(0, 200))
      setStats(prev => ({ ...prev, total: prev.total + 1, clears: prev.clears + (data.decision === 'clear_for_operator_review' ? 1 : 0), holds: prev.holds + (data.decision === 'hold_for_operator_review' ? 1 : 0) }))
    } catch {}
    setLoading(false)
  }, [orgName])

  const simulate = useCallback(async () => {
    try { await api.fetchWithAuth(`${api.baseUrl}/gal/simulate?org=${encodeURIComponent(orgName ?? '')}`, { method: 'POST' }) } catch {}
  }, [orgName])

  useEffect(() => {
    if (!orgName) return
    api.fetchWithAuth(`${api.baseUrl}/gal/stats?org=${encodeURIComponent(orgName)}`).then(r => r.json()).then(s => setStats(s)).catch(() => {})
    const base = api.baseUrl.replace(/\/$/, '')
    const es = new EventSource(`${base}/gal/events?org=${encodeURIComponent(orgName)}`)
    es.onmessage = (e) => {
      const d = JSON.parse(e.data)
      if (d.id) {
        setFeed(prev => [d, ...prev].slice(0, 200))
        setStats(prev => ({ ...prev, total: prev.total + 1, clears: prev.clears + (d.decision === 'clear_for_operator_review' ? 1 : 0), holds: prev.holds + (d.decision === 'hold_for_operator_review' ? 1 : 0) }))
      }
    }
    return () => es.close()
  }, [orgName])

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">GAL</h1>
          <p className="text-sm text-muted-foreground">{stats.model || 'gal-model://gal/v1.2'}</p>
        </div>
        <div className="flex gap-3">
          {SCENARIOS.map(s => (
              <button key={s.label} onClick={() => infer(s.features)} disabled={loading}
              className="flex items-center gap-1 rounded border border-gray-700 px-3 py-1.5 text-xs hover:bg-gray-800 disabled:opacity-50">{s.label}</button>
          ))}
          <button onClick={simulate}
            className="flex items-center gap-1 rounded bg-purple-600 px-3 py-1.5 text-xs text-white hover:bg-purple-700"><Zap size={12} /> Simulate</button>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-4">
        {[{ l: 'Total', v: stats.total }, { l: 'Clear', v: stats.clears, c: 'text-green-500' }, { l: 'Hold', v: stats.holds, c: 'text-red-500' }, { l: 'Avg Conf', v: stats.total ? (stats.clears / stats.total * 0.95).toFixed(3) : '-' }].map(s => (
          <div key={s.l} className="rounded-lg border border-gray-800 bg-gray-900/50 p-4">
            <div className="text-xs text-gray-500">{s.l}</div>
            <div className={`mt-1 text-2xl font-bold ${s.c || ''}`}>{s.v}</div>
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-gray-800" ref={feedRef}>
        <div className="border-b border-gray-800 px-4 py-2 text-xs text-gray-500">Live decisions</div>
        <div className="max-h-[500px] overflow-y-auto">
          {feed.length === 0 ? (
            <div className="p-8 text-center text-sm text-gray-600">No decisions yet. Click a scenario or Simulate.</div>
          ) : (
            feed.map((d, i) => (
              <div key={d.id || i} className="flex items-center gap-3 border-b border-gray-800/50 px-4 py-2 text-sm hover:bg-gray-800/30">
                <span className={`min-w-[65px] text-xs font-semibold ${d.decision === 'clear_for_operator_review' ? 'text-green-500' : 'text-red-500'}`}>
                  {d.decision === 'clear_for_operator_review' ? 'CLEAR' : 'HOLD'}
                </span>
                <span className="flex-1 font-mono text-xs text-gray-500">{d.command}</span>
                <span className="text-xs text-gray-600">{d.confidence.toFixed(4)}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase ${d.bucket === 'high' ? 'bg-green-500/10 text-green-500' : d.bucket === 'medium' ? 'bg-yellow-500/10 text-yellow-500' : 'bg-red-500/10 text-red-500'}`}>{d.bucket}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
