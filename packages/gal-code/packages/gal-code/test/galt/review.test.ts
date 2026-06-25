import { describe, expect, test, mock, afterEach } from "bun:test"
import { Effect, Layer } from "effect"
import { GALT } from "../../src/galt"
import { Review } from "../../src/galt/review"
import type { ConfigSchema } from "../../src/galt"

// ──────────────────────────────────────────────
// Mock GALT service
// ──────────────────────────────────────────────

function makeMockGALT(configOverrides: Partial<ConfigSchema> = {}) {
  const defaultConfig: ConfigSchema = {
    enabled: true,
    guard_url: "http://guard",
    entitlements: ["cyber"],
    timeout_ms: 5000,
    default_classification: "UNCLASSIFIED",
    input_sanitization: true,
    output_sanitization: true,
    block_on_failure: true,
    audit_logging: true,
    patterns: { secrets: true, pii: true, steganography: true, vulnerabilities: true },
  }
  const config = { ...defaultConfig, ...configOverrides }

  return Layer.succeed(
    GALT.Service,
    GALT.Service.of({
      getConfig: () => Effect.succeed(config),
      sanitizeInput: (input) =>
        Effect.succeed({ allowed: true, sanitized_content: input.prompt, classification: config.default_classification, redactions: 0, violations: [] }),
      sanitizeOutput: (input) =>
        Effect.succeed({ allowed: true, sanitized_content: input.content, classification: config.default_classification, redactions: 0, violations: [] }),
      checkClassification: (level) => Effect.succeed(true),
    }),
  )
}

function runReview<R>(effect: Effect.Effect<R, unknown, Review.Service>, configOverrides?: Partial<ConfigSchema>) {
  const layer = Review.layer.pipe(Layer.provide(makeMockGALT(configOverrides)))
  return effect.pipe(Effect.provide(layer), Effect.runPromise)
}

let originalFetch: typeof globalThis.fetch

afterEach(() => {
  if (originalFetch) {
    globalThis.fetch = originalFetch
    originalFetch = undefined!
  }
})

// ──────────────────────────────────────────────
// Queue tests
// ──────────────────────────────────────────────

