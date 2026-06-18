import { describe, expect, test } from "bun:test"
import { withNetworkOptions, resolveNetworkOptions } from "../../../src/cli/network"
import { AcpCommand } from "../../../src/cli/cmd/acp"
import yargs from "yargs"

describe("withNetworkOptions", () => {
  test("adds port option to yargs", () => {
    const y = yargs([])
    const result = withNetworkOptions(y as any) as any
    const opts = result.getOptions()
    expect(opts.key["port"]).toBeDefined()
  })

  test("adds hostname option to yargs", () => {
    const y = yargs([])
    const result = withNetworkOptions(y as any) as any
    const opts = result.getOptions()
    expect(opts.key["hostname"]).toBeDefined()
  })

  test("adds mdns option to yargs", () => {
    const y = yargs([])
    const result = withNetworkOptions(y as any) as any
    const opts = result.getOptions()
    expect(opts.key["mdns"]).toBeDefined()
  })

  test("adds mdns-domain option to yargs", () => {
    const y = yargs([])
    const result = withNetworkOptions(y as any) as any
    const opts = result.getOptions()
    expect(opts.key["mdns-domain"]).toBeDefined()
  })

  test("adds cors option to yargs", () => {
    const y = yargs([])
    const result = withNetworkOptions(y as any) as any
    const opts = result.getOptions()
    expect(opts.key["cors"]).toBeDefined()
  })
})

describe("resolveNetworkOptions defaults", () => {
  test("returns default hostname 127.0.0.1 with no global config", async () => {
    const result = await resolveNetworkOptions({
      port: 0,
      hostname: "127.0.0.1",
      mdns: false,
      "mdns-domain": "gal-code.local",
      cors: [],
    })
    expect(result.hostname).toBe("127.0.0.1")
  })

  test("returns default port 0", async () => {
    const result = await resolveNetworkOptions({
      port: 0,
      hostname: "127.0.0.1",
      mdns: false,
      "mdns-domain": "gal-code.local",
      cors: [],
    })
    expect(result.port).toBe(0)
  })

  test("preserves custom hostname", async () => {
    const result = await resolveNetworkOptions({
      port: 0,
      hostname: "0.0.0.0",
      mdns: false,
      "mdns-domain": "gal-code.local",
      cors: [],
    })
    expect(result.hostname).toBe("0.0.0.0")
  })

  test("propagates cors entries from args", async () => {
    const result = await resolveNetworkOptions({
      port: 0,
      hostname: "127.0.0.1",
      mdns: false,
      "mdns-domain": "gal-code.local",
      cors: ["https://example.com"],
    })
    expect(result.cors).toContain("https://example.com")
  })
})

describe("AcpCommand option definitions", () => {
  test("defines governance options via yargs builder", () => {
    const y = yargs([])
    const built = (AcpCommand.builder as any)(y)
    const opts = built.getOptions()
    expect(opts.key["governance"]).toBeDefined()
    expect(opts.key["governance-mode"]).toBeDefined()
    expect(opts.key["governance-min-confidence"]).toBeDefined()
    expect(opts.key["cwd"]).toBeDefined()
  })

  test("command registered as acp", () => {
    expect(AcpCommand.command).toBe("acp")
    expect(AcpCommand.describe).toContain("ACP")
  })
})
