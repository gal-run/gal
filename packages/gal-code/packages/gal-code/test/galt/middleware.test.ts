import { describe, expect, test } from "bun:test"
import { Effect, Layer } from "effect"
import { GALT } from "../../src/galt"
import { Middleware } from "../../src/galt/middleware"
import type { ConfigSchema } from "../../src/galt"

// ──────────────────────────────────────────────
// Mock GALT service with controllable behaviour
// ──────────────────────────────────────────────

function makeMockGALT(
  configOverrides: Partial<ConfigSchema> = {},
  sanitizeInputBehaviour?: { allowed: boolean; sanitized_content?: string; classification?: string; redactions?: number; violations?: Array<{ type: string; severity: string; description: string }> },
  sanitizeOutputBehaviour?: { allowed: boolean; sanitized_content?: string; classification?: string; redactions?: number; violations?: Array<{ type: string; severity: string; description: string }> },
) {
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
  const si = sanitizeInputBehaviour ?? { allowed: true }
  const so = sanitizeOutputBehaviour ?? { allowed: true }

  return Layer.succeed(
    GALT.Service,
    GALT.Service.of({
      getConfig: () => Effect.succeed(config),
      sanitizeInput: (input) =>
        Effect.succeed({
          allowed: si.allowed,
          sanitized_content: si.sanitized_content ?? input.prompt,
          classification: si.classification ?? config.default_classification,
          redactions: si.redactions ?? 0,
          violations: si.violations ?? [],
        }),
      sanitizeOutput: (input) =>
        Effect.succeed({
          allowed: so.allowed,
          sanitized_content: so.sanitized_content ?? input.content,
          classification: so.classification ?? config.default_classification,
          redactions: so.redactions ?? 0,
          violations: so.violations ?? [],
        }),
      checkClassification: (level) => Effect.succeed(true),
    }),
  )
}

function runMiddleware<R>(
  effect: Effect.Effect<R, unknown, Middleware.Service>,
  configOverrides?: Partial<ConfigSchema>,
  sanitizeInputBehaviour?: { allowed: boolean; sanitized_content?: string; classification?: string; redactions?: number; violations?: Array<{ type: string; severity: string; description: string }> },
  sanitizeOutputBehaviour?: { allowed: boolean; sanitized_content?: string; classification?: string; redactions?: number; violations?: Array<{ type: string; severity: string; description: string }> },
) {
  const layer = Middleware.layer.pipe(
    Layer.provide(makeMockGALT(configOverrides, sanitizeInputBehaviour, sanitizeOutputBehaviour)),
  )
  return effect.pipe(Effect.provide(layer), Effect.runPromise)
}

// ──────────────────────────────────────────────
// transformPrompt tests
// ──────────────────────────────────────────────

describe("Middleware.transformPrompt", () => {
  const ctx = {
    sessionID: "sess-1",
    requestID: "req-1",
    model: "claude",
    providerID: "anthropic",
    userID: "user-1",
  }

  test("passes through when GAL-T is disabled", async () => {
    const result = await runMiddleware(
      Effect.gen(function* () {
        const svc = yield* Middleware.Service
        return yield* svc.transformPrompt("write hello world", ctx)
      }),
      { enabled: false },
    )
    expect(result.allowed).toBe(true)
    expect(result.content).toBe("write hello world")
  })

  test("passes through when input_sanitization is disabled", async () => {
    const result = await runMiddleware(
      Effect.gen(function* () {
        const svc = yield* Middleware.Service
        return yield* svc.transformPrompt("write hello world", ctx)
      }),
      { input_sanitization: false },
    )
    expect(result.allowed).toBe(true)
    expect(result.content).toBe("write hello world")
  })

  test("passes through when sanitize returns allowed with no redactions", async () => {
    const result = await runMiddleware(
      Effect.gen(function* () {
        const svc = yield* Middleware.Service
        return yield* svc.transformPrompt("safe content", ctx)
      }),
      {},
      { allowed: true },
    )
    expect(result.allowed).toBe(true)
    expect(result.content).toBe("safe content")
  })

  test("returns sanitized content when guard redacts content", async () => {
    const result = await runMiddleware(
      Effect.gen(function* () {
        const svc = yield* Middleware.Service
        return yield* svc.transformPrompt("my api key is sk-abc123", ctx)
      }),
      {},
      { allowed: true, sanitized_content: "safe [REDACTED] content", redactions: 1 },
    )
    expect(result.allowed).toBe(true)
    expect(result.content).toBe("safe [REDACTED] content")
    expect(result.redactions).toBe(1)
  })

  test("blocks when sanitize returns blocked", async () => {
    const result = await runMiddleware(
      Effect.gen(function* () {
        const svc = yield* Middleware.Service
        return yield* svc.transformPrompt("my api key is sk-abc123", ctx)
      }),
      {},
      {
        allowed: false,
        redactions: 2,
        violations: [{ type: "secret_detected", severity: "high", description: "API key" }],
      },
    )
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe("Input blocked by security policy")
    expect(result.redactions).toBe(2)
  })
})

