import { Effect, Layer, Context } from "effect"
import { Log } from "@/util/log"
import { GALT } from "./index"

export namespace Middleware {
  const log = Log.create({ service: "galt-middleware" })

  export type MiddlewareContext = {
    sessionID: string
    requestID: string
    model: string
    providerID: string
    userID?: string
  }

  export type TransformResult = {
    allowed: boolean
    content?: string
    reason?: string
    redactions?: number
    classification?: string
  }

  export interface Interface {
    readonly transformPrompt: (prompt: string, ctx: MiddlewareContext) => Effect.Effect<TransformResult>
    readonly transformResponse: (content: string, ctx: MiddlewareContext) => Effect.Effect<TransformResult>
    readonly interceptToolCall: (toolName: string, args: unknown, ctx: MiddlewareContext) => Effect.Effect<{ allowed: boolean; args?: unknown }>
    readonly interceptToolResult: (toolName: string, result: unknown, ctx: MiddlewareContext) => Effect.Effect<{ allowed: boolean; result?: unknown }>
  }

  export class Service extends Context.Service<Service, Interface>()("@gal-code/GALTMiddleware") {}

  export const layer = Layer.effect(
    Service,
    Effect.gen(function* () {
      const galt = yield* GALT.Service

      const transformPrompt = Effect.fn("GALTMiddleware.transformPrompt")(function* (
        prompt: string,
        ctx: MiddlewareContext
      ) {
        const config = yield* galt.getConfig()

        if (!config.enabled || !config.input_sanitization) {
          return { allowed: true, content: prompt }
        }

        const result = yield* galt.sanitizeInput({
          request_id: ctx.requestID,
          prompt,
          model: ctx.model,
          classification: config.default_classification,
          metadata: {
            session_id: ctx.sessionID,
            provider_id: ctx.providerID,
            user_id: ctx.userID,
          },
        })

        if (!result.allowed) {
          log.warn("input blocked", {
            request_id: ctx.requestID,
            violations: result.violations,
          })
          return {
            allowed: false,
            reason: "Input blocked by security policy",
            redactions: result.redactions,
            classification: result.classification,
          }
        }

        if (result.redactions > 0) {
          log.info("input sanitized", {
            request_id: ctx.requestID,
            redactions: result.redactions,
          })
        }

        return {
          allowed: true,
          content: result.sanitized_content ?? prompt,
          redactions: result.redactions,
          classification: result.classification,
        }
      })

      const transformResponse = Effect.fn("GALTMiddleware.transformResponse")(function* (
        content: string,
        ctx: MiddlewareContext
      ) {
        const config = yield* galt.getConfig()

        if (!config.enabled || !config.output_sanitization) {
          return { allowed: true, content }
        }

        const result = yield* galt.sanitizeOutput({
          request_id: ctx.requestID,
          content,
          classification: config.default_classification,
          metadata: {
            session_id: ctx.sessionID,
            model: ctx.model,
            provider_id: ctx.providerID,
          },
        })

        if (!result.allowed) {
          log.warn("output blocked", {
            request_id: ctx.requestID,
            violations: result.violations,
          })
          return {
            allowed: false,
            reason: "Output blocked by security policy",
            redactions: result.redactions,
            classification: result.classification,
          }
        }

        if (result.redactions > 0) {
          log.info("output sanitized", {
            request_id: ctx.requestID,
            redactions: result.redactions,
          })
        }

        return {
          allowed: true,
          content: result.sanitized_content ?? content,
          redactions: result.redactions,
          classification: result.classification,
        }
      })

      const interceptToolCall = Effect.fn("GALTMiddleware.interceptToolCall")(function* (
        toolName: string,
        args: unknown,
        ctx: MiddlewareContext
      ) {
        const config = yield* galt.getConfig()

        if (!config.enabled) {
          return { allowed: true, args }
        }

        const dangerousTools = ["bash", "write", "edit"]
        if (dangerousTools.includes(toolName)) {
          const argsStr = JSON.stringify(args)
          const result = yield* galt.sanitizeInput({
            request_id: `${ctx.requestID}-tool-${toolName}`,
            prompt: argsStr,
            model: ctx.model,
            classification: config.default_classification,
            metadata: {
              session_id: ctx.sessionID,
              tool_name: toolName,
            },
          })

          if (!result.allowed) {
            log.warn("tool call blocked", {
              tool_name: toolName,
              request_id: ctx.requestID,
            })
            return { allowed: false }
          }

          if (result.sanitized_content && result.redactions > 0) {
            try {
              return { allowed: true, args: JSON.parse(result.sanitized_content) }
            } catch {
              return { allowed: true, args }
            }
          }
        }

        return { allowed: true, args }
      })

      const interceptToolResult = Effect.fn("GALTMiddleware.interceptToolResult")(function* (
        toolName: string,
        result: unknown,
        ctx: MiddlewareContext
      ) {
        const config = yield* galt.getConfig()

        if (!config.enabled || !config.output_sanitization) {
          return { allowed: true, result }
        }

        const resultStr = typeof result === "string" ? result : JSON.stringify(result)
        const sanitizeResult = yield* galt.sanitizeOutput({
          request_id: `${ctx.requestID}-tool-result-${toolName}`,
          content: resultStr,
          classification: config.default_classification,
          metadata: {
            session_id: ctx.sessionID,
            tool_name: toolName,
          },
        })

        if (!sanitizeResult.allowed) {
          log.warn("tool result blocked", {
            tool_name: toolName,
            request_id: ctx.requestID,
          })
          return { allowed: false }
        }

        if (sanitizeResult.sanitized_content && sanitizeResult.redactions > 0) {
          if (typeof result === "string") {
            return { allowed: true, result: sanitizeResult.sanitized_content }
          }
          try {
            return { allowed: true, result: JSON.parse(sanitizeResult.sanitized_content) }
          } catch {
            return { allowed: true, result }
          }
        }

        return { allowed: true, result }
      })

      return Service.of({
        transformPrompt,
        transformResponse,
        interceptToolCall,
        interceptToolResult,
      })
    })
  )

  export const defaultLayer = Layer.suspend(() =>
    layer.pipe(Layer.provide(GALT.defaultLayer))
  )
}

export const GALTMiddleware = Middleware
