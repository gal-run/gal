import { describe, expect, test } from "bun:test"
import type { NamedError } from "@scheduler-systems/gal-code-util/error"
import { APICallError } from "ai"
import { setTimeout as sleep } from "node:timers/promises"
import { Effect, Schedule } from "effect"
import { SessionRetry } from "../../src/session/retry"
import { MessageV2 } from "../../src/session/message-v2"
import { ProviderID } from "../../src/provider/schema"
import { AppRuntime } from "../../src/effect/app-runtime"
import { SessionID } from "../../src/session/schema"
import { SessionStatus } from "../../src/session/status"
import { Instance } from "../../src/project/instance"
import { tmpdir } from "../fixture/fixture"

const providerID = ProviderID.make("test")

function apiError(headers?: Record<string, string>): MessageV2.APIError {
  return new MessageV2.APIError({
    message: "boom",
    isRetryable: true,
    responseHeaders: headers,
  }).toObject() as MessageV2.APIError
}

function wrap(message: unknown): ReturnType<NamedError["toObject"]> {
  return { data: { message } } as ReturnType<NamedError["toObject"]>
}

describe("session.retry.delay", () => {
  test("caps delay at 30 seconds when headers missing", () => {
    const error = apiError()
    const delays = Array.from({ length: 10 }, (_, index) => SessionRetry.delay(index + 1, error))
    expect(delays).toStrictEqual([2000, 4000, 8000, 16000, 30000, 30000, 30000, 30000, 30000, 30000])
  })

  test("prefers retry-after-ms when shorter than exponential", () => {
    const error = apiError({ "retry-after-ms": "1500" })
    expect(SessionRetry.delay(4, error)).toBe(1500)
  })

  test("uses retry-after seconds when reasonable", () => {
    const error = apiError({ "retry-after": "30" })
    expect(SessionRetry.delay(3, error)).toBe(30000)
  })

  test("accepts http-date retry-after values", () => {
    const date = new Date(Date.now() + 20000).toUTCString()
    const error = apiError({ "retry-after": date })
    const d = SessionRetry.delay(1, error)
    expect(d).toBeGreaterThanOrEqual(19000)
    expect(d).toBeLessThanOrEqual(20000)
  })

  test("ignores invalid retry hints", () => {
    const error = apiError({ "retry-after": "not-a-number" })
    expect(SessionRetry.delay(1, error)).toBe(2000)
  })

  test("ignores malformed date retry hints", () => {
    const error = apiError({ "retry-after": "Invalid Date String" })
    expect(SessionRetry.delay(1, error)).toBe(2000)
  })

  test("ignores past date retry hints", () => {
    const pastDate = new Date(Date.now() - 5000).toUTCString()
    const error = apiError({ "retry-after": pastDate })
    expect(SessionRetry.delay(1, error)).toBe(2000)
  })

  test("uses retry-after values even when exceeding 10 minutes with headers", () => {
    const error = apiError({ "retry-after": "50" })
    expect(SessionRetry.delay(1, error)).toBe(50000)

    const longError = apiError({ "retry-after-ms": "700000" })
    expect(SessionRetry.delay(1, longError)).toBe(700000)
  })

  test("caps oversized header delays to the runtime timer limit", () => {
    const error = apiError({ "retry-after-ms": "999999999999" })
    expect(SessionRetry.delay(1, error)).toBe(SessionRetry.RETRY_MAX_DELAY)
  })

  test("policy updates retry status and increments attempts", async () => {
    await using tmp = await tmpdir()
    await Instance.provide({
      directory: tmp.path,
      fn: async () => {
        const sessionID = SessionID.make("session-retry-test")
        const error = apiError({ "retry-after-ms": "0" })

        await Effect.runPromise(
          Effect.gen(function* () {
            const step = yield* Schedule.toStepWithMetadata(
              SessionRetry.policy({
                parse: (err) => err as MessageV2.APIError,
                set: (info) =>
                  Effect.promise(() =>
                    AppRuntime.runPromise(
                      SessionStatus.Service.use((svc) =>
                        svc.set(sessionID, {
                          type: "retry",
                          attempt: info.attempt,
                          message: info.message,
                          next: info.next,
                          statusPageUrl: info.statusPageUrl,
                        }),
                      ),
                    ),
                  ),
              }),
            )
            yield* step(error)
            yield* step(error)
          }),
        )

        expect(await AppRuntime.runPromise(SessionStatus.Service.use((svc) => svc.get(sessionID)))).toMatchObject({
          type: "retry",
          attempt: 2,
          message: "boom",
        })
      },
    })
  })
})

