import { describe, expect, test } from "bun:test"
import path from "path"
import { Flag } from "../../src/flag/flag"
import { Global } from "../../src/global"
import { Installation } from "../../src/installation"
import { Database } from "../../src/storage/db"

describe("Database.Path", () => {
  test("returns database path for the current channel", () => {
    const expected =
      ["latest", "beta", "prod", "main", "dev", "local"].includes(Installation.CHANNEL) ||
      Flag.GAL_CODE_DISABLE_CHANNEL_DB
        ? path.join(Global.Path.data, "gal-code.db")
        : path.join(Global.Path.data, `gal-code-${Installation.CHANNEL.replace(/[^a-zA-Z0-9._-]/g, "-")}.db`)
    expect(Database.getChannelPath()).toBe(expected)
  })
})