// ──────────────────────────────────────────────
// transformResponse tests
// ──────────────────────────────────────────────

describe("Middleware.transformResponse", () => {
  const ctx = {
    sessionID: "sess-1",
    requestID: "req-1",
    model: "claude",
    providerID: "anthropic",
    userID: "user-1",
  }

  test("passes through when GAL-T is disabled", async () => {
    const result = await runMiddleware(
      Effect.gen(function* () {
        const svc = yield* Middleware.Service
        return yield* svc.transformResponse("response content", ctx)
      }),
      { enabled: false },
    )
    expect(result.allowed).toBe(true)
    expect(result.content).toBe("response content")
  })

  test("passes through when output_sanitization is disabled", async () => {
    const result = await runMiddleware(
      Effect.gen(function* () {
        const svc = yield* Middleware.Service
        return yield* svc.transformResponse("response content", ctx)
      }),
      { output_sanitization: false },
    )
    expect(result.allowed).toBe(true)
    expect(result.content).toBe("response content")
  })

  test("passes through when sanitize returns allowed", async () => {
    const result = await runMiddleware(
      Effect.gen(function* () {
        const svc = yield* Middleware.Service
        return yield* svc.transformResponse("safe response", ctx)
      }),
      {},
      undefined,
      { allowed: true },
    )
    expect(result.allowed).toBe(true)
    expect(result.content).toBe("safe response")
  })

  test("returns sanitized output when guard redacts", async () => {
    const result = await runMiddleware(
      Effect.gen(function* () {
        const svc = yield* Middleware.Service
        return yield* svc.transformResponse("response with secret", ctx)
      }),
      {},
      undefined,
      { allowed: true, sanitized_content: "safe [REDACTED]", redactions: 1 },
    )
    expect(result.allowed).toBe(true)
    expect(result.content).toBe("safe [REDACTED]")
    expect(result.redactions).toBe(1)
  })

  test("blocks when sanitize returns blocked", async () => {
    const result = await runMiddleware(
      Effect.gen(function* () {
        const svc = yield* Middleware.Service
        return yield* svc.transformResponse("password=abc123", ctx)
      }),
      {},
      undefined,
      {
        allowed: false,
        redactions: 3,
        violations: [{ type: "secret_detected", severity: "critical", description: "Password leaked" }],
      },
    )
    expect(result.allowed).toBe(false)
    expect(result.reason).toBe("Output blocked by security policy")
    expect(result.redactions).toBe(3)
  })
})

// ──────────────────────────────────────────────
// interceptToolCall tests
// ──────────────────────────────────────────────