describe("session.retry.normalizeMessage", () => {
  test("replaces <none> with fallback", () => {
    expect(SessionRetry.normalizeMessage("<none>")).toBe("Upstream error (no details available)")
  })

  test("replaces empty string with fallback", () => {
    expect(SessionRetry.normalizeMessage("")).toBe("Upstream error (no details available)")
  })

  test("replaces undefined with fallback", () => {
    expect(SessionRetry.normalizeMessage(undefined)).toBe("Upstream error (no details available)")
  })

  test("replaces whitespace-only with fallback", () => {
    expect(SessionRetry.normalizeMessage("   ")).toBe("Upstream error (no details available)")
  })

  test("extracts host from valid URL in error metadata", () => {
    const error = new MessageV2.APIError({
      message: "boom",
      isRetryable: true,
      metadata: { url: "https://api.gal.run/v1/chat" },
    }).toObject() as MessageV2.APIError

    expect(SessionRetry.normalizeMessage("<none>", error)).toBe("Upstream error (api.gal.run)")
  })

  test("includes HTTP status code when available", () => {
    const error = new MessageV2.APIError({
      message: "<none>",
      isRetryable: true,
      statusCode: 503,
      metadata: { url: "https://api.gal.run/v1/chat" },
    }).toObject() as MessageV2.APIError

    expect(SessionRetry.normalizeMessage("<none>", error)).toBe("Upstream error (api.gal.run) HTTP 503")
  })

  test("includes request ID from x-request-id header", () => {
    const error = new MessageV2.APIError({
      message: "<none>",
      isRetryable: true,
      statusCode: 503,
      metadata: { url: "https://api.gal.run/v1/chat" },
      responseHeaders: { "x-request-id": "abc123def456" },
    }).toObject() as MessageV2.APIError

    expect(SessionRetry.normalizeMessage("<none>", error)).toBe("Upstream error (api.gal.run) HTTP 503 (abc123de)")
  })

  test("includes request ID from request-id header (fallback)", () => {
    const error = new MessageV2.APIError({
      message: "<none>",
      isRetryable: true,
      metadata: { url: "https://api.gal.run/v1/chat" },
      responseHeaders: { "request-id": "xyz789" },
    }).toObject() as MessageV2.APIError

    expect(SessionRetry.normalizeMessage("<none>", error)).toBe("Upstream error (api.gal.run) (xyz789)")
  })

  test("extracts error code from response body", () => {
    const error = new MessageV2.APIError({
      message: "<none>",
      isRetryable: true,
      statusCode: 503,
      metadata: { url: "https://api.gal.run/v1/chat" },
      responseBody: JSON.stringify({
        error: {
          message: "Service unavailable",
          type: "gal_code_upstream_error",
          code: "gal_code_upstream_503",
          status: 503,
        },
      }),
    }).toObject() as MessageV2.APIError

    expect(SessionRetry.normalizeMessage("<none>", error)).toBe("Upstream error: gal_code_upstream_503")
  })

  test("extracts error type from response body when code is missing", () => {
    const error = new MessageV2.APIError({
      message: "<none>",
      isRetryable: true,
      metadata: { url: "https://api.gal.run/v1/chat" },
      responseBody: JSON.stringify({
        error: {
          message: "Service unavailable",
          type: "upstream_timeout",
        },
      }),
    }).toObject() as MessageV2.APIError

    expect(SessionRetry.normalizeMessage("<none>", error)).toBe("Upstream error: upstream_timeout")
  })

  test("includes request ID with error code", () => {
    const error = new MessageV2.APIError({
      message: "<none>",
      isRetryable: true,
      statusCode: 503,
      metadata: { url: "https://api.gal.run/v1/chat" },
      responseHeaders: { "x-request-id": "req-12345" },
      responseBody: JSON.stringify({
        error: {
          code: "upstream_unavailable",
        },
      }),
    }).toObject() as MessageV2.APIError

    expect(SessionRetry.normalizeMessage("<none>", error)).toBe("Upstream error: upstream_unavailable (req-1234)")
  })

  test("prioritizes error code over status code", () => {
    const error = new MessageV2.APIError({
      message: "<none>",
      isRetryable: true,
      statusCode: 503,
      metadata: { url: "https://api.gal.run/v1/chat" },
      responseBody: JSON.stringify({
        error: {
          code: "rate_limited",
        },
      }),
    }).toObject() as MessageV2.APIError

    expect(SessionRetry.normalizeMessage("<none>", error)).toBe("Upstream error: rate_limited")
  })

  test("handles invalid URL in metadata", () => {
    const error = new MessageV2.APIError({
      message: "boom",
      isRetryable: true,
      metadata: { url: "not-a-url" },
    }).toObject() as MessageV2.APIError

    expect(SessionRetry.normalizeMessage("<none>", error)).toBe("Upstream error (no details available)")
  })

  test("preserves valid message", () => {
    expect(SessionRetry.normalizeMessage("Rate limit exceeded")).toBe("Rate limit exceeded")
  })
})

