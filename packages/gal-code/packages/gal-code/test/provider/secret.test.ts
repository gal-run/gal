import { expect, mock, test } from "bun:test"
import path from "path"
import { Env } from "../../src/env"
import { Instance } from "../../src/project/instance"
import * as Secret from "../../src/provider/secret"
import { tmpdir } from "../fixture/fixture"

test("loads secret from configured GCP project", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "gal-code.json"),
        JSON.stringify({
          $schema: "https://gal.run/config.json",
        }),
      )
    },
  })

  const auth = {
    getAccessToken: mock(async () => "test-token"),
  }
  const fetchFn = mock(async (input: string | URL | Request, init?: RequestInit) => {
    expect(String(input)).toBe(
      "https://secretmanager.googleapis.com/v1/projects/gal-run/secrets/VULTR_INFERENCE_API_KEY/versions/latest:access",
    )
    expect(init?.headers).toMatchObject({
      Authorization: "Bearer test-token",
    })
    return new Response(
      JSON.stringify({
        payload: {
          data: Buffer.from("test-secret-key\n").toString("base64"),
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    )
  })

  await Instance.provide({
    directory: tmp.path,
    init: async () => {
      Env.set("GAL_CODE_SECRET_PROJECT", "gal-run")
    },
    fn: async () => {
      const result = await Secret.load("VULTR_INFERENCE_API_KEY", {
        auth,
        fetch: fetchFn as unknown as typeof fetch,
      })
      expect(result).toBe("test-secret-key")
    },
  })
})

test("returns undefined when no GCP project is configured", async () => {
  await using tmp = await tmpdir({
    init: async (dir) => {
      await Bun.write(
        path.join(dir, "gal-code.json"),
        JSON.stringify({
          $schema: "https://gal.run/config.json",
        }),
      )
    },
  })

  const auth = {
    getAccessToken: mock(async () => "test-token"),
  }
  const fetchFn = mock(async () => new Response())

  await Instance.provide({
    directory: tmp.path,
    fn: async () => {
      const result = await Secret.load("VULTR_INFERENCE_API_KEY", {
        auth,
        fetch: fetchFn as unknown as typeof fetch,
      })
      expect(result).toBeUndefined()
      expect(auth.getAccessToken).not.toHaveBeenCalled()
      expect(fetchFn).not.toHaveBeenCalled()
    },
  })
})