describe("Middleware.interceptToolCall", () => {
  const ctx = {
    sessionID: "sess-1",
    requestID: "req-1",
    model: "claude",
    providerID: "anthropic",
    userID: "user-1",
  }

  test("passes through when GAL-T is disabled", async () => {
    const result = await runMiddleware(
      Effect.gen(function* () {
        const svc = yield* Middleware.Service
        return yield* svc.interceptToolCall("bash", { cmd: "rm -rf /" }, ctx)
      }),
      { enabled: false },
    )
    expect(result.allowed).toBe(true)
    expect(result.args).toEqual({ cmd: "rm -rf /" })
  })

  test("passes through non-dangerous tool without sanitizing", async () => {
    const result = await runMiddleware(
      Effect.gen(function* () {
        const svc = yield* Middleware.Service
        return yield* svc.interceptToolCall("read", { path: "/file" }, ctx)
      }),
    )
    expect(result.allowed).toBe(true)
    expect(result.args).toEqual({ path: "/file" })
  })

  test("sanitizes bash tool args when GAL-T is enabled", async () => {
    const result = await runMiddleware(
      Effect.gen(function* () {
        const svc = yield* Middleware.Service
        return yield* svc.interceptToolCall("bash", { cmd: "rm -rf /" }, ctx)
      }),
      {},
      { allowed: true, sanitized_content: '{"cmd":"ls"}', redactions: 2 },
    )
    expect(result.allowed).toBe(true)
    expect(result.args).toEqual({ cmd: "ls" })
  })

  test("blocks dangerous tool when sanitize returns blocked", async () => {
    const result = await runMiddleware(
      Effect.gen(function* () {
        const svc = yield* Middleware.Service
        return yield* svc.interceptToolCall("bash", { cmd: "rm -rf /" }, ctx)
      }),
      {},
      { allowed: false, violations: [{ type: "suspicious_pattern", severity: "high", description: "rm -rf" }] },
    )
    expect(result.allowed).toBe(false)
  })

  test("sanitizes write tool args when enabled", async () => {
    const result = await runMiddleware(
      Effect.gen(function* () {
        const svc = yield* Middleware.Service
        return yield* svc.interceptToolCall("write", { path: "/etc/passwd" }, ctx)
      }),
      {},
      { allowed: true, sanitized_content: '{"path":"safe.txt"}', redactions: 2 },
    )
    expect(result.allowed).toBe(true)
    expect(result.args).toEqual({ path: "safe.txt" })
  })

  test("sanitizes edit tool args when enabled", async () => {
    const result = await runMiddleware(
      Effect.gen(function* () {
        const svc = yield* Middleware.Service
        return yield* svc.interceptToolCall("edit", { path: "/etc/shadow" }, ctx)
      }),
      {},
      { allowed: true, sanitized_content: '{"path":"safe.txt"}', redactions: 2 },
    )
    expect(result.allowed).toBe(true)
    expect(result.args).toEqual({ path: "safe.txt" })
  })
})

// ──────────────────────────────────────────────
// interceptToolResult tests
// ──────────────────────────────────────────────

describe("Middleware.interceptToolResult", () => {
  const ctx = {
    sessionID: "sess-1",
    requestID: "req-1",
    model: "claude",
    providerID: "anthropic",
    userID: "user-1",
  }

  test("passes through when GAL-T is disabled", async () => {
    const result = await runMiddleware(
      Effect.gen(function* () {
        const svc = yield* Middleware.Service
        return yield* svc.interceptToolResult("bash", { stdout: "ok" }, ctx)
      }),
      { enabled: false },
    )
    expect(result.allowed).toBe(true)
    expect(result.result).toEqual({ stdout: "ok" })
  })

  test("passes through when output_sanitization is disabled", async () => {
    const result = await runMiddleware(
      Effect.gen(function* () {
        const svc = yield* Middleware.Service
        return yield* svc.interceptToolResult("bash", { stdout: "ok" }, ctx)
      }),
      { output_sanitization: false },
    )
    expect(result.allowed).toBe(true)
  })

  test("passes through when sanitize returns allowed", async () => {
    const result = await runMiddleware(
      Effect.gen(function* () {
        const svc = yield* Middleware.Service
        return yield* svc.interceptToolResult("bash", { stdout: "ok" }, ctx)
      }),
      {},
      undefined,
      { allowed: true },
    )
    expect(result.allowed).toBe(true)
  })

  test("returns sanitized content for string results", async () => {
    const result = await runMiddleware(
      Effect.gen(function* () {
        const svc = yield* Middleware.Service
        return yield* svc.interceptToolResult("bash", "stdout with secret", ctx)
      }),
      {},
      undefined,
      { allowed: true, sanitized_content: "safe stdout", redactions: 1 },
    )
    expect(result.allowed).toBe(true)
    expect(result.result).toBe("safe stdout")
  })

  test("blocks tool result when sanitize returns blocked", async () => {
    const result = await runMiddleware(
      Effect.gen(function* () {
        const svc = yield* Middleware.Service
        return yield* svc.interceptToolResult("bash", "output with secret", ctx)
      }),
      {},
      undefined,
      {
        allowed: false,
        redactions: 2,
        violations: [{ type: "secret_detected", severity: "critical", description: "Secret leaked" }],
      },
    )
    expect(result.allowed).toBe(false)
  })
})