describe("session.retry.retryable", () => {
  test("maps too_many_requests json messages", () => {
    const error = wrap(JSON.stringify({ type: "error", error: { type: "too_many_requests" } }))
    expect(SessionRetry.retryable(error)).toBe("Too Many Requests")
  })

  test("maps overloaded provider codes", () => {
    const error = wrap(JSON.stringify({ code: "resource_exhausted" }))
    expect(SessionRetry.retryable(error)).toBe("Provider is overloaded")
  })

  test("does not retry unknown json messages", () => {
    const error = wrap(JSON.stringify({ error: { message: "no_kv_space" } }))
    expect(SessionRetry.retryable(error)).toBeUndefined()
  })

  test("does not throw on numeric error codes", () => {
    const error = wrap(JSON.stringify({ type: "error", error: { code: 123 } }))
    const result = SessionRetry.retryable(error)
    expect(result).toBeUndefined()
  })

  test("returns undefined for non-json message", () => {
    const error = wrap("not-json")
    expect(SessionRetry.retryable(error)).toBeUndefined()
  })

  test("retries plain text rate limit errors from Alibaba", () => {
    const msg =
      "Upstream error from Alibaba: Request rate increased too quickly. To ensure system stability, please adjust your client logic to scale requests more smoothly over time."
    const error = wrap(msg)
    expect(SessionRetry.retryable(error)).toBe(msg)
  })

  test("retries plain text rate limit errors", () => {
    const msg = "Rate limit exceeded, please try again later"
    const error = wrap(msg)
    expect(SessionRetry.retryable(error)).toBe(msg)
  })

  test("retries too many requests in plain text", () => {
    const msg = "Too many requests, please slow down"
    const error = wrap(msg)
    expect(SessionRetry.retryable(error)).toBe(msg)
  })

  test("does not retry context overflow errors", () => {
    const error = new MessageV2.ContextOverflowError({
      message: "Input exceeds context window of this model",
      responseBody: '{"error":{"code":"context_length_exceeded"}}',
    }).toObject() as ReturnType<NamedError["toObject"]>

    expect(SessionRetry.retryable(error)).toBeUndefined()
  })

  test("retries ZlibError decompression failures", () => {
    const error = new MessageV2.APIError({
      message: "Response decompression failed",
      isRetryable: true,
      metadata: { code: "ZlibError" },
    }).toObject() as MessageV2.APIError

    const retryable = SessionRetry.retryable(error)
    expect(retryable).toBeDefined()
    expect(retryable).toBe("Response decompression failed")
  })

  test("replaces <none> placeholder with fallback message", () => {
    const error = new MessageV2.APIError({
      message: "<none>",
      isRetryable: true,
    }).toObject() as MessageV2.APIError

    const retryable = SessionRetry.retryable(error)
    expect(retryable).toBeDefined()
    expect(retryable).toBe("Upstream error (no details available)")
  })

  test("replaces empty message with fallback message", () => {
    const error = new MessageV2.APIError({
      message: "",
      isRetryable: true,
    }).toObject() as MessageV2.APIError

    const retryable = SessionRetry.retryable(error)
    expect(retryable).toBeDefined()
    expect(retryable).toBe("Upstream error (no details available)")
  })

  test("extracts provider host from error metadata", () => {
    const error = new MessageV2.APIError({
      message: "<none>",
      isRetryable: true,
      metadata: { url: "https://api.openai.com/v1/chat/completions" },
    }).toObject() as MessageV2.APIError

    const retryable = SessionRetry.retryable(error)
    expect(retryable).toBeDefined()
    expect(retryable).toBe("Upstream error (api.openai.com)")
  })

  test("includes status code and request ID in retryable message", () => {
    const error = new MessageV2.APIError({
      message: "<none>",
      isRetryable: true,
      statusCode: 503,
      metadata: { url: "https://api.gal.run/v1/chat" },
      responseHeaders: { "x-request-id": "req-abc123" },
    }).toObject() as MessageV2.APIError

    const retryable = SessionRetry.retryable(error)
    expect(retryable).toBeDefined()
    expect(retryable).toBe("Upstream error (api.gal.run) HTTP 503 (req-abc1)")
  })

  test("normalizes whitespace-only message", () => {
    const error = new MessageV2.APIError({
      message: "   ",
      isRetryable: true,
    }).toObject() as MessageV2.APIError

    const retryable = SessionRetry.retryable(error)
    expect(retryable).toBeDefined()
    expect(retryable).toBe("Upstream error (no details available)")
  })

  test("handles invalid URL in metadata gracefully", () => {
    const error = new MessageV2.APIError({
      message: "<none>",
      isRetryable: true,
      metadata: { url: "not-a-valid-url" },
    }).toObject() as MessageV2.APIError

    const retryable = SessionRetry.retryable(error)
    expect(retryable).toBeDefined()
    expect(retryable).toBe("Upstream error (no details available)")
  })

  test("handles null metadata gracefully", () => {
    const error = new MessageV2.APIError({
      message: "<none>",
      isRetryable: true,
      metadata: null as unknown as Record<string, string>,
    }).toObject() as MessageV2.APIError

    const retryable = SessionRetry.retryable(error)
    expect(retryable).toBeDefined()
    expect(retryable).toBe("Upstream error (no details available)")
  })

  test("normalizes provider overloaded message", () => {
    const error = new MessageV2.APIError({
      message: "Overloaded: too many requests",
      isRetryable: true,
      metadata: { url: "https://api.anthropic.com/v1/messages" },
    }).toObject() as MessageV2.APIError

    const retryable = SessionRetry.retryable(error)
    expect(retryable).toBeDefined()
    expect(retryable).toBe("Provider is overloaded")
  })

  test("preserves valid message without normalization", () => {
    const error = new MessageV2.APIError({
      message: "Rate limit exceeded",
      isRetryable: true,
    }).toObject() as MessageV2.APIError

    const retryable = SessionRetry.retryable(error)
    expect(retryable).toBeDefined()
    expect(retryable).toBe("Rate limit exceeded")
  })
})

