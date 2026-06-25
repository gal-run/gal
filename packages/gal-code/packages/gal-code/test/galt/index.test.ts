import { describe, expect, test, mock } from "bun:test"
import { Effect, Layer } from "effect"
import { GALT } from "../../src/galt"
import { Config } from "../../src/config/config"

// ──────────────────────────────────────────────
// Pure function tests — no layers, no mocks
// ──────────────────────────────────────────────

describe("GALT pure functions", () => {
  describe("applyAccessPolicy", () => {
    const baseConfig: GALT.ConfigSchema = {
      enabled: true,
      guard_url: "http://localhost:8081",
      entitlements: [],
      timeout_ms: 30000,
      default_classification: "UNCLASSIFIED",
      input_sanitization: true,
      output_sanitization: true,
      block_on_failure: true,
      audit_logging: true,
      patterns: { secrets: true, pii: true, steganography: true, vulnerabilities: true },
    }

    test("returns config as-is when not enabled", () => {
      const result = GALT.applyAccessPolicy(
        { ...baseConfig, enabled: false },
        { entitlements: [] },
      )
      expect(result.enabled).toBe(false)
    })

    test("disables config when cyber entitlement is missing", () => {
      const result = GALT.applyAccessPolicy(
        { ...baseConfig, enabled: true },
        { entitlements: [] },
      )
      expect(result.enabled).toBe(false)
    })

    test("disables config when only non-cyber entitlements are present", () => {
      const result = GALT.applyAccessPolicy(
        { ...baseConfig, enabled: true },
        { entitlements: ["partners", "admin"] },
      )
      expect(result.enabled).toBe(false)
    })

    test("keeps enabled when cyber entitlement is present", () => {
      const result = GALT.applyAccessPolicy(
        { ...baseConfig, enabled: true },
        { entitlements: ["cyber"] },
      )
      expect(result.enabled).toBe(true)
    })

    test("keeps enabled when cyber is among multiple entitlements", () => {
      const result = GALT.applyAccessPolicy(
        { ...baseConfig, enabled: true },
        { entitlements: ["partners", "cyber", "admin"] },
      )
      expect(result.enabled).toBe(true)
    })
  })

  describe("ClassificationLevels", () => {
    test("has correct numeric values", () => {
      expect(GALT.ClassificationLevels.UNCLASSIFIED).toBe(0)
      expect(GALT.ClassificationLevels.CONFIDENTIAL).toBe(1)
      expect(GALT.ClassificationLevels.SECRET).toBe(2)
      expect(GALT.ClassificationLevels.TOP_SECRET).toBe(3)
    })
  })

  describe("ViolationEventClass.create", () => {
    test("creates violation event with correct structure", () => {
      const event = GALT.ViolationEventClass.create("input_blocked", "high", {
        request_id: "req-1",
      })
      expect(event.type).toBe("input_blocked")
      expect(event.severity).toBe("high")
      expect(event.details).toEqual({ request_id: "req-1" })
      expect(typeof event.timestamp).toBe("number")
      expect(event.timestamp).toBeGreaterThan(0)
    })

    test("creates output_blocked violation", () => {
      const event = GALT.ViolationEventClass.create("output_blocked", "critical", {
        request_id: "req-2",
        violations: [{ type: "secret_detected" }],
      })
      expect(event.type).toBe("output_blocked")
      expect(event.severity).toBe("critical")
    })
  })

  describe("ConfigSchema defaults", () => {
    test("parses empty config with all defaults", () => {
      const parsed = GALT.ConfigSchema.parse({})
      expect(parsed.enabled).toBe(false)
      expect(parsed.guard_url).toBe("http://localhost:8081")
      expect(parsed.timeout_ms).toBe(30000)
      expect(parsed.default_classification).toBe("UNCLASSIFIED")
      expect(parsed.input_sanitization).toBe(true)
      expect(parsed.output_sanitization).toBe(true)
      expect(parsed.block_on_failure).toBe(true)
      expect(parsed.audit_logging).toBe(true)
      expect(parsed.patterns.secrets).toBe(true)
      expect(parsed.patterns.pii).toBe(true)
      expect(parsed.patterns.steganography).toBe(true)
      expect(parsed.patterns.vulnerabilities).toBe(true)
    })

    test("parses partial overrides", () => {
      const parsed = GALT.ConfigSchema.parse({
        enabled: true,
        default_classification: "CONFIDENTIAL",
        entitlements: ["cyber"],
      })
      expect(parsed.enabled).toBe(true)
      expect(parsed.default_classification).toBe("CONFIDENTIAL")
      expect(parsed.entitlements).toEqual(["cyber"])
      // non-overridden fields keep defaults
      expect(parsed.guard_url).toBe("http://localhost:8081")
      expect(parsed.timeout_ms).toBe(30000)
    })
  })

  describe("SanitizationResult schema", () => {
    test("parses a full sanitization result", () => {
      const result = GALT.SanitizationResult.parse({
        allowed: false,
        classification: "SECRET",
        redactions: 3,
        violations: [
          {
            type: "secret_detected",
            severity: "high",
            description: "API key found in prompt",
            location: { start: 10, end: 40 },
          },
        ],
      })
      expect(result.allowed).toBe(false)
      expect(result.classification).toBe("SECRET")
      expect(result.redactions).toBe(3)
      expect(result.violations).toHaveLength(1)
      expect(result.violations[0].type).toBe("secret_detected")
      expect(result.violations[0].severity).toBe("high")
    })

    test("provides defaults for partial input", () => {
      const result = GALT.SanitizationResult.parse({
        allowed: true,
        classification: "UNCLASSIFIED",
      })
      expect(result.allowed).toBe(true)
      expect(result.redactions).toBe(0)
      expect(result.violations).toEqual([])
    })
  })
})