describe("Review.getQueue", () => {
  test("returns empty queue when GAL-T is disabled", async () => {
    const queue = await runReview(
      Effect.gen(function* () {
        const svc = yield* Review.Service
        return yield* svc.getQueue()
      }),
      { enabled: false },
    )
    expect(queue).toEqual({ items: [], total: 0, limit: 20, offset: 0 })
  })

  test("returns queue from guard when enabled", async () => {
    originalFetch = globalThis.fetch
    globalThis.fetch = mock((url: string | URL | Request) => {
      if (url.toString().includes("/api/v1/review/queue")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              items: [{
                review_id: "rev-1",
                request_id: "req-1",
                classification: "SECRET",
                flagged_at: "2026-06-25T10:00:00Z",
                flag_reasons: ["sensitive_content"],
                priority: "high",
                requester: "user-1",
                status: "pending",
                sla_status: "on_track",
                sla_due_at: "2026-06-25T11:00:00Z",
              }],
              total: 1,
              limit: 20,
              offset: 0,
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        )
      }
      return Promise.reject(new Error("unexpected URL"))
    }) as unknown as typeof fetch

    const queue = await runReview(
      Effect.gen(function* () {
        const svc = yield* Review.Service
        return yield* svc.getQueue()
      }),
    )
    expect(queue.total).toBe(1)
    expect(queue.items).toHaveLength(1)
    expect(queue.items[0].review_id).toBe("rev-1")
    expect(queue.items[0].classification).toBe("SECRET")
    expect(queue.items[0].priority).toBe("high")
    expect(queue.items[0].status).toBe("pending")
  })

  test("filters by status parameter", async () => {
    originalFetch = globalThis.fetch
    let capturedUrl = ""
    globalThis.fetch = mock((url: string | URL | Request) => {
      capturedUrl = url.toString()
      return Promise.resolve(
        new Response(
          JSON.stringify({ items: [], total: 0, limit: 20, offset: 0 }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
    }) as unknown as typeof fetch

    await runReview(
      Effect.gen(function* () {
        const svc = yield* Review.Service
        return yield* svc.getQueue({ status: "in_review" })
      }),
    )
    expect(capturedUrl).toContain("status=in_review")
  })

  test("filters by classification parameter", async () => {
    originalFetch = globalThis.fetch
    let capturedUrl = ""
    globalThis.fetch = mock((url: string | URL | Request) => {
      capturedUrl = url.toString()
      return Promise.resolve(
        new Response(
          JSON.stringify({ items: [], total: 0, limit: 20, offset: 0 }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
    }) as unknown as typeof fetch

    await runReview(
      Effect.gen(function* () {
        const svc = yield* Review.Service
        return yield* svc.getQueue({ classification: "SECRET" })
      }),
    )
    expect(capturedUrl).toContain("classification=SECRET")
  })

  test("answers sensible defaults when disabled even if fetch would fail", async () => {
    // When disabled, no fetch call is made — config check short-circuits
    const queue = await runReview(
      Effect.gen(function* () {
        const svc = yield* Review.Service
        return yield* svc.getQueue()
      }),
      { enabled: false },
    )
    expect(queue).toEqual({ items: [], total: 0, limit: 20, offset: 0 })
  })
})

// ──────────────────────────────────────────────
// getItem tests
// ──────────────────────────────────────────────

describe("Review.getItem", () => {
  test("throws when GAL-T is disabled", async () => {
    await expect(
      runReview(
        Effect.gen(function* () {
          const svc = yield* Review.Service
          return yield* svc.getItem("rev-1")
        }),
        { enabled: false },
      ),
    ).rejects.toThrow("GALT is not enabled")
  })

  test("returns review item from guard when enabled", async () => {
    originalFetch = globalThis.fetch
    globalThis.fetch = mock((url: string | URL | Request) => {
      if (url.toString().includes("/api/v1/review/rev-1")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              review_id: "rev-1",
              request_id: "req-1",
              classification: "CONFIDENTIAL",
              flagged_at: "2026-06-25T10:00:00Z",
              flag_reasons: ["classification_mismatch"],
              priority: "high",
              requester: "user-1",
              status: "pending",
              response_content: "",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        )
      }
      return Promise.reject(new Error("unexpected URL"))
    }) as unknown as typeof fetch

    const item = await runReview(
      Effect.gen(function* () {
        const svc = yield* Review.Service
        return yield* svc.getItem("rev-1")
      }),
    )
    expect(item.review_id).toBe("rev-1")
    expect(item.classification).toBe("CONFIDENTIAL")
    expect(item.flag_reasons).toEqual(["classification_mismatch"])
    expect(item.status).toBe("pending")
  })
})

// ──────────────────────────────────────────────
// Claim / Release tests
// ──────────────────────────────────────────────

describe("Review.claim", () => {
  test("throws when GAL-T is disabled", async () => {
    await expect(
      runReview(
        Effect.gen(function* () {
          const svc = yield* Review.Service
          return yield* svc.claim("rev-1")
        }),
        { enabled: false },
      ),
    ).rejects.toThrow("GALT is not enabled")
  })

  test("claims a review when enabled", async () => {
    originalFetch = globalThis.fetch
    let capturedMethod = ""
    let capturedUrl = ""
    globalThis.fetch = mock((url: string | URL | Request, opts?: RequestInit) => {
      capturedUrl = url.toString()
      capturedMethod = opts?.method || "GET"
      return Promise.resolve(
        new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
      )
    }) as unknown as typeof fetch

    await runReview(
      Effect.gen(function* () {
        const svc = yield* Review.Service
        return yield* svc.claim("rev-1")
      }),
    )
    expect(capturedUrl).toContain("/api/v1/review/rev-1/claim")
    expect(capturedMethod).toBe("POST")
  })
})

describe("Review.release", () => {
  test("throws when GAL-T is disabled", async () => {
    await expect(
      runReview(
        Effect.gen(function* () {
          const svc = yield* Review.Service
          return yield* svc.release("rev-1")
        }),
        { enabled: false },
      ),
    ).rejects.toThrow("GALT is not enabled")
  })

  test("releases a review when enabled", async () => {
    originalFetch = globalThis.fetch
    let capturedMethod = ""
    let capturedUrl = ""
    globalThis.fetch = mock((url: string | URL | Request, opts?: RequestInit) => {
      capturedUrl = url.toString()
      capturedMethod = opts?.method || "GET"
      return Promise.resolve(
        new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
      )
    }) as unknown as typeof fetch

    await runReview(
      Effect.gen(function* () {
        const svc = yield* Review.Service
        return yield* svc.release("rev-1")
      }),
    )
    expect(capturedUrl).toContain("/api/v1/review/rev-1/release")
    expect(capturedMethod).toBe("POST")
  })
})

// ──────────────────────────────────────────────
// Approve / Reject tests
// ──────────────────────────────────────────────

describe("Review.approve", () => {
  test("throws when GAL-T is disabled", async () => {
    await expect(
      runReview(
        Effect.gen(function* () {
          const svc = yield* Review.Service
          return yield* svc.approve("rev-1")
        }),
        { enabled: false },
      ),
    ).rejects.toThrow("GALT is not enabled")
  })

  test("approves a review when enabled", async () => {
    originalFetch = globalThis.fetch
    globalThis.fetch = mock((url: string | URL | Request) => {
      if (url.toString().includes("/api/v1/review/rev-1/approve")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              review_id: "rev-1",
              request_id: "req-1",
              status: "approved",
              reviewed_at: "2026-06-25T10:30:00Z",
              reviewed_by: "reviewer-1",
              response_status: "approved",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        )
      }
      return Promise.reject(new Error("unexpected URL"))
    }) as unknown as typeof fetch

    const result = await runReview(
      Effect.gen(function* () {
        const svc = yield* Review.Service
        return yield* svc.approve("rev-1", { comments: "looks good" })
      }),
    )
    expect(result.status).toBe("approved")
    expect(result.reviewed_by).toBe("reviewer-1")
    expect(result.response_status).toBe("approved")
  })
})

describe("Review.reject", () => {
  test("throws when GAL-T is disabled", async () => {
    await expect(
      runReview(
        Effect.gen(function* () {
          const svc = yield* Review.Service
          return yield* svc.reject("rev-1", { reason: "policy_violation" })
        }),
        { enabled: false },
      ),
    ).rejects.toThrow("GALT is not enabled")
  })

  test("rejects with classification_violation reason", async () => {
    originalFetch = globalThis.fetch
    globalThis.fetch = mock((url: string | URL | Request) => {
      if (url.toString().includes("/api/v1/review/rev-1/reject")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              review_id: "rev-1",
              request_id: "req-1",
              status: "rejected",
              reviewed_at: "2026-06-25T10:30:00Z",
              reviewed_by: "reviewer-1",
              response_status: "rejected",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        )
      }
      return Promise.reject(new Error("unexpected URL"))
    }) as unknown as typeof fetch

    const result = await runReview(
      Effect.gen(function* () {
        const svc = yield* Review.Service
        return yield* svc.reject("rev-1", { reason: "classification_violation", details: "Content exceeds allowed classification" })
      }),
    )
    expect(result.status).toBe("rejected")
    expect(result.response_status).toBe("rejected")
  })

  test("rejects with sensitive_content reason", async () => {
    originalFetch = globalThis.fetch
    globalThis.fetch = mock((url: string | URL | Request) => {
      if (url.toString().includes("/api/v1/review/rev-1/reject")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              review_id: "rev-1",
              request_id: "req-1",
              status: "rejected",
              reviewed_at: "2026-06-25T10:30:00Z",
              reviewed_by: "reviewer-1",
              response_status: "rejected",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        )
      }
      return Promise.reject(new Error("unexpected URL"))
    }) as unknown as typeof fetch

    const result = await runReview(
      Effect.gen(function* () {
        const svc = yield* Review.Service
        return yield* svc.reject("rev-1", { reason: "sensitive_content" })
      }),
    )
    expect(result.status).toBe("rejected")
  })

  test("rejects with policy_violation reason", async () => {
    originalFetch = globalThis.fetch
    globalThis.fetch = mock((url: string | URL | Request) => {
      if (url.toString().includes("/api/v1/review/rev-1/reject")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              review_id: "rev-1",
              request_id: "req-1",
              status: "rejected",
              reviewed_at: "2026-06-25T10:30:00Z",
              reviewed_by: "reviewer-1",
              response_status: "rejected",
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        )
      }
      return Promise.reject(new Error("unexpected URL"))
    }) as unknown as typeof fetch

    const result = await runReview(
      Effect.gen(function* () {
        const svc = yield* Review.Service
        return yield* svc.reject("rev-1", { reason: "policy_violation", details: "Policy violation" })
      }),
    )
    expect(result.status).toBe("rejected")
  })

  test("throws guard error when fetch fails with non-ok status", async () => {
    originalFetch = globalThis.fetch
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response("Not Found", { status: 404 }),
      ),
    ) as unknown as typeof fetch

    await expect(
      runReview(
        Effect.gen(function* () {
          const svc = yield* Review.Service
          return yield* svc.getItem("rev-nonexistent")
        }),
      ),
    ).rejects.toThrow("GALT Guard error: 404 Not Found")
  })
})