describe("session.message-v2.fromError", () => {
  test.concurrent(
    "converts ECONNRESET socket errors to retryable APIError",
    async () => {
      using server = Bun.serve({
        port: 0,
        idleTimeout: 8,
        async fetch(req) {
          return new Response(
            new ReadableStream({
              async pull(controller) {
                controller.enqueue("Hello,")
                await sleep(10000)
                controller.enqueue(" World!")
                controller.close()
              },
            }),
            { headers: { "Content-Type": "text/plain" } },
          )
        },
      })

      const error = await fetch(new URL("/", server.url.origin))
        .then((res) => res.text())
        .catch((e) => e)

      const result = MessageV2.fromError(error, { providerID })

      expect(MessageV2.APIError.isInstance(result)).toBe(true)
      expect((result as MessageV2.APIError).data.isRetryable).toBe(true)
      expect((result as MessageV2.APIError).data.message).toBe("Connection reset by server")
      expect((result as MessageV2.APIError).data.metadata?.code).toBe("ECONNRESET")
      expect((result as MessageV2.APIError).data.metadata?.message).toInclude("socket connection")
    },
    15_000,
  )

  test("ECONNRESET socket error is retryable", () => {
    const error = new MessageV2.APIError({
      message: "Connection reset by server",
      isRetryable: true,
      metadata: { code: "ECONNRESET", message: "The socket connection was closed unexpectedly" },
    }).toObject() as MessageV2.APIError

    const retryable = SessionRetry.retryable(error)
    expect(retryable).toBeDefined()
    expect(retryable).toBe("Connection reset by server")
  })

  test("marks OpenAI 404 status codes as retryable", () => {
    const error = new APICallError({
      message: "boom",
      url: "https://api.openai.com/v1/chat/completions",
      requestBodyValues: {},
      statusCode: 404,
      responseHeaders: { "content-type": "application/json" },
      responseBody: '{"error":"boom"}',
      isRetryable: false,
    })
    const result = MessageV2.fromError(error, { providerID: ProviderID.make("openai") }) as MessageV2.APIError
    expect(result.data.isRetryable).toBe(true)
  })
})