// ──────────────────────────────────────────────
// Effect-based tests — mock Config only, use
// Effect.runPromise (not makeRuntime) to avoid
// the shared memoMap that caches across tests.
// ──────────────────────────────────────────────

function mockConfigLayer(config: GALT.ConfigSchema, entitlements: string[] = []) {
  return Layer.mock(Config.Service)({
    get: () => Effect.succeed({ galt: config } as unknown as Config.Info),
    getGALTAccess: () => Effect.succeed({ entitlements, sources: [] }),
    getGlobal: () => Effect.succeed({} as unknown as Config.Info),
    getConsoleState: () =>
      Effect.succeed({ entitlements: { cyber: entitlements.includes("cyber") } } as unknown as Config.ConsoleState),
    update: () => Effect.void,
    updateGlobal: () => Effect.succeed({} as unknown as Config.Info),
    invalidate: () => Effect.void,
    directories: () => Effect.succeed([]),
    waitForDependencies: () => Effect.void,
  })
}

const baseConfig: GALT.ConfigSchema = {
  enabled: false,
  guard_url: "http://localhost:8081",
  entitlements: [],
  timeout_ms: 1000,
  default_classification: "UNCLASSIFIED",
  input_sanitization: true,
  output_sanitization: true,
  block_on_failure: true,
  audit_logging: true,
  patterns: { secrets: true, pii: true, steganography: true, vulnerabilities: true },
}

function runGALT<R>(effect: Effect.Effect<R, unknown, GALT.Service>, config: GALT.ConfigSchema, entitlements: string[] = []) {
  const layer = GALT.layer.pipe(Layer.provide(mockConfigLayer(config, entitlements)))
  return effect.pipe(Effect.provide(layer), Effect.runPromise)
}