// ──────────────────────────────────────────────
// Review type schemas
// ──────────────────────────────────────────────

describe("Review schemas", () => {
  test("ReviewQueueItem parse validates all fields", () => {
    const item = Review.ReviewQueueItem.parse({
      review_id: "rev-1",
      request_id: "req-1",
      classification: "SECRET",
      flagged_at: "2026-01-01T00:00:00Z",
      flag_reasons: ["sensitive_content"],
      priority: "high",
      requester: "user-1",
      status: "pending",
      sla_status: "on_track",
      sla_due_at: "2026-01-01T01:00:00Z",
    })
    expect(item.priority).toBe("high")
    expect(item.status).toBe("pending")
    expect(item.sla_status).toBe("on_track")
  })

  test("ReviewQueue parse validates queue structure", () => {
    const queue = Review.ReviewQueue.parse({
      items: [],
      total: 0,
      limit: 20,
      offset: 0,
    })
    expect(queue.total).toBe(0)
    expect(queue.items).toEqual([])
  })

  test("ReviewItem parse validates full review item", () => {
    const item = Review.ReviewItem.parse({
      review_id: "rev-1",
      request_id: "req-1",
      classification: "CONFIDENTIAL",
      flagged_at: "2026-01-01T00:00:00Z",
      flag_reasons: ["classification_mismatch"],
      priority: "critical",
      requester: "user-1",
      status: "approved",
      response_content: "content after review",
      approved_at: "2026-01-01T01:00:00Z",
      approved_by: "reviewer-1",
    })
    expect(item.status).toBe("approved")
    expect(item.approved_by).toBe("reviewer-1")
  })

  test("ReviewResult parse validates result", () => {
    const result = Review.ReviewResult.parse({
      review_id: "rev-1",
      request_id: "req-1",
      status: "approved",
      reviewed_at: "2026-01-01T01:00:00Z",
      reviewed_by: "reviewer-1",
      response_status: "approved",
    })
    expect(result.status).toBe("approved")
    expect(result.response_status).toBe("approved")
  })
})
