import { Env } from "@/env"

export namespace GalCodeGateway {
  export const PRODUCTION_BASE_URL = "https://api.gal.run/api/gal-code/v1"

  type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>
  type Logger = {
    warn: (message: string, metadata?: Record<string, unknown>) => void
  }

  export type FallbackOptions = {
    providerID: string
    fetchFn: FetchLike
    productionBaseURL?: string
    healthTimeoutMs?: number
    log?: Logger
    disableFallback?: boolean
  }

  const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "0.0.0.0"])
  const HEALTH_CACHE_MS = 1_000
  const DEFAULT_HEALTH_TIMEOUT_MS = 750

  export function isLocalHost(hostname: string | undefined) {
    if (!hostname) return false
    return LOCAL_HOSTS.has(hostname)
  }

  export function isLocalGalCodeGatewayURL(url: string | URL | undefined) {
    if (!url) return false
    try {
      const parsed = typeof url === "string" ? new URL(url) : url
      return isLocalHost(parsed.hostname) && parsed.pathname.includes("/api/gal-code/v1")
    } catch {
      return false
    }
  }

  function isDisabled(explicit: boolean | undefined) {
    if (explicit !== undefined) return explicit
    const value = Env.get("GAL_CODE_DISABLE_PRODUCTION_GATEWAY_FALLBACK")?.toLowerCase()
    return value === "1" || value === "true"
  }

  function requestURL(input: RequestInfo | URL): URL | undefined {
    try {
      if (input instanceof Request) return new URL(input.url)
      if (input instanceof URL) return input
      if (typeof input === "string") return new URL(input)
      return undefined
    } catch {
      return undefined
    }
  }

  export function productionURL(input: URL, productionBaseURL = PRODUCTION_BASE_URL) {
    const base = new URL(productionBaseURL)
    const prefix = "/api/gal-code/v1"
    const suffix = input.pathname.startsWith(prefix) ? input.pathname.slice(prefix.length) : input.pathname
    const target = new URL(base.toString().replace(/\/$/, "") + suffix)
    target.search = input.search
    return target
  }

  function rewriteInput(input: RequestInfo | URL, target: URL): RequestInfo | URL {
    if (input instanceof Request) return new Request(target, input.clone())
    if (input instanceof URL) return target
    return target.toString()
  }

  async function healthy(input: {
    fetchFn: FetchLike
    url: URL
    signal?: AbortSignal | null
    timeoutMs: number
  }) {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), input.timeoutMs)
    const signals = [ctl.signal]
    if (input.signal) signals.push(input.signal)
    const signal = signals.length === 1 ? signals[0] : AbortSignal.any(signals)

    try {
      const healthURL = new URL("/health", input.url.origin)
      const response = await input.fetchFn(healthURL, { method: "GET", signal })
      return response.ok
    } catch {
      return false
    } finally {
      clearTimeout(timer)
    }
  }

  export function withProductionFallback(options: FallbackOptions): FetchLike {
    if (!options.providerID.startsWith("gal-code")) return options.fetchFn
    if (isDisabled(options.disableFallback)) return options.fetchFn

    let localUnavailable = false
    let lastHealthCheck = 0
    const productionBaseURL = options.productionBaseURL ?? Env.get("GAL_CODE_PRODUCTION_GATEWAY_URL") ?? PRODUCTION_BASE_URL
    const healthTimeoutMs = options.healthTimeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS

    return async (input, init) => {
      const localURL = requestURL(input)
      if (!localURL || !isLocalGalCodeGatewayURL(localURL)) return options.fetchFn(input, init)

      const target = productionURL(localURL, productionBaseURL)
      const productionInput = rewriteInput(input, target)
      const now = Date.now()

      if (!localUnavailable && now - lastHealthCheck > HEALTH_CACHE_MS) {
        lastHealthCheck = now
        const lastHealthy = await healthy({
          fetchFn: options.fetchFn,
          url: localURL,
          signal: init?.signal ?? (input instanceof Request ? input.signal : undefined),
          timeoutMs: healthTimeoutMs,
        })
        if (!lastHealthy) {
          localUnavailable = true
          options.log?.warn("local GAL Code gateway is unhealthy; using production gateway", {
            healthURL: new URL("/health", localURL.origin).toString(),
            productionURL: target.toString(),
          })
        }
      }

      if (localUnavailable) return options.fetchFn(productionInput, init)

      try {
        const localInput = input instanceof Request ? input.clone() : input
        return await options.fetchFn(localInput, init)
      } catch (error) {
        localUnavailable = true
        options.log?.warn("local GAL Code gateway request failed; retrying production gateway", {
          localURL: localURL.toString(),
          productionURL: target.toString(),
          error,
        })
        return options.fetchFn(productionInput, init)
      }
    }
  }
}
