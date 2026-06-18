import { APICallError } from "ai"
import { STATUS_CODES } from "http"
import { iife } from "@/util/iife"
import type { ProviderID } from "./schema"

export namespace ProviderError {
  // Adapted from overflow detection patterns in:
  // https://github.com/badlogic/pi-mono/blob/main/packages/ai/src/utils/overflow.ts
  const OVERFLOW_PATTERNS = [
    /prompt is too long/i, // Anthropic
    /input is too long for requested model/i, // Amazon Bedrock
    /exceeds the context window/i, // OpenAI (Completions + Responses API message text)
    /input token count.*exceeds the maximum/i, // Google (Gemini)
    /maximum prompt length is \d+/i, // xAI (Grok)
    /reduce the length of the messages/i, // Groq
    /maximum context length is \d+ tokens/i, // OpenRouter, DeepSeek, vLLM
    /exceeds the limit of \d+/i, // GitHub Copilot
    /exceeds the available context size/i, // llama.cpp server
    /greater than the context length/i, // LM Studio
    /context window exceeds limit/i, // MiniMax
    /exceeded model token limit/i, // Kimi For Coding, Moonshot
    /context[_ ]length[_ ]exceeded/i, // Generic fallback
    /request entity too large/i, // HTTP 413
    /context length is only \d+ tokens/i, // vLLM
    /input length.*exceeds.*context length/i, // vLLM
    /prompt too long; exceeded (?:max )?context length/i, // Ollama explicit overflow error
    /too large for model with \d+ maximum context length/i, // Mistral
    /model_context_window_exceeded/i, // z.ai non-standard finish_reason surfaced as error text
    /requested token count exceeds the model'?s maximum context length/i, // GLM / Vertex-style INVALID_ARGUMENT
  ]

  const RUNTIME_FUNDING_MESSAGES = {
    billing_account_missing:
      "Runtime funding is unavailable. No billing account is assigned to this organization.",
    runtime_wallet_missing:
      "Runtime funding is unavailable. No runtime wallet is assigned to this organization.",
    runtime_budget_insufficient:
      "Runtime funding is unavailable. The runtime wallet does not have enough budget to start this work.",
    provider_allocation_unavailable:
      "Runtime funding is unavailable. Provider allocation is unavailable for this work right now.",
    provider_credit_insufficient:
      "Runtime funding is unavailable. Provider credit is exhausted for this work right now.",
  } as const

  function isOpenAiErrorRetryable(e: APICallError) {
    const status = e.statusCode
    if (!status) return e.isRetryable
    // openai sometimes returns 404 for models that are actually available
    return status === 404 || e.isRetryable
  }

  // Providers not reliably handled in this function:
  // - z.ai: can accept overflow silently (needs token-count/context-window checks)
  function isOverflow(message: string) {
    if (OVERFLOW_PATTERNS.some((p) => p.test(message))) return true

    // Providers/status patterns handled outside of regex list:
    // - Cerebras: often returns "400 (no body)" / "413 (no body)"
    // - Mistral: often returns "400 (no body)" / "413 (no body)"
    return /^4(00|13)\s*(status code)?\s*\(no body\)/i.test(message)
  }

  function message(providerID: ProviderID, e: APICallError) {
    return iife(() => {
      const msg = e.message
      if (msg === "") {
        if (e.responseBody) return e.responseBody
        if (e.statusCode) {
          const err = STATUS_CODES[e.statusCode]
          if (err) return err
        }
        return "Unknown error"
      }

      if (!e.responseBody || (e.statusCode && msg !== STATUS_CODES[e.statusCode])) {
        return msg
      }

      try {
        const body = JSON.parse(e.responseBody)
        // try to extract common error message fields
        const errMsg = body.message || body.error || body.error?.message
        if (errMsg && typeof errMsg === "string") {
          return `${msg}: ${errMsg}`
        }
      } catch {}

      // If responseBody is HTML (e.g. from a gateway or proxy error page),
      // provide a human-readable message instead of dumping raw markup
      if (/^\s*<!doctype|^\s*<html/i.test(e.responseBody)) {
        if (e.statusCode === 401) {
          return "Unauthorized: request was blocked by a gateway or proxy. Your authentication token may be missing or expired — try running `gal-code auth login <your provider URL>` to re-authenticate."
        }
        if (e.statusCode === 403) {
          return "Forbidden: request was blocked by a gateway or proxy. You may not have permission to access this resource — check your account and provider settings."
        }
        return msg
      }

      return `${msg}: ${e.responseBody}`
    }).trim()
  }

  function json(input: unknown) {
    if (typeof input === "string") {
      try {
        const result = JSON.parse(input)
        if (result && typeof result === "object") return result
        return undefined
      } catch {
        return undefined
      }
    }
    if (typeof input === "object" && input !== null) {
      return input
    }
    return undefined
  }

