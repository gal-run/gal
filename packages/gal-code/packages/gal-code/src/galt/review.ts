import { Effect, Layer, Context } from "effect"
import { Log } from "@/util/log"
import { GALT } from "./index"
import z from "zod"

export namespace Review {
  const log = Log.create({ service: "galt-review" })

  export type ReviewStatus = "pending" | "in_review" | "approved" | "rejected" | "escalated"
  export type ReviewPriority = "low" | "medium" | "high" | "critical"
  export type FlagReason =
    | "classification_mismatch"
    | "sensitive_content"
    | "policy_flag"
    | "manual_review"
    | "high_risk_pattern"
    | "secrets_detected"
    | "vulnerability_found"

  export const ReviewQueueItem = z.object({
    review_id: z.string(),
    request_id: z.string(),
    classification: z.string(),
    flagged_at: z.string(),
    flag_reasons: z.array(z.string()),
    priority: z.enum(["low", "medium", "high", "critical"]),
    requester: z.string(),
    status: z.enum(["pending", "in_review", "approved", "rejected", "escalated"]),
    claimed_by: z.string().optional(),
    sla_status: z.enum(["on_track", "at_risk", "breached"]),
    sla_due_at: z.string(),
  })

  export type ReviewQueueItem = z.infer<typeof ReviewQueueItem>

  export const ReviewQueue = z.object({
    items: z.array(ReviewQueueItem),
    total: z.number(),
    limit: z.number(),
    offset: z.number(),
  })

  export type ReviewQueue = z.infer<typeof ReviewQueue>

  export const SanitizationFinding = z.object({
    type: z.string(),
    severity: z.string(),
    description: z.string(),
    location: z.string().optional(),
  })

  export const ReviewItem = z.object({
    review_id: z.string(),
    request_id: z.string(),
    classification: z.string(),
    flagged_at: z.string(),
    flag_reasons: z.array(z.string()),
    priority: z.enum(["low", "medium", "high", "critical"]),
    requester: z.string(),
    status: z.enum(["pending", "in_review", "approved", "rejected", "escalated"]),
    claimed_by: z.string().optional(),
    claimed_at: z.string().optional(),
    response_content: z.string(),
    sanitization_report: z
      .object({
        original_classification: z.string(),
        final_classification: z.string(),
        redactions: z.array(
          z.object({
            position: z.number(),
            length: z.number(),
            reason: z.string(),
          })
        ),
        findings: z.array(SanitizationFinding),
        scan_duration_ms: z.number(),
      })
      .optional(),
    sla: z
      .object({
        due_at: z.string(),
        warning_at: z.string(),
        status: z.enum(["on_track", "at_risk", "breached"]),
        breached_at: z.string().optional(),
      })
      .optional(),
    approved_at: z.string().optional(),
    approved_by: z.string().optional(),
    rejected_at: z.string().optional(),
    rejected_by: z.string().optional(),
    rejection_reason: z.string().optional(),
  })

  export type ReviewItem = z.infer<typeof ReviewItem>

  export const ReviewResult = z.object({
    review_id: z.string(),
    request_id: z.string(),
    status: z.enum(["pending", "in_review", "approved", "rejected", "escalated"]),
    reviewed_at: z.string(),
    reviewed_by: z.string(),
    response_status: z.string(),
  })

  export type ReviewResult = z.infer<typeof ReviewResult>

  export interface QueueOptions {
    status?: ReviewStatus
    classification?: string
    limit?: number
    offset?: number
  }

  export interface ApproveOptions {
    comments?: string
    modifications?: string
    classificationOverride?: string
  }

  export interface RejectOptions {
    reason: "classification_violation" | "sensitive_content" | "policy_violation" | "quality_issue" | "other"
    details?: string
  }

  export interface Interface {
    readonly getQueue: (opts?: QueueOptions) => Effect.Effect<ReviewQueue>
    readonly getItem: (reviewId: string) => Effect.Effect<ReviewItem>
    readonly claim: (reviewId: string) => Effect.Effect<void>
    readonly release: (reviewId: string) => Effect.Effect<void>
    readonly approve: (reviewId: string, opts?: ApproveOptions) => Effect.Effect<ReviewResult>
    readonly reject: (reviewId: string, opts: RejectOptions) => Effect.Effect<ReviewResult>
  }

  export class Service extends Context.Service<Service, Interface>()("@gal-code/GALTReview") {}

