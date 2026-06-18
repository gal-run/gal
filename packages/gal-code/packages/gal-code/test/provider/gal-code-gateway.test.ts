import { describe, expect, test } from "bun:test"
import { GalCodeGateway } from "../../src/provider/gal-code-gateway"

function requestURL(input: RequestInfo | URL) {
  if (input instanceof Request) return input.url
  if (input instanceof URL) return input.toString()
  return String(input)
}

describe("GalCodeGateway.withProductionFallback", () => {
  test("preflights local gateway and uses production when health is down", async () => {
    const seen: string[] = []
    const fetchFn = async (input: RequestInfo | URL) => {
      const url = requestURL(input)
      seen.push(url)
      if (url === "http://127.0.0.1:3000/health") return new Response("down", { status: 503 })
      return new Response("ok", { status: 200 })
    }

    const wrapped = GalCodeGateway.withProductionFallback({
      providerID: "gal-code",
      fetchFn,
      productionBaseURL: "https://api.gal.run/api/gal-code/v1",
      healthTimeoutMs: 1,
      disableFallback: false,
    })

    const response = await wrapped("http://127.0.0.1:3000/api/gal-code/v1/chat/completions", { method: "POST" })

    expect(await response.text()).toBe("ok")
    expect(seen).toEqual([
      "http://127.0.0.1:3000/health",
      "https://api.gal.run/api/gal-code/v1/chat/completions",
    ])
  })

  test("keeps using local gateway when health passes", async () => {
    const seen: string[] = []
    const fetchFn = async (input: RequestInfo | URL) => {
      const url = requestURL(input)
      seen.push(url)
      return new Response(url === "http://localhost:3000/health" ? "healthy" : "local", { status: 200 })
    }

    const wrapped = GalCodeGateway.withProductionFallback({
      providerID: "gal-code",
      fetchFn,
      productionBaseURL: "https://api.gal.run/api/gal-code/v1",
      healthTimeoutMs: 1,
      disableFallback: false,
    })

    const response = await wrapped("http://localhost:3000/api/gal-code/v1/chat/completions", { method: "POST" })

    expect(await response.text()).toBe("local")
    expect(seen).toEqual([
      "http://localhost:3000/health",
      "http://localhost:3000/api/gal-code/v1/chat/completions",
    ])
  })

  test("retries production gateway when local request drops after a healthy preflight", async () => {
    const seen: string[] = []
    const fetchFn = async (input: RequestInfo | URL) => {
      const url = requestURL(input)
      seen.push(url)
      if (url === "http://localhost:3000/health") return new Response("healthy", { status: 200 })
      if (url.startsWith("http://localhost:3000/")) throw new TypeError("fetch failed")
      return new Response("production", { status: 200 })
    }

    const wrapped = GalCodeGateway.withProductionFallback({
      providerID: "gal-code",
      fetchFn,
      productionBaseURL: "https://api.gal.run/api/gal-code/v1",
      healthTimeoutMs: 1,
      disableFallback: false,
    })

    const response = await wrapped("http://localhost:3000/api/gal-code/v1/chat/completions", { method: "POST" })

    expect(await response.text()).toBe("production")
    expect(seen).toEqual([
      "http://localhost:3000/health",
      "http://localhost:3000/api/gal-code/v1/chat/completions",
      "https://api.gal.run/api/gal-code/v1/chat/completions",
    ])
  })

  test("does not rewrite non-gal-code providers", async () => {
    const seen: string[] = []
    const fetchFn = async (input: RequestInfo | URL) => {
      const url = requestURL(input)
      seen.push(url)
      return new Response("ok", { status: 200 })
    }

    const wrapped = GalCodeGateway.withProductionFallback({
      providerID: "openai",
      fetchFn,
      productionBaseURL: "https://api.gal.run/api/gal-code/v1",
    })

    await wrapped("http://localhost:3000/api/gal-code/v1/chat/completions", { method: "POST" })

    expect(seen).toEqual(["http://localhost:3000/api/gal-code/v1/chat/completions"])
  })
})
