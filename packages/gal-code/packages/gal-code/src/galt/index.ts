import { Effect, Layer, Context } from "effect"
import { Log } from "@/util/log"
import { Config } from "@/config/config"
import { Bus } from "@/bus"
import { BusEvent } from "@/bus/bus-event"
import z from "zod"

export { Review } from "./review"

export namespace GALT {
  const log = Log.create({ service: "galt" })
  export const REQUIRED_ENTITLEMENT = "cyber"

  export type ClassificationLevel = "UNCLASSIFIED" | "CONFIDENTIAL" | "SECRET" | "TOP_SECRET"

  export const ClassificationLevels = {
    UNCLASSIFIED: 0,
    CONFIDENTIAL: 1,
    SECRET: 2,
    TOP_SECRET: 3,
  } as const

  export const SanitizationResult = z.object({
    allowed: z.boolean(),
    sanitized_content: z.string().optional(),
    classification: z.string(),
    redactions: z.number().default(0),
    violations: z.array(z.object({
      type: z.string(),
      severity: z.enum(["low", "medium", "high", "critical"]),
      description: z.string(),
      location: z.object({
        start: z.number().optional(),
        end: z.number().optional(),
      }).optional(),
    })).default([]),
    metadata: z.record(z.string(), z.any()).optional(),
  })

  export type SanitizationResult = z.infer<typeof SanitizationResult>

  export const RequestSanitization = z.object({
    request_id: z.string(),
    prompt: z.string(),
    model: z.string(),
    classification: z.string(),
    context_documents: z.array(z.object({
      document_id: z.string(),
      classification: z.string(),
    })).optional(),
    metadata: z.record(z.string(), z.any()).optional(),
  })

  export type RequestSanitization = z.infer<typeof RequestSanitization>

  export const ResponseSanitization = z.object({
    request_id: z.string(),
    content: z.string(),
    classification: z.string(),
    metadata: z.record(z.string(), z.any()).optional(),
  })

  export type ResponseSanitization = z.infer<typeof ResponseSanitization>

  export const ConfigSchema = z.object({
    enabled: z.boolean().default(false),
    guard_url: z.string().default("http://localhost:8081"),
    entitlements: z.array(z.string()).default([]),
    timeout_ms: z.number().default(30000),
    default_classification: z.enum(["UNCLASSIFIED", "CONFIDENTIAL", "SECRET", "TOP_SECRET"]).default("UNCLASSIFIED"),
    input_sanitization: z.boolean().default(true),
    output_sanitization: z.boolean().default(true),
    block_on_failure: z.boolean().default(true),
    audit_logging: z.boolean().default(true),
    patterns: z.object({
      secrets: z.boolean().default(true),
      pii: z.boolean().default(true),
      steganography: z.boolean().default(true),
      vulnerabilities: z.boolean().default(true),
    }).default({
      secrets: true,
      pii: true,
      steganography: true,
      vulnerabilities: true,
    }),
  })

  export type ConfigSchema = z.infer<typeof ConfigSchema>
  export type AccessPolicy = {
    entitlements: readonly string[]
  }

  export function applyAccessPolicy(config: ConfigSchema, access: AccessPolicy): ConfigSchema {
    if (!config.enabled) return config
    if (access.entitlements.includes(REQUIRED_ENTITLEMENT)) return config
    return {
      ...config,
      enabled: false,
    }
  }

  export const ViolationEvent = BusEvent.define("galt.violation", z.object({
    type: z.enum(["input_blocked", "output_blocked", "redaction", "classification_violation"]),
    severity: z.enum(["low", "medium", "high", "critical"]),
    details: z.record(z.string(), z.any()),
    timestamp: z.number(),
  }))

  export type ViolationEvent = z.infer<typeof ViolationEvent.properties>

  export class ViolationEventClass {
    static create(type: ViolationEvent["type"], severity: ViolationEvent["severity"], details: Record<string, unknown>): ViolationEvent {
      return {
        type,
        severity,
        details,
        timestamp: Date.now(),
      }
    }
  }

  export interface Interface {
    readonly getConfig: () => Effect.Effect<ConfigSchema>
    readonly sanitizeInput: (input: RequestSanitization) => Effect.Effect<SanitizationResult>
    readonly sanitizeOutput: (input: ResponseSanitization) => Effect.Effect<SanitizationResult>
    readonly checkClassification: (level: ClassificationLevel) => Effect.Effect<boolean>
  }

  export class Service extends Context.Service<Service, Interface>()("@gal-code/GALT") {}

