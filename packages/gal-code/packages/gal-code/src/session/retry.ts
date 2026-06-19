import type { NamedError } from "@scheduler-systems/gal-code-util/error"
import { Cause, Clock, Duration, Effect, Schedule } from "effect"
import { MessageV2 } from "./message-v2"
import { iife } from "@/util/iife"

export namespace SessionRetry {
  export type Err = ReturnType<NamedError["toObject"]>

  export const GO_UPSELL_MESSAGE = "Free usage exceeded, subscribe to Go https://gal.run/go"

  export const RETRY_INITIAL_DELAY = 2000
  export const RETRY_BACKOFF_FACTOR = 2
  export const RETRY_MAX_DELAY_NO_HEADERS = 30_000
  export const RETRY_MAX_DELAY = 2_147_483_647

  export const STATUS_PAGE_URL = "https://status.gal.run"

  const GAL_SERVICE_HOSTS = new Set([
    "api.gal.run",
    "gal.run",
    "status.gal.run",
  ])

  export function isGalServiceHost(host: string | undefined): boolean {
    if (!host) return false
    if (GAL_SERVICE_HOSTS.has(host)) return true
    return host.endsWith(".gal.run")
  }

  export function getStatusPageContext(host: string | undefined): string | undefined {
    if (!isGalServiceHost(host)) return undefined
    return STATUS_PAGE_URL
  }

  export type NormalizedMessage = {
    message: string
    statusPageUrl?: string
  }

  function cap(ms: number) {
    return Math.min(ms, RETRY_MAX_DELAY)
  }

  function parseErrorResponse(body: string | undefined): { code?: string; type?: string } | undefined {
    if (!body) return undefined
    try {
      const parsed = JSON.parse(body)
      if (parsed?.error && typeof parsed.error === "object") {
        return {
          code: typeof parsed.error.code === "string" ? parsed.error.code : undefined,
          type: typeof parsed.error.type === "string" ? parsed.error.type : undefined,
        }
      }
    } catch {}
    return undefined
  }

  function extractHost(url: string | undefined): string | undefined {
    if (!url) return undefined
    try {
      return new URL(url).host
    } catch {
      return undefined
    }
  }

  export function normalizeMessage(message: string | undefined, error?: Err): string {
    return normalizeMessageWithContext(message, error).message
  }

  export function normalizeMessageWithContext(message: string | undefined, error?: Err): NormalizedMessage {
    if (!message || message === "<none>" || message.trim() === "") {
      if (error && MessageV2.APIError.isInstance(error)) {
        const url = error.data.metadata?.url as string | undefined
        const statusCode = error.data.statusCode
        const responseHeaders = error.data.responseHeaders
        const responseBody = error.data.responseBody

        const host = extractHost(url)
        const statusPageUrl = getStatusPageContext(host)

        const parsedError = parseErrorResponse(responseBody)
        const errorCode = parsedError?.code || parsedError?.type
        const requestId = responseHeaders?.["x-request-id"] || responseHeaders?.["request-id"]

        if (errorCode) {
          const reqSuffix = requestId ? ` (${requestId.slice(0, 8)})` : ""
          return { message: `Upstream error: ${errorCode}${reqSuffix}`, statusPageUrl }
        }

        if (statusCode && host) {
          const reqSuffix = requestId ? ` (${requestId.slice(0, 8)})` : ""
          return { message: `Upstream error (${host}) HTTP ${statusCode}${reqSuffix}`, statusPageUrl }
        }

        if (host) {
          const reqSuffix = requestId ? ` (${requestId.slice(0, 8)})` : ""
          return { message: `Upstream error (${host})${reqSuffix}`, statusPageUrl }
        }
      }
      return { message: "Upstream error (no details available)" }
    }
    return { message }
  }

  export function delay(attempt: number, error?: MessageV2.APIError) {
    if (error) {
      const headers = error.data.responseHeaders
      if (headers) {
        const retryAfterMs = headers["retry-after-ms"]
        if (retryAfterMs) {
          const parsedMs = Number.parseFloat(retryAfterMs)
          if (!Number.isNaN(parsedMs)) {
            return cap(parsedMs)
          }
        }

        const retryAfter = headers["retry-after"]
        if (retryAfter) {
          const parsedSeconds = Number.parseFloat(retryAfter)
          if (!Number.isNaN(parsedSeconds)) {
            // convert seconds to milliseconds
            return cap(Math.ceil(parsedSeconds * 1000))
          }
          // Try parsing as HTTP date format
          const parsed = Date.parse(retryAfter) - Date.now()
          if (!Number.isNaN(parsed) && parsed > 0) {
            return cap(Math.ceil(parsed))
          }
        }

        return cap(RETRY_INITIAL_DELAY * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1))
      }
    }

    return cap(Math.min(RETRY_INITIAL_DELAY * Math.pow(RETRY_BACKOFF_FACTOR, attempt - 1), RETRY_MAX_DELAY_NO_HEADERS))
  }

  export function retryableWithContext(error: Err): NormalizedMessage | undefined {
    if (MessageV2.ContextOverflowError.isInstance(error)) return undefined
    if (MessageV2.APIError.isInstance(error)) {
      if (!error.data.isRetryable) return undefined
      if (error.data.responseBody?.includes("FreeUsageLimitError")) {
        return { message: GO_UPSELL_MESSAGE }
      }
      const rawMessage = error.data.message.includes("Overloaded") ? "Provider is overloaded" : error.data.message
      return normalizeMessageWithContext(rawMessage, error)
    }

    const msg = error.data?.message
    if (typeof msg === "string") {
      const lower = msg.toLowerCase()
      if (
        lower.includes("rate increased too quickly") ||
        lower.includes("rate limit") ||
        lower.includes("too many requests")
      ) {
        return normalizeMessageWithContext(msg, error)
      }
    }

    const json = iife(() => {
      try {
        if (typeof error.data?.message === "string") {
          const parsed = JSON.parse(error.data.message)
          return parsed
        }

        return JSON.parse(error.data.message)
      } catch {
        return undefined
      }
    })
    if (!json || typeof json !== "object") return undefined
    const code = typeof json.code === "string" ? json.code : ""

    if (json.type === "error" && json.error?.type === "too_many_requests") {
      return { message: "Too Many Requests" }
    }
    if (code.includes("exhausted") || code.includes("unavailable")) {
      return { message: "Provider is overloaded" }
    }
    if (json.type === "error" && typeof json.error?.code === "string" && json.error.code.includes("rate_limit")) {
      return { message: "Rate Limited" }
    }
    return undefined
  }

  export function retryable(error: Err): string | undefined {
    return retryableWithContext(error)?.message
  }

  export function policy(opts: {
    parse: (error: unknown) => Err
    set: (input: { attempt: number; message: string; next: number; statusPageUrl?: string }) => Effect.Effect<void>
  }) {
    return Schedule.fromStepWithMetadata(
      Effect.succeed((meta: Schedule.InputMetadata<unknown>) => {
        const error = opts.parse(meta.input)
        const normalized = retryableWithContext(error)
        if (!normalized) return Cause.done(meta.attempt)
        return Effect.gen(function* () {
          const wait = delay(meta.attempt, MessageV2.APIError.isInstance(error) ? error : undefined)
          const now = yield* Clock.currentTimeMillis
          yield* opts.set({ 
            attempt: meta.attempt, 
            message: normalized.message, 
            next: now + wait,
            statusPageUrl: normalized.statusPageUrl,
          })
          return [meta.attempt, Duration.millis(wait)] as [number, Duration.Duration]
        })
      }),
    )
  }
}
