import { useEffect, useRef } from 'react'

/**
 * Session SSE stream handlers (#6568).
 *
 * Payloads mirror the server-side emit in apps/api/src/routes/session-sse-routes.ts:
 *   - connected     { sessionId, bufferedOutput, bufferedMessages }
 *   - output        { data, sequence, timestamp }
 *   - message       { message: <structured payload>, sequence, timestamp }
 *   - status_change { status }
 *   - heartbeat     { ts }
 *   - done          { reason }
 */
export interface SessionStreamHandlers {
  onConnected?: (payload: {
    sessionId: string
    bufferedOutput: string
    bufferedMessages: Record<string, unknown>[]
  }) => void
  onOutput?: (payload: { data: string; sequence: number; timestamp: number }) => void
  onMessage?: (payload: {
    message: Record<string, unknown>
    sequence: number
    timestamp: number
  }) => void
  onStatusChange?: (payload: { status: string }) => void
  onDone?: (payload: { reason: string }) => void
}

/**
 * Subscribe to a session's SSE stream (#6568).
 *
 * Replaces direct RTDB `onChildAdded` subscriptions on `sessions/{id}/output/*`
 * so the dashboard live-tail gets the full NATS-backed stream without being
 * subject to the 512 KB RTDB session-log cap.
 *
 * Returns nothing — the EventSource is owned by the hook and closed on
 * unmount / sessionId change. Consumers receive events via the handlers ref.
 *
 * Gracefully no-ops when the SSE endpoint returns 404 (STREAM_BACKEND=rtdb),
 * letting callers keep their existing RTDB fallback in parallel.
 */
export function useSessionStream(
  sessionId: string | null | undefined,
  handlers: SessionStreamHandlers,
): void {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (!sessionId) return

    const apiBase = process.env['NEXT_PUBLIC_API_URL'] || ''
    const url = `${apiBase}/api/sessions/${sessionId}/stream`
    const es = new EventSource(url, { withCredentials: true })

    es.onmessage = (evt) => {
      try {
        const data = JSON.parse(evt.data) as { type?: string } & Record<string, unknown>
        switch (data.type) {
          case 'connected':
            handlersRef.current.onConnected?.({
              sessionId: String(data['sessionId'] ?? ''),
              bufferedOutput: String(data['bufferedOutput'] ?? ''),
              bufferedMessages: Array.isArray(data['bufferedMessages'])
                ? (data['bufferedMessages'] as Record<string, unknown>[])
                : [],
            })
            break
          case 'output':
            handlersRef.current.onOutput?.({
              data: String(data['data'] ?? ''),
              sequence: Number(data['sequence'] ?? 0),
              timestamp: Number(data['timestamp'] ?? 0),
            })
            break
          case 'message':
            if (data['message'] && typeof data['message'] === 'object') {
              handlersRef.current.onMessage?.({
                message: data['message'] as Record<string, unknown>,
                sequence: Number(data['sequence'] ?? 0),
                timestamp: Number(data['timestamp'] ?? 0),
              })
            }
            break
          case 'status_change':
            handlersRef.current.onStatusChange?.({ status: String(data['status'] ?? '') })
            break
          case 'done':
            handlersRef.current.onDone?.({ reason: String(data['reason'] ?? '') })
            break
          default:
            // heartbeat and unknown types: ignore
            break
        }
      } catch {
        // malformed SSE frame — ignore
      }
    }

    es.onerror = () => {
      // EventSource auto-reconnects on network errors. A 404 (SSE disabled)
      // closes the connection immediately; callers should keep their RTDB
      // fallback running in parallel.
    }

    return () => {
      es.close()
    }
  }, [sessionId])
}