describe("session.retry.isGalServiceHost", () => {
  test("identifies api.gal.run as GAL service", () => {
    expect(SessionRetry.isGalServiceHost("api.gal.run")).toBe(true)
  })

  test("identifies gal.run as GAL service", () => {
    expect(SessionRetry.isGalServiceHost("gal.run")).toBe(true)
  })

  test("identifies subdomains of gal.run as GAL service", () => {
    expect(SessionRetry.isGalServiceHost("staging.api.gal.run")).toBe(true)
    expect(SessionRetry.isGalServiceHost("foo.gal.run")).toBe(true)
  })

  test("does not identify non-GAL services", () => {
    expect(SessionRetry.isGalServiceHost("api.openai.com")).toBe(false)
    expect(SessionRetry.isGalServiceHost("api.anthropic.com")).toBe(false)
    expect(SessionRetry.isGalServiceHost("gal.run.example.com")).toBe(false)
  })

  test("handles undefined host", () => {
    expect(SessionRetry.isGalServiceHost(undefined)).toBe(false)
  })
})

describe("session.retry.getStatusPageContext", () => {
  test("returns status page URL for GAL services", () => {
    expect(SessionRetry.getStatusPageContext("api.gal.run")).toBe("https://status.gal.run")
    expect(SessionRetry.getStatusPageContext("staging.gal.run")).toBe("https://status.gal.run")
  })

  test("returns undefined for non-GAL services", () => {
    expect(SessionRetry.getStatusPageContext("api.openai.com")).toBeUndefined()
    expect(SessionRetry.getStatusPageContext(undefined)).toBeUndefined()
  })
})