describe("GALT sanitizeInput", () => {
  test("passes through when GAL-T is disabled", async () => {
    const result = await runGALT(
      Effect.gen(function* () {
        const svc = yield* GALT.Service
        return yield* svc.sanitizeInput({
          request_id: "req-1",
          prompt: "write a hello world function",
          model: "claude",
          classification: "UNCLASSIFIED",
        })
      }),
      { ...baseConfig, enabled: false },
    )
    expect(result.allowed).toBe(true)
    expect(result.sanitized_content).toBe("write a hello world function")
    expect(result.violations).toEqual([])
  })

  test("passes through when input_sanitization is disabled", async () => {
    const result = await runGALT(
      Effect.gen(function* () {
        const svc = yield* GALT.Service
        return yield* svc.sanitizeInput({
          request_id: "req-1",
          prompt: "some prompt",
          model: "claude",
          classification: "UNCLASSIFIED",
        })
      }),
      { ...baseConfig, enabled: true, input_sanitization: false, entitlements: ["cyber"] },
      ["cyber"],
    )
    expect(result.allowed).toBe(true)
    expect(result.sanitized_content).toBe("some prompt")
  })

  test("blocks on failure when guard returns blocked", async () => {
    // Test the block_on_failure path by having the guard return a blocked result
    // (not a network error). This exercises the "result.allowed && !pass" code path.
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            allowed: false,
            classification: "UNCLASSIFIED",
            redactions: 0,
            violations: [{ type: "secret_detected", severity: "high", description: "Blocked content" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
    ) as unknown as typeof fetch

    const result = await runGALT(
      Effect.gen(function* () {
        const svc = yield* GALT.Service
        return yield* svc.sanitizeInput({
          request_id: "req-1",
          prompt: "secret content",
          model: "claude",
          classification: "UNCLASSIFIED",
        })
      }),
      {
        ...baseConfig,
        enabled: true,
        entitlements: ["cyber"],
        guard_url: "http://guard",
        timeout_ms: 5000,
        block_on_failure: true,
        audit_logging: false,
      },
      ["cyber"],
    )
    expect(result.allowed).toBe(false)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0].type).toBe("secret_detected")
    delete (globalThis as any).fetch
  })

  test("passes through when disabled even if guard would block", async () => {
    // If GAL-T is disabled, sanitizeInput passes through regardless
    const result = await runGALT(
      Effect.gen(function* () {
        const svc = yield* GALT.Service
        return yield* svc.sanitizeInput({
          request_id: "req-1",
          prompt: "any content",
          model: "claude",
          classification: "UNCLASSIFIED",
        })
      }),
      { ...baseConfig, enabled: false },
    )
    expect(result.allowed).toBe(true)
    expect(result.sanitized_content).toBe("any content")
  })

  test("returns fetched result when guard responds", async () => {
    globalThis.fetch = mock((url: string | URL | Request) => {
      if (url.toString().includes("/api/v1/sanitize/input")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ allowed: true, sanitized_content: "safe prompt", classification: "UNCLASSIFIED", redactions: 0, violations: [] }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        )
      }
      return Promise.reject(new Error("unexpected URL"))
    }) as unknown as typeof fetch

    const result = await runGALT(
      Effect.gen(function* () {
        const svc = yield* GALT.Service
        return yield* svc.sanitizeInput({
          request_id: "req-1",
          prompt: "original prompt",
          model: "claude",
          classification: "UNCLASSIFIED",
        })
      }),
      { ...baseConfig, enabled: true, entitlements: ["cyber"], guard_url: "http://guard", timeout_ms: 5000 },
      ["cyber"],
    )

    expect(result.allowed).toBe(true)
    expect(result.sanitized_content).toBe("safe prompt")

    delete (globalThis as any).fetch
  })

  test("returns blocked result when guard blocks", async () => {
    globalThis.fetch = mock((url: string | URL | Request) => {
      if (url.toString().includes("/api/v1/sanitize/input")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({
              allowed: false,
              classification: "CONFIDENTIAL",
              redactions: 2,
              violations: [{ type: "secret_detected", severity: "high", description: "API key detected" }],
            }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        )
      }
      return Promise.reject(new Error("unexpected URL"))
    }) as unknown as typeof fetch

    // Disable audit_logging to avoid Bus.publish (needs InstanceContext)
    const result = await runGALT(
      Effect.gen(function* () {
        const svc = yield* GALT.Service
        return yield* svc.sanitizeInput({
          request_id: "req-1",
          prompt: "my api key is sk-abc123",
          model: "claude",
          classification: "UNCLASSIFIED",
        })
      }),
      { ...baseConfig, enabled: true, entitlements: ["cyber"], guard_url: "http://guard", timeout_ms: 5000, audit_logging: false },
      ["cyber"],
    )

    expect(result.allowed).toBe(false)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0].type).toBe("secret_detected")

    delete (globalThis as any).fetch
  })
})

