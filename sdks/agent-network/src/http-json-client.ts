import type {
  GalServiceAgentCard,
  GalServiceTask,
  GalServiceTaskCreateRequest,
} from './service-agent.js'

export interface GalHttpJsonFetchResponse {
  ok: boolean
  status: number
  statusText?: string
  headers?: {
    get(name: string): string | null
  }
  text(): Promise<string>
}

export interface GalHttpJsonFetchInit {
  method?: string
  headers?: Record<string, string>
  body?: string
}

export type GalHttpJsonFetch = (
  url: string,
  init?: GalHttpJsonFetchInit,
) => Promise<GalHttpJsonFetchResponse>

export interface GalHttpJsonAgentClientOptions {
  baseUrl: string
  fetch?: GalHttpJsonFetch
  authToken?: string | (() => string | Promise<string>)
  agentCardPath?: string
  taskPath?: string
  defaultHeaders?: Record<string, string>
}

export interface GalHttpJsonRequestOptions {
  requestId?: string
  correlationId?: string
  headers?: Record<string, string>
}

export interface GalHttpJsonTaskResponse {
  task: GalServiceTask
  agentCard?: GalServiceAgentCard
  raw: unknown
}

export interface GalHttpJsonAgentClient {
  getAgentCard(options?: GalHttpJsonRequestOptions): Promise<GalServiceAgentCard>
  createTask(
    request: GalServiceTaskCreateRequest,
    options?: GalHttpJsonRequestOptions,
  ): Promise<GalHttpJsonTaskResponse>
}

export class GalHttpJsonAgentClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly responseBody?: unknown,
    public readonly retryAfter?: string,
  ) {
    super(message)
    this.name = 'GalHttpJsonAgentClientError'
  }
}

export function createGalHttpJsonAgentClient(
  options: GalHttpJsonAgentClientOptions,
): GalHttpJsonAgentClient {
  const baseUrl = normalizeBaseUrl(options.baseUrl)
  const providedFetch =
    options.fetch ??
    (globalThis as { fetch?: GalHttpJsonFetch }).fetch

  if (!providedFetch) {
    throw new Error('A fetch implementation is required for the HTTP/JSON Agent Network client')
  }

  const fetchImpl: GalHttpJsonFetch = providedFetch
  const agentCardPath = normalizePath(options.agentCardPath ?? '/api/agent-network/agent-card')
  const taskPath = normalizePath(options.taskPath ?? '/api/agent-network/tasks')

  async function requestJson(
    path: string,
    init: GalHttpJsonFetchInit,
    requestOptions: GalHttpJsonRequestOptions = {},
  ): Promise<unknown> {
    const headers = await buildHeaders(options, requestOptions)
    const response = await fetchImpl(`${baseUrl}${path}`, {
      ...init,
      headers,
    })
    const responseText = await response.text()
    const parsed = parseJson(responseText)

    if (!response.ok) {
      const code = responseErrorCode(parsed)
      const message = responseErrorMessage(parsed) ?? response.statusText ?? 'Agent Network request failed'
      throw new GalHttpJsonAgentClientError(
        message,
        response.status,
        code,
        parsed,
        response.headers?.get('retry-after') ?? undefined,
      )
    }

    return parsed
  }

  return {
    async getAgentCard(requestOptions) {
      const body = await requestJson(agentCardPath, { method: 'GET' }, requestOptions)
      return normalizeAgentCardResponse(body)
    },

    async createTask(taskRequest, requestOptions) {
      const body = await requestJson(
        taskPath,
        {
          method: 'POST',
          body: JSON.stringify(taskRequest),
        },
        requestOptions,
      )
      return normalizeTaskResponse(body)
    },
  }
}

async function buildHeaders(
  options: GalHttpJsonAgentClientOptions,
  requestOptions: GalHttpJsonRequestOptions,
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/json',
    ...(options.defaultHeaders ?? {}),
    ...(requestOptions.headers ?? {}),
  }
  const token = await resolveAuthToken(options.authToken)

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  if (requestOptions.requestId) {
    headers['X-Request-ID'] = requestOptions.requestId
  }

  if (requestOptions.correlationId) {
    headers['X-Correlation-ID'] = requestOptions.correlationId
  }

  return headers
}

async function resolveAuthToken(
  authToken?: string | (() => string | Promise<string>),
): Promise<string | undefined> {
  if (typeof authToken === 'function') {
    const token = await authToken()
    return token || undefined
  }

  return authToken || undefined
}

function normalizeAgentCardResponse(body: unknown): GalServiceAgentCard {
  if (isRecord(body) && isRecord(body.agentCard)) {
    return body.agentCard as unknown as GalServiceAgentCard
  }

  return body as GalServiceAgentCard
}

function normalizeTaskResponse(body: unknown): GalHttpJsonTaskResponse {
  if (isRecord(body) && isRecord(body.task)) {
    return {
      task: body.task as unknown as GalServiceTask,
      agentCard: isRecord(body.agentCard)
        ? (body.agentCard as unknown as GalServiceAgentCard)
        : undefined,
      raw: body,
    }
  }

  return {
    task: body as GalServiceTask,
    raw: body,
  }
}

function parseJson(text: string): unknown {
  if (text.trim() === '') {
    return undefined
  }

  try {
    return JSON.parse(text)
  } catch {
    return text
  }
}

function responseErrorCode(body: unknown): string | undefined {
  if (!isRecord(body)) {
    return undefined
  }

  const code = body.code
  return typeof code === 'string' ? code : undefined
}

function responseErrorMessage(body: unknown): string | undefined {
  if (!isRecord(body)) {
    return undefined
  }

  const error = body.error
  if (typeof error === 'string') {
    return error
  }

  const message = body.message
  return typeof message === 'string' ? message : undefined
}

function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, '')

  if (!trimmed) {
    throw new Error('HTTP/JSON Agent Network client baseUrl is required')
  }

  return trimmed
}

function normalizePath(path: string): string {
  return path.startsWith('/') ? path : `/${path}`
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}
