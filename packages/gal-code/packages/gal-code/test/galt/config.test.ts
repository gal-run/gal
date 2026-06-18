import { describe, expect, test } from "bun:test"
import { GALT } from "../../src/galt"
import { GALTConfig, defaultGALTConfig } from "../../src/galt/config"

describe("GALT config defaults", () => {
  test("keeps GAL-T opt-in for developer sessions", () => {
    expect(GALT.ConfigSchema.parse({}).enabled).toBe(false)
    expect(GALTConfig.parse({}).enabled).toBe(false)
    expect(defaultGALTConfig.enabled).toBe(false)
    expect(defaultGALTConfig.entitlements).toEqual([])
  })

  test("parses explicit enablement before access policy is applied", () => {
    expect(GALT.ConfigSchema.parse({ enabled: true }).enabled).toBe(true)
    expect(GALTConfig.parse({ enabled: true }).enabled).toBe(true)
  })

  test("requires cyber entitlement for effective enablement", () => {
    const config = GALT.ConfigSchema.parse({ enabled: true, entitlements: ["cyber"] })

    expect(GALT.applyAccessPolicy(config, { entitlements: [] }).enabled).toBe(false)
    expect(GALT.applyAccessPolicy(config, { entitlements: ["partners"] }).enabled).toBe(false)
    expect(GALT.applyAccessPolicy(config, { entitlements: ["cyber"] }).enabled).toBe(true)
  })
})