  type RuntimeFundingReasonCode = keyof typeof RUNTIME_FUNDING_MESSAGES

  function normalizeRuntimeFundingReasonCode(input: unknown): RuntimeFundingReasonCode | undefined {
    if (typeof input !== "string") return undefined
    const normalized = input.trim().toLowerCase()
    if (normalized in RUNTIME_FUNDING_MESSAGES) {
      return normalized as RuntimeFundingReasonCode
    }
    return undefined
  }

  function runtimeFundingReasonCode(input: {
    statusCode?: number
    message: string
    responseBody?: string
  }): RuntimeFundingReasonCode | undefined {
    const body = json(input.responseBody)
    const directCode =
      normalizeRuntimeFundingReasonCode(body?.code) ??
      normalizeRuntimeFundingReasonCode(body?.error?.code) ??
      normalizeRuntimeFundingReasonCode(body?.runtimeFunding?.reasonCode) ??
      normalizeRuntimeFundingReasonCode(body?.error?.reasonCode) ??
      normalizeRuntimeFundingReasonCode(body?.fundingFailureReasonCode)
    if (directCode) return directCode

    const haystack = `${input.message}\n${input.responseBody ?? ""}`
    if (input.statusCode === 402 && /payment required|insufficient balance/i.test(haystack)) {
      return "provider_credit_insufficient"
    }
    if (input.statusCode === 503 && /provider allocation|allocation unavailable/i.test(haystack)) {
      return "provider_allocation_unavailable"
    }
    return undefined
  }

  export type ParsedStreamError =
    | {
        type: "context_overflow"
        message: string
        responseBody: string
      }
    | {
        type: "api_error"
        message: string
        isRetryable: false
        responseBody: string
        metadata?: Record<string, string>
      }

  export function parseStreamError(input: unknown): ParsedStreamError | undefined {
    const body = json(input)
    if (!body) return

    const responseBody = JSON.stringify(body)
    if (body.type !== "error") return

    switch (body?.error?.code) {
      case "context_length_exceeded":
        return {
          type: "context_overflow",
          message: "Input exceeds context window of this model",
          responseBody,
        }
      case "insufficient_quota":
        return {
          type: "api_error",
          message: "Quota exceeded. Check your plan and billing details.",
          isRetryable: false,
          responseBody,
        }
      case "usage_not_included":
        return {
          type: "api_error",
          message: "To use GAL Code with your ChatGPT plan, upgrade to Plus: https://chatgpt.com/explore/plus.",
          isRetryable: false,
          responseBody,
        }
      case "invalid_prompt":
        return {
          type: "api_error",
          message: typeof body?.error?.message === "string" ? body?.error?.message : "Invalid prompt.",
          isRetryable: false,
          responseBody,
        }
    }

    const runtimeFundingCode = runtimeFundingReasonCode({
      message: typeof body?.error?.message === "string" ? body.error.message : "",
      responseBody,
    })
    if (runtimeFundingCode) {
      return {
        type: "api_error",
        message: RUNTIME_FUNDING_MESSAGES[runtimeFundingCode],
        isRetryable: false,
        responseBody,
        metadata: {
          reasonCode: runtimeFundingCode,
        },
      }
    }
  }

  export type ParsedAPICallError =
    | {
        type: "context_overflow"
        message: string
        responseBody?: string
      }
    | {
        type: "api_error"
        message: string
        statusCode?: number
        isRetryable: boolean
        responseHeaders?: Record<string, string>
        responseBody?: string
        metadata?: Record<string, string>
      }

  export function parseAPICallError(input: { providerID: ProviderID; error: APICallError }): ParsedAPICallError {
    const m = message(input.providerID, input.error)
    const body = json(input.error.responseBody)
    if (isOverflow(m) || input.error.statusCode === 413 || body?.error?.code === "context_length_exceeded") {
      return {
        type: "context_overflow",
        message: m,
        responseBody: input.error.responseBody,
      }
    }

    const runtimeFundingCode = runtimeFundingReasonCode({
      statusCode: input.error.statusCode,
      message: m,
      responseBody: input.error.responseBody,
    })
    const metadata = {
      ...(input.error.url ? { url: input.error.url } : {}),
      ...(runtimeFundingCode ? { reasonCode: runtimeFundingCode } : {}),
    }
    return {
      type: "api_error",
      message: runtimeFundingCode ? RUNTIME_FUNDING_MESSAGES[runtimeFundingCode] : m,
      statusCode: input.error.statusCode,
      isRetryable: input.providerID.startsWith("openai")
        ? isOpenAiErrorRetryable(input.error)
        : input.error.isRetryable,
      responseHeaders: input.error.responseHeaders,
      responseBody: input.error.responseBody,
      metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
    }
  }
}