describe("GALT sanitizeOutput", () => {
  test("passes through when GAL-T is disabled", async () => {
    const result = await runGALT(
      Effect.gen(function* () {
        const svc = yield* GALT.Service
        return yield* svc.sanitizeOutput({
          request_id: "req-1",
          content: "response content",
          classification: "UNCLASSIFIED",
        })
      }),
      { ...baseConfig, enabled: false },
    )
    expect(result.allowed).toBe(true)
    expect(result.sanitized_content).toBe("response content")
  })

  test("passes through when output_sanitization is disabled", async () => {
    const result = await runGALT(
      Effect.gen(function* () {
        const svc = yield* GALT.Service
        return yield* svc.sanitizeOutput({
          request_id: "req-1",
          content: "response",
          classification: "UNCLASSIFIED",
        })
      }),
      { ...baseConfig, enabled: true, output_sanitization: false, entitlements: ["cyber"] },
      ["cyber"],
    )
    expect(result.allowed).toBe(true)
  })

  test("blocks on failure when guard blocks output", async () => {
    globalThis.fetch = mock(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            allowed: false,
            classification: "SECRET",
            redactions: 0,
            violations: [{ type: "classification_violation", severity: "high", description: "Content exceeds classification" }],
          }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      )
    ) as unknown as typeof fetch

    const result = await runGALT(
      Effect.gen(function* () {
        const svc = yield* GALT.Service
        return yield* svc.sanitizeOutput({
          request_id: "req-1",
          content: "classified content",
          classification: "UNCLASSIFIED",
        })
      }),
      { ...baseConfig, enabled: true, entitlements: ["cyber"], guard_url: "http://guard", timeout_ms: 5000, block_on_failure: true, audit_logging: false },
      ["cyber"],
    )
    expect(result.allowed).toBe(false)
    expect(result.violations).toHaveLength(1)
    expect(result.violations[0].type).toBe("classification_violation")
    delete (globalThis as any).fetch
  })

  test("returns fetched result when guard responds", async () => {
    globalThis.fetch = mock((url: string | URL | Request) => {
      if (url.toString().includes("/api/v1/sanitize/output")) {
        return Promise.resolve(
          new Response(
            JSON.stringify({ allowed: true, sanitized_content: "safe response", classification: "UNCLASSIFIED", redactions: 0, violations: [] }),
            { status: 200, headers: { "content-type": "application/json" } },
          ),
        )
      }
      return Promise.reject(new Error("unexpected URL"))
    }) as unknown as typeof fetch

    const result = await runGALT(
      Effect.gen(function* () {
        const svc = yield* GALT.Service
        return yield* svc.sanitizeOutput({
          request_id: "req-1",
          content: "original response",
          classification: "UNCLASSIFIED",
        })
      }),
      { ...baseConfig, enabled: true, entitlements: ["cyber"], guard_url: "http://guard", timeout_ms: 5000 },
      ["cyber"],
    )

    expect(result.allowed).toBe(true)
    expect(result.sanitized_content).toBe("safe response")

    delete (globalThis as any).fetch
  })
})

describe("GALT checkClassification", () => {
  test("allows UNCLASSIFIED when default is UNCLASSIFIED", async () => {
    const result = await runGALT(
      Effect.gen(function* () {
        const svc = yield* GALT.Service
        return yield* svc.checkClassification("UNCLASSIFIED")
      }),
      { ...baseConfig, enabled: true, default_classification: "UNCLASSIFIED", entitlements: ["cyber"] },
      ["cyber"],
    )
    expect(result).toBe(true)
  })

  test("rejects CONFIDENTIAL when default is UNCLASSIFIED", async () => {
    const result = await runGALT(
      Effect.gen(function* () {
        const svc = yield* GALT.Service
        return yield* svc.checkClassification("CONFIDENTIAL")
      }),
      { ...baseConfig, enabled: true, default_classification: "UNCLASSIFIED", entitlements: ["cyber"] },
      ["cyber"],
    )
    expect(result).toBe(false)
  })

  test("allows CONFIDENTIAL when default is CONFIDENTIAL", async () => {
    const result = await runGALT(
      Effect.gen(function* () {
        const svc = yield* GALT.Service
        return yield* svc.checkClassification("CONFIDENTIAL")
      }),
      { ...baseConfig, enabled: true, default_classification: "CONFIDENTIAL", entitlements: ["cyber"] },
      ["cyber"],
    )
    expect(result).toBe(true)
  })

  test("allows UNCLASSIFIED when default is CONFIDENTIAL", async () => {
    const result = await runGALT(
      Effect.gen(function* () {
        const svc = yield* GALT.Service
        return yield* svc.checkClassification("UNCLASSIFIED")
      }),
      { ...baseConfig, enabled: true, default_classification: "CONFIDENTIAL", entitlements: ["cyber"] },
      ["cyber"],
    )
    expect(result).toBe(true)
  })
})

describe("GALT getConfig (with entitlement check)", () => {
  test("returns enabled=false when cyber entitlement is not granted", async () => {
    const config = await runGALT(
      Effect.gen(function* () {
        const svc = yield* GALT.Service
        return yield* svc.getConfig()
      }),
      { ...baseConfig, enabled: true },
      [],
    )
    expect(config.enabled).toBe(false)
  })

  test("returns enabled=true when cyber entitlement is granted", async () => {
    const config = await runGALT(
      Effect.gen(function* () {
        const svc = yield* GALT.Service
        return yield* svc.getConfig()
      }),
      { ...baseConfig, enabled: true, entitlements: ["cyber"] },
      ["cyber"],
    )
    expect(config.enabled).toBe(true)
  })
})
