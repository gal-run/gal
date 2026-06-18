import { afterEach, describe, expect, test } from "bun:test"
import { applyGov, gov, pickModel } from "../../src/cli/cmd/governance"

const env = {
  root: process.env.GAL_GOVERNANCE_SIDECAR_ROOT,
  py: process.env.GAL_GOVERNANCE_SIDECAR_PYTHON,
  model: process.env.GAL_MODEL,
  art: process.env.GAL_GOVERNANCE_SIDECAR_ARTIFACT,
  auth: process.env.GAL_AUTH_TOKEN,
  console: process.env.GAL_CODE_CONSOLE_TOKEN,
  api: process.env.ANTHROPIC_API_KEY,
  enabled: process.env.GAL_ENABLED,
  mode: process.env.GAL_MODE,
  cut: process.env.GAL_GOVERNANCE_SIDECAR_MIN_CONFIDENCE,
}

afterEach(() => {
  for (const [key, value] of Object.entries({
    GAL_GOVERNANCE_SIDECAR_ROOT: env.root,
    GAL_GOVERNANCE_SIDECAR_PYTHON: env.py,
    GAL_MODEL: env.model,
    GAL_GOVERNANCE_SIDECAR_ARTIFACT: env.art,
    GAL_AUTH_TOKEN: env.auth,
    GAL_CODE_CONSOLE_TOKEN: env.console,
    ANTHROPIC_API_KEY: env.api,
    GAL_ENABLED: env.enabled,
    GAL_MODE: env.mode,
    GAL_GOVERNANCE_SIDECAR_MIN_CONFIDENCE: env.cut,
  })) {
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe("run governance", () => {
  test("derives local bundled sidecar config", () => {
    const cfg = gov({ governance: true, "governance-mode": "shadow", "governance-min-confidence": 0.8 })

    expect(cfg).toEqual({
      mode: "shadow",
      cut: 0.8,
    })
  })

  test("uses supplied backend fallback for governance when needed", () => {
    delete process.env.GAL_AUTH_TOKEN
    delete process.env.GAL_CODE_CONSOLE_TOKEN
    process.env.ANTHROPIC_API_KEY = "test-key"

    expect(pickModel({ governance: true }, "deepseek/deepseek-v4-pro")).toBe("deepseek/deepseek-v4-pro")
  })

  test("keeps explicit model over governance fallback", () => {
    delete process.env.GAL_AUTH_TOKEN
    delete process.env.GAL_CODE_CONSOLE_TOKEN
    process.env.ANTHROPIC_API_KEY = "test-key"

    expect(pickModel({ governance: true, model: "anthropic/claude-sonnet-4-20250514" }, "deepseek/deepseek-v4-pro")).toBe(
      "anthropic/claude-sonnet-4-20250514",
    )
  })

  test("uses supplied fallback after automatic governance enables the sidecar", () => {
    delete process.env.GAL_AUTH_TOKEN
    delete process.env.GAL_CODE_CONSOLE_TOKEN
    process.env.ANTHROPIC_API_KEY = "test-key"
    process.env.GAL_ENABLED = "1"

    expect(pickModel({}, "deepseek/deepseek-v4-pro")).toBe("deepseek/deepseek-v4-pro")
  })

  test("returns no fallback model without backend selection", () => {
    delete process.env.GAL_AUTH_TOKEN
    delete process.env.GAL_CODE_CONSOLE_TOKEN
    process.env.GAL_ENABLED = "1"

    expect(pickModel({})).toBeUndefined()
  })

  test("rejects governance when attaching to a remote server", async () => {
    await expect(applyGov({ governance: true, attach: "http://localhost:4096" })).rejects.toThrow(
      "--governance is only supported for local runs",
    )
  })

  test("exports local sidecar env automatically", async () => {
    await applyGov({ "governance-mode": "block", "governance-min-confidence": 0.95 })

    expect(process.env.GAL_ENABLED).toBe("1")
    expect(process.env.GAL_MODE).toBe("block")
    expect(process.env.GAL_GOVERNANCE_SIDECAR_MIN_CONFIDENCE).toBe("0.95")
    expect(process.env.GAL_GOVERNANCE_SIDECAR_PYTHON).toBeUndefined()
    expect(process.env.GAL_MODEL).toBeUndefined()
    expect(process.env.GAL_GOVERNANCE_SIDECAR_ARTIFACT).toBeUndefined()
    expect(process.env.GAL_GOVERNANCE_SIDECAR_ROOT).toBeUndefined()
  })

  test("skips governance silently when attaching without an explicit override", async () => {
    delete process.env.GAL_ENABLED

    await expect(applyGov({ attach: "http://localhost:4096" })).resolves.toBeFalse()
    expect(process.env.GAL_ENABLED ?? "").toBe("0")
  })

  test("explicit no-governance disables inherited sidecar env", async () => {
    process.env.GAL_ENABLED = "1"
    process.env.GAL_GOVERNANCE_SIDECAR_PYTHON = "/tmp/python"

    await expect(applyGov({ governance: false })).resolves.toBeFalse()
    expect(process.env.GAL_ENABLED ?? "").toBe("0")
    expect(process.env.GAL_GOVERNANCE_SIDECAR_PYTHON).toBeUndefined()
  })
})
