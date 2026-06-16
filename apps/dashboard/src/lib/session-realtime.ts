'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { deleteApp, getApp, getApps, initializeApp, type FirebaseApp } from 'firebase/app'
import { getAuth, signInWithCustomToken, type Auth } from 'firebase/auth'
import { connectDatabaseEmulator, getDatabase, type Database } from 'firebase/database'
import { api } from './api'
import {
  databaseURLIsEmulator,
  emulatorHost,
  firebaseConfig,
  isDatabaseConfigured,
} from './firebase'

interface SharedSessionRealtimeClient {
  app: FirebaseApp
  auth: Auth
  database: Database
  ready: Promise<void>
  refs: number
}

const sessionClients = new Map<string, SharedSessionRealtimeClient>()
const emulatorDatabases = new WeakSet<Database>()

/** Maximum number of retry attempts for fetching the realtime custom token */
const MAX_TOKEN_RETRIES = 3
/** Base delay in ms between retries (doubles each attempt) */
const RETRY_BASE_DELAY_MS = 1000

function getSessionAppName(sessionId: string): string {
  return `gal-session-${sessionId}`
}

async function fetchRealtimeCustomToken(sessionId: string): Promise<string> {
  let lastError: Error | null = null

  for (let attempt = 0; attempt < MAX_TOKEN_RETRIES; attempt++) {
    try {
      const response = await api.fetchWithAuth(`${api.baseUrl}/api/sessions/${sessionId}/realtime-token`, {
        method: 'POST',
      })

      if (response.ok) {
        const payload = (await response.json()) as { customToken?: string }
        if (!payload.customToken) {
          throw new Error('Realtime session token missing from API response')
        }
        return payload.customToken
      }

      // Parse error response
      const errorBody = await response.json().catch(() => ({}))
      const errorMessage = errorBody.message || `HTTP ${response.status}`
      const errorCode = errorBody.code || 'UNKNOWN'

      // Don't retry 4xx errors (except 401 which fetchWithAuth already retries)
      if (response.status >= 400 && response.status < 500 && response.status !== 401) {
        throw new Error(`Session access denied: ${errorMessage} (${errorCode})`)
      }

      lastError = new Error(`Realtime token request failed: ${errorMessage} (${errorCode})`)
    } catch (err) {
      if (err instanceof TypeError && err.message.includes('fetch')) {
        // Network error - worth retrying
        lastError = new Error('Network error connecting to API')
      } else if (err instanceof Error && !err.message.startsWith('Realtime token')) {
        // Non-retryable error (e.g. session access denied)
        throw err
      } else {
        lastError = err instanceof Error ? err : new Error(String(err))
      }
    }

    // Wait before retrying (exponential backoff)
    if (attempt < MAX_TOKEN_RETRIES - 1) {
      const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt)
      console.warn(`[session-realtime] Token fetch attempt ${attempt + 1} failed, retrying in ${delay}ms...`)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError || new Error('Failed to authorize realtime session access')
}

function getOrCreateSessionClient(sessionId: string): SharedSessionRealtimeClient {
  const existing = sessionClients.get(sessionId)
  if (existing) {
    existing.refs += 1
    return existing
  }

  if (!isDatabaseConfigured) {
    throw new Error('Firebase Realtime Database not configured')
  }

  const appName = getSessionAppName(sessionId)
  const app = getApps().some((firebaseApp) => firebaseApp.name === appName)
    ? getApp(appName)
    : initializeApp(firebaseConfig, appName)
  const auth = getAuth(app)
  const database = firebaseConfig.databaseURL
    ? getDatabase(app, firebaseConfig.databaseURL)
    : getDatabase(app)

  if (emulatorHost && !databaseURLIsEmulator && !emulatorDatabases.has(database)) {
    const host = emulatorHost.split(':')[0] || '127.0.0.1'
    const port = parseInt(emulatorHost.split(':')[1] || '9000', 10)
    connectDatabaseEmulator(database, host, port)
    emulatorDatabases.add(database)
  }

  const client: SharedSessionRealtimeClient = {
    app,
    auth,
    database,
    refs: 1,
    ready: (async () => {
      const customToken = await fetchRealtimeCustomToken(sessionId)
      if (!auth.currentUser) {
        await signInWithCustomToken(auth, customToken)
      }
    })(),
  }

  sessionClients.set(sessionId, client)
  return client
}

async function releaseSessionClient(sessionId: string): Promise<void> {
  const client = sessionClients.get(sessionId)
  if (!client) return

  client.refs -= 1
  if (client.refs > 0) return

  sessionClients.delete(sessionId)
  try {
    await client.auth.signOut()
  } catch {
    // Ignore cleanup errors - the session-scoped app is about to be deleted.
  }
  try {
    await deleteApp(client.app)
  } catch {
    // Ignore delete failures during unmount cleanup.
  }
}

export async function acquireSessionRealtimeDatabase(sessionId: string): Promise<{
  database: Database
  release: () => Promise<void>
}> {
  const client = getOrCreateSessionClient(sessionId)

  try {
    await client.ready
    return {
      database: client.database,
      release: () => releaseSessionClient(sessionId),
    }
  } catch (error) {
    sessionClients.delete(sessionId)
    try {
      await deleteApp(client.app)
    } catch {
      // Ignore cleanup failures after auth bootstrap errors.
    }
    throw error
  }
}

/** Delay in ms before auto-retrying the hook-level RTDB connection */
const HOOK_RETRY_DELAY_MS = 3000

export function useSessionRealtimeDatabase(sessionId: string) {
  const [database, setDatabase] = useState<Database | null>(null)
  const [isConnecting, setIsConnecting] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const retryCountRef = useRef(0)
  const [retryTrigger, setRetryTrigger] = useState(0)

  const retry = useCallback(() => {
    if (retryCountRef.current >= MAX_TOKEN_RETRIES) return
    retryCountRef.current += 1
    setRetryTrigger((prev) => prev + 1)
  }, [])

  useEffect(() => {
    let cancelled = false
    let release: (() => Promise<void>) | null = null
    let retryTimeout: ReturnType<typeof setTimeout> | null = null

    setDatabase(null)
    setIsConnecting(true)
    setError(null)

    acquireSessionRealtimeDatabase(sessionId)
      .then((client) => {
        if (cancelled) {
          void client.release()
          return
        }

        retryCountRef.current = 0
        release = client.release
        setDatabase(client.database)
        setIsConnecting(false)
      })
      .catch((cause: unknown) => {
        if (cancelled) return
        const message = cause instanceof Error ? cause.message : 'Failed to connect to session stream'
        console.error(`[session-realtime] Connection failed (attempt ${retryCountRef.current + 1}):`, message)
        setError(message)
        setIsConnecting(false)

        // Auto-retry with delay if under the retry limit
        if (retryCountRef.current < MAX_TOKEN_RETRIES) {
          retryTimeout = setTimeout(() => {
            if (!cancelled) {
              retry()
            }
          }, HOOK_RETRY_DELAY_MS)
        }
      })

    return () => {
      cancelled = true
      setDatabase(null)
      if (retryTimeout) {
        clearTimeout(retryTimeout)
      }
      if (release) {
        void release()
      }
    }
  }, [sessionId, retryTrigger, retry])

  return { database, isConnecting, error, retry }
}