  async function callGuard(endpoint: string, body: unknown, config: ConfigSchema): Promise<SanitizationResult> {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), config.timeout_ms)

    try {
      const response = await fetch(`${config.guard_url}${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      })

      if (!response.ok) {
        throw new Error(`GALT Guard error: ${response.status} ${response.statusText}`)
      }

      const data = await response.json()
      return SanitizationResult.parse(data)
    } finally {
      clearTimeout(timeout)
    }
  }

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      const configSvc = yield* Config.Service

      const getConfig = Effect.fn("GALT.getConfig")(function* () {
        const cfg = yield* configSvc.get()
        const galtConfig = (cfg as any).galt ?? {}
        const parsed = ConfigSchema.parse(galtConfig)
        const access = yield* configSvc.getGALTAccess().pipe(
          Effect.catch(() => Effect.succeed({ entitlements: [] })),
        )
        const effective = applyAccessPolicy(parsed, access)
        if (parsed.enabled && !effective.enabled) {
          log.warn("GAL-T disabled because cyber entitlement is not granted")
        }
        return effective
      })

      const sanitizeInput = Effect.fn("GALT.sanitizeInput")(function* (input: RequestSanitization) {
        const config = yield* getConfig()

        if (!config.enabled || !config.input_sanitization) {
          return {
            allowed: true,
            sanitized_content: input.prompt,
            classification: config.default_classification,
            redactions: 0,
            violations: [],
          }
        }

        try {
          const result = yield* Effect.promise(() =>
            callGuard("/api/v1/sanitize/input", input, config)
          )

          if (!result.allowed && config.audit_logging) {
            Bus.publish(ViolationEvent, ViolationEventClass.create(
              "input_blocked",
              "high",
              { request_id: input.request_id, violations: result.violations }
            ))
          }

          return result
        } catch (e) {
          log.error("input sanitization failed", { error: e })
          if (config.block_on_failure) {
            return {
              allowed: false,
              classification: config.default_classification,
              redactions: 0,
              violations: [{
                type: "sanitization_error",
                severity: "high" as const,
                description: String(e),
              }],
            }
          }
          return {
            allowed: true,
            sanitized_content: input.prompt,
            classification: config.default_classification,
            redactions: 0,
            violations: [],
          }
        }
      })

      const sanitizeOutput = Effect.fn("GALT.sanitizeOutput")(function* (input: ResponseSanitization) {
        const config = yield* getConfig()

        if (!config.enabled || !config.output_sanitization) {
          return {
            allowed: true,
            sanitized_content: input.content,
            classification: config.default_classification,
            redactions: 0,
            violations: [],
          }
        }

        try {
          const result = yield* Effect.promise(() =>
            callGuard("/api/v1/sanitize/output", input, config)
          )

          if (!result.allowed && config.audit_logging) {
            Bus.publish(ViolationEvent, ViolationEventClass.create(
              "output_blocked",
              "high",
              { request_id: input.request_id, violations: result.violations }
            ))
          }

          return result
        } catch (e) {
          log.error("output sanitization failed", { error: e })
          if (config.block_on_failure) {
            return {
              allowed: false,
              classification: config.default_classification,
              redactions: 0,
              violations: [{
                type: "sanitization_error",
                severity: "high" as const,
                description: String(e),
              }],
            }
          }
          return {
            allowed: true,
            sanitized_content: input.content,
            classification: config.default_classification,
            redactions: 0,
            violations: [],
          }
        }
      })

      const checkClassification = Effect.fn("GALT.checkClassification")(function* (level: ClassificationLevel) {
        const config = yield* getConfig()
        const maxLevel = ClassificationLevels[config.default_classification]
        const requestedLevel = ClassificationLevels[level]
        return requestedLevel <= maxLevel
      })

      return Service.of({ getConfig, sanitizeInput, sanitizeOutput, checkClassification })
    })
  )

  export const defaultLayer = Layer.suspend(() =>
    layer.pipe(Layer.provide(Config.defaultLayer))
  )

  export async function getConfig() {
    const { runPromise } = await import("@/effect/run-service").then(m => m.makeRuntime(Service, defaultLayer))
    return runPromise((svc) => svc.getConfig())
  }

  export async function sanitizeInput(input: RequestSanitization) {
    const { runPromise } = await import("@/effect/run-service").then(m => m.makeRuntime(Service, defaultLayer))
    return runPromise((svc) => svc.sanitizeInput(input))
  }

  export async function sanitizeOutput(input: ResponseSanitization) {
    const { runPromise } = await import("@/effect/run-service").then(m => m.makeRuntime(Service, defaultLayer))
    return runPromise((svc) => svc.sanitizeOutput(input))
  }

  export async function checkClassification(level: ClassificationLevel) {
    const { runPromise } = await import("@/effect/run-service").then(m => m.makeRuntime(Service, defaultLayer))
    return runPromise((svc) => svc.checkClassification(level))
  }
}