describe("session.retry.normalizeMessageWithContext", () => {
  test("includes status page URL for GAL service errors", () => {
    const error = new MessageV2.APIError({
      message: "<none>",
      isRetryable: true,
      statusCode: 503,
      metadata: { url: "https://api.gal.run/v1/chat" },
    }).toObject() as MessageV2.APIError

    const result = SessionRetry.normalizeMessageWithContext("<none>", error)
    expect(result.message).toBe("Upstream error (api.gal.run) HTTP 503")
    expect(result.statusPageUrl).toBe("https://status.gal.run")
  })

  test("includes status page URL for GAL service without status code", () => {
    const error = new MessageV2.APIError({
      message: "<none>",
      isRetryable: true,
      metadata: { url: "https://api.gal.run/v1/chat" },
    }).toObject() as MessageV2.APIError

    const result = SessionRetry.normalizeMessageWithContext("<none>", error)
    expect(result.message).toBe("Upstream error (api.gal.run)")
    expect(result.statusPageUrl).toBe("https://status.gal.run")
  })

  test("includes status page URL with error code", () => {
    const error = new MessageV2.APIError({
      message: "<none>",
      isRetryable: true,
      statusCode: 503,
      metadata: { url: "https://api.gal.run/v1/chat" },
      responseBody: JSON.stringify({
        error: {
          code: "gal_code_upstream_503",
        },
      }),
    }).toObject() as MessageV2.APIError

    const result = SessionRetry.normalizeMessageWithContext("<none>", error)
    expect(result.message).toBe("Upstream error: gal_code_upstream_503")
    expect(result.statusPageUrl).toBe("https://status.gal.run")
  })

  test("does not include status page URL for non-GAL services", () => {
    const error = new MessageV2.APIError({
      message: "<none>",
      isRetryable: true,
      statusCode: 503,
      metadata: { url: "https://api.openai.com/v1/chat/completions" },
    }).toObject() as MessageV2.APIError

    const result = SessionRetry.normalizeMessageWithContext("<none>", error)
    expect(result.message).toBe("Upstream error (api.openai.com) HTTP 503")
    expect(result.statusPageUrl).toBeUndefined()
  })

  test("no status page URL when no error provided", () => {
    const result = SessionRetry.normalizeMessageWithContext("<none>")
    expect(result.message).toBe("Upstream error (no details available)")
    expect(result.statusPageUrl).toBeUndefined()
  })
})

describe("session.retry.retryableWithContext", () => {
  test("includes status page URL for GAL service retryable errors", () => {
    const error = new MessageV2.APIError({
      message: "<none>",
      isRetryable: true,
      statusCode: 503,
      metadata: { url: "https://api.gal.run/v1/chat" },
      responseHeaders: { "x-request-id": "req-abc123" },
    }).toObject() as MessageV2.APIError

    const result = SessionRetry.retryableWithContext(error)
    expect(result).toBeDefined()
    expect(result?.message).toBe("Upstream error (api.gal.run) HTTP 503 (req-abc1)")
    expect(result?.statusPageUrl).toBe("https://status.gal.run")
  })

  test("no status page URL for non-GAL service retryable errors", () => {
    const error = new MessageV2.APIError({
      message: "<none>",
      isRetryable: true,
      metadata: { url: "https://api.openai.com/v1/chat/completions" },
    }).toObject() as MessageV2.APIError

    const result = SessionRetry.retryableWithContext(error)
    expect(result).toBeDefined()
    expect(result?.message).toBe("Upstream error (api.openai.com)")
    expect(result?.statusPageUrl).toBeUndefined()
  })

  test("returns undefined for non-retryable errors", () => {
    const error = new MessageV2.APIError({
      message: "<none>",
      isRetryable: false,
    }).toObject() as MessageV2.APIError

    const result = SessionRetry.retryableWithContext(error)
    expect(result).toBeUndefined()
  })

  test("returns undefined for context overflow errors", () => {
    const error = new MessageV2.ContextOverflowError({
      message: "Input exceeds context window",
    }).toObject() as ReturnType<NamedError["toObject"]>

    const result = SessionRetry.retryableWithContext(error)
    expect(result).toBeUndefined()
  })
})