  async function callGuard<T>(
    endpoint: string,
    method: string,
    body: unknown,
    config: GALT.ConfigSchema,
    schema: z.ZodType<T>
  ): Promise<T> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.timeout_ms)

    try {
      const response = await fetch(`${config.guard_url}${endpoint}`, {
        method,
        headers: {
          "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      })

      if (!response.ok) {
        const error = await response.text()
        throw new Error(`GALT Guard error: ${response.status} ${error}`)
      }

      const data = await response.json()
      return schema.parse(data)
    } finally {
      clearTimeout(timeout)
    }
  }

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      const galt = yield* GALT.Service

      const getConfig = Effect.fn("GALTReview.getConfig")(function* () {
        return yield* galt.getConfig()
      })

      const getQueue = Effect.fn("GALTReview.getQueue")(function* (opts?: QueueOptions) {
        const config = yield* getConfig()

        if (!config.enabled) {
          return { items: [], total: 0, limit: 20, offset: 0 }
        }

        const params = new URLSearchParams()
        if (opts?.status) params.set("status", opts.status)
        if (opts?.classification) params.set("classification", opts.classification)
        if (opts?.limit) params.set("limit", String(opts.limit))
        if (opts?.offset) params.set("offset", String(opts.offset))

        const query = params.toString()
        const endpoint = query ? `/api/v1/review/queue?${query}` : "/api/v1/review/queue"

        try {
          const result = yield* Effect.promise(() => callGuard(endpoint, "GET", null, config, ReviewQueue))
          return result
        } catch (e) {
          log.error("failed to get review queue", { error: e })
          return { items: [], total: 0, limit: 20, offset: 0 }
        }
      })

      const getItem = Effect.fn("GALTReview.getItem")(function* (reviewId: string) {
        const config = yield* getConfig()

        if (!config.enabled) {
          throw new Error("GALT is not enabled")
        }

        return yield* Effect.promise(() =>
          callGuard(`/api/v1/review/${reviewId}`, "GET", null, config, ReviewItem)
        )
      })

      const claim = Effect.fn("GALTReview.claim")(function* (reviewId: string) {
        const config = yield* getConfig()

        if (!config.enabled) {
          throw new Error("GALT is not enabled")
        }

        yield* Effect.promise(() =>
          callGuard(`/api/v1/review/${reviewId}/claim`, "POST", {}, config, z.any())
        )

        log.info("review claimed", { review_id: reviewId })
      })

      const release = Effect.fn("GALTReview.release")(function* (reviewId: string) {
        const config = yield* getConfig()

        if (!config.enabled) {
          throw new Error("GALT is not enabled")
        }

        yield* Effect.promise(() =>
          callGuard(`/api/v1/review/${reviewId}/release`, "POST", {}, config, z.any())
        )

        log.info("review released", { review_id: reviewId })
      })

      const approve = Effect.fn("GALTReview.approve")(function* (
        reviewId: string,
        opts?: ApproveOptions
      ) {
        const config = yield* getConfig()

        if (!config.enabled) {
          throw new Error("GALT is not enabled")
        }

        const result = yield* Effect.promise(() =>
          callGuard(`/api/v1/review/${reviewId}/approve`, "POST", opts || {}, config, ReviewResult)
        )

        log.info("review approved", { review_id: reviewId })
        return result
      })

      const reject = Effect.fn("GALTReview.reject")(function* (
        reviewId: string,
        opts: RejectOptions
      ) {
        const config = yield* getConfig()

        if (!config.enabled) {
          throw new Error("GALT is not enabled")
        }

        const result = yield* Effect.promise(() =>
          callGuard(`/api/v1/review/${reviewId}/reject`, "POST", opts, config, ReviewResult)
        )

        log.info("review rejected", { review_id: reviewId, reason: opts.reason })
        return result
      })

      return Service.of({ getQueue, getItem, claim, release, approve, reject })
    })
  )

  export const defaultLayer = Layer.suspend(() => layer.pipe(Layer.provide(GALT.defaultLayer)))

  export async function getQueue(opts?: QueueOptions) {
    const { runPromise } = await import("@/effect/run-service").then((m) =>
      m.makeRuntime(Service, defaultLayer)
    )
    return runPromise((svc) => svc.getQueue(opts))
  }

  export async function getItem(reviewId: string) {
    const { runPromise } = await import("@/effect/run-service").then((m) =>
      m.makeRuntime(Service, defaultLayer)
    )
    return runPromise((svc) => svc.getItem(reviewId))
  }

  export async function claim(reviewId: string) {
    const { runPromise } = await import("@/effect/run-service").then((m) =>
      m.makeRuntime(Service, defaultLayer)
    )
    return runPromise((svc) => svc.claim(reviewId))
  }

  export async function release(reviewId: string) {
    const { runPromise } = await import("@/effect/run-service").then((m) =>
      m.makeRuntime(Service, defaultLayer)
    )
    return runPromise((svc) => svc.release(reviewId))
  }

  export async function approve(reviewId: string, opts?: ApproveOptions) {
    const { runPromise } = await import("@/effect/run-service").then((m) =>
      m.makeRuntime(Service, defaultLayer)
    )
    return runPromise((svc) => svc.approve(reviewId, opts))
  }

  export async function reject(reviewId: string, opts: RejectOptions) {
    const { runPromise } = await import("@/effect/run-service").then((m) =>
      m.makeRuntime(Service, defaultLayer)
    )
    return runPromise((svc) => svc.reject(reviewId, opts))
  }
}
