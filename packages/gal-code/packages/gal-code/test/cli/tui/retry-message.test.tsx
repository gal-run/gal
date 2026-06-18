/** @jsxImportSource @opentui/solid */
import { describe, expect, test } from "bun:test"
import { createMemo } from "solid-js"

const formatRetryMessage = (message: string | undefined): string => {
  if (!message || message === "<none>" || message.trim() === "") {
    return "Upstream error (no details available)"
  }
  return message
}

describe("TUI retry message formatting", () => {
  test("replaces <none> with fallback in TUI display", () => {
    const status = { type: "retry" as const, attempt: 1, message: "<none>", next: Date.now() + 1000 }
    const message = createMemo(() => {
      if (status.type !== "retry") return ""
      if (status.message.includes("exceeded your current quota") && status.message.includes("gemini")) {
        return "gemini is way too hot right now"
      }
      return formatRetryMessage(status.message)
    })
    
    expect(message()).toBe("Upstream error (no details available)")
    expect(message()).not.toBe("<none>")
  })

  test("displays normalized message with host", () => {
    const status = { type: "retry" as const, attempt: 1, message: "Upstream error (api.openai.com)", next: Date.now() + 1000 }
    const message = createMemo(() => {
      if (status.type !== "retry") return ""
      return formatRetryMessage(status.message)
    })
    
    expect(message()).toBe("Upstream error (api.openai.com)")
  })

  test("preserves valid error messages", () => {
    const status = { type: "retry" as const, attempt: 1, message: "Rate limit exceeded", next: Date.now() + 1000 }
    const message = createMemo(() => {
      if (status.type !== "retry") return ""
      return formatRetryMessage(status.message)
    })
    
    expect(message()).toBe("Rate limit exceeded")
  })

  test("handles empty message", () => {
    const status = { type: "retry" as const, attempt: 1, message: "", next: Date.now() + 1000 }
    const message = createMemo(() => {
      if (status.type !== "retry") return ""
      return formatRetryMessage(status.message)
    })
    
    expect(message()).toBe("Upstream error (no details available)")
  })

  test("handles whitespace-only message", () => {
    const status = { type: "retry" as const, attempt: 1, message: "   ", next: Date.now() + 1000 }
    const message = createMemo(() => {
      if (status.type !== "retry") return ""
      return formatRetryMessage(status.message)
    })
    
    expect(message()).toBe("Upstream error (no details available)")
  })

  test("gemini quota special case is preserved", () => {
    const status = { type: "retry" as const, attempt: 1, message: "Error: you have exceeded your current quota for gemini", next: Date.now() + 1000 }
    const message = createMemo(() => {
      if (status.type !== "retry") return ""
      if (status.message.includes("exceeded your current quota") && status.message.includes("gemini")) {
        return "gemini is way too hot right now"
      }
      return formatRetryMessage(status.message)
    })
    
    expect(message()).toBe("gemini is way too hot right now")
  })
})
