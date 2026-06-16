// Portable types for Node.js and browser environments
type PortableCredentials = 'include' | 'omit' | 'same-origin'
type PortableHeadersInit = Record<string, string> | [string, string][] | Headers

export interface HttpClientConfig {
  apiUrl: string
  authToken?: string
  credentials?: PortableCredentials
  timeoutMs?: number
  headers?: Record<string, string>
}

export type HttpFetch = (
  path: string,
  options?: RequestInit
) => Promise<Response>

const DEFAULT_TIMEOUT_MS = 10000
const DEFAULT_CREDENTIALS: PortableCredentials = 'include'

const normalizeHeaders = (headers?: PortableHeadersInit): Record<string, string> => {
  if (!headers) {
    return {}
  }
  if (headers instanceof Headers) {
    return Object.fromEntries(headers.entries())
  }
  if (Array.isArray(headers)) {
    return Object.fromEntries(headers)
  }
  return headers
}

export const createHttpFetch = (config: HttpClientConfig): HttpFetch => {
  return async (path: string, options: RequestInit = {}): Promise<Response> => {
    if (!config.apiUrl) {
      throw new Error('API URL not configured')
    }

    const url = `${config.apiUrl}${path}`

    const mergedHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      ...config.headers,
      ...normalizeHeaders(options.headers as PortableHeadersInit | undefined),
    }

    if (config.authToken) {
      mergedHeaders['Authorization'] = `Bearer ${config.authToken}`
    }

    const credentials = options.credentials ?? config.credentials ?? DEFAULT_CREDENTIALS
    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS

    const controller = !options.signal && timeoutMs > 0 ? new AbortController() : undefined
    const timeout = controller
      ? setTimeout(() => controller.abort(), timeoutMs)
      : undefined

    try {
      const response = await fetch(url, {
        ...options,
        headers: mergedHeaders,
        credentials,
        signal: controller?.signal ?? options.signal,
      })

      if (timeout) {
        clearTimeout(timeout)
      }

      if (!response.ok) {
        let errorMessage = `API request failed: ${response.status} ${response.statusText}`
        try {
          const errorData = (await response.json()) as { error?: string }
          if (errorData?.error) {
            errorMessage = `HTTP ${response.status}: ${errorData.error}`
          }
        } catch {
          // Ignore JSON parse errors
        }
        throw new Error(errorMessage)
      }

      return response
    } catch (error) {
      if (timeout) {
        clearTimeout(timeout)
      }
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error(`API request timed out after ${timeoutMs}ms`)
      }
      throw error
    }
  }
}
