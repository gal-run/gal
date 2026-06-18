import { afterEach, describe, expect, mock, spyOn, test } from "bun:test"
import { Server } from "../../src/server/server"
import * as Net from "../../src/cli/network"
import * as Gov from "../../src/cli/cmd/governance"
import * as UI from "../../src/cli/ui"
import * as Boot from "../../src/cli/bootstrap"
import { ServeCommand } from "../../src/cli/cmd/serve"
import { WebCommand } from "../../src/cli/cmd/web"
import { AcpCommand } from "../../src/cli/cmd/acp"

const err = new Error("stop")

function args() {
  return {
    _: [],
    $0: "gal-code",
    port: 0,
    hostname: "127.0.0.1",
    mdns: false,
    "mdns-domain": "gal-code.local",
    cors: [],
    governance: undefined,
    "governance-mode": "block",
    "governance-min-confidence": 0.9,
    cwd: process.cwd(),
  }
}

function setup() {
  const order: string[] = []
  spyOn(Gov, "applyGov").mockImplementation(async () => {
    order.push("gov")
    return true
  })
  spyOn(Net, "resolveNetworkOptions").mockImplementation(async () => {
    order.push("net")
    return {
      hostname: "127.0.0.1",
      port: 0,
      mdns: false,
      mdnsDomain: "gal-code.local",
      cors: [],
    }
  })
  spyOn(Server, "listen").mockImplementation(async () => {
    order.push("listen")
    throw err
  })
  spyOn(UI.UI, "println").mockImplementation(() => {})
  spyOn(console, "log").mockImplementation(() => {})
  spyOn(Boot, "bootstrap").mockImplementation(async (_dir, cb) => cb())
  return order
}

describe("server governance wiring", () => {
  afterEach(() => {
    mock.restore()
  })

  test("serve applies governance before listening", async () => {
    const order = setup()
    await expect(ServeCommand.handler?.(args() as never)).rejects.toBe(err)
    expect(order).toEqual(["gov", "net", "listen"])
  })

  test("web applies governance before listening", async () => {
    const order = setup()
    await expect(WebCommand.handler?.(args() as never)).rejects.toBe(err)
    expect(order).toEqual(["gov", "net", "listen"])
  })

  test("acp applies governance before listening", async () => {
    const order = setup()
    await expect(AcpCommand.handler?.(args() as never)).rejects.toBe(err)
    expect(order).toEqual(["gov", "net", "listen"])
  })
})
