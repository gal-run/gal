import { describe, it, expect } from "bun:test"
import { Token } from "./token"

describe("Token", () => {
  describe("estimateText", () => {
    it("should estimate tokens from text", () => {
      const text = "Hello, world!"
      const tokens = Token.estimateText(text)
      expect(tokens).toBe(Math.round(text.length / 4))
    })

    it("should return 0 for empty string", () => {
      expect(Token.estimateText("")).toBe(0)
    })

    it("should return 0 for null/undefined", () => {
      expect(Token.estimateText(null as any)).toBe(0)
      expect(Token.estimateText(undefined as any)).toBe(0)
    })
  })

  describe("estimateMessage", () => {
    it("should estimate tokens for a user message", () => {
      const message = { role: "user", content: "Hello, world!" }
      const tokens = Token.estimateMessage(message)
      expect(tokens).toBeGreaterThan(0)
    })

    it("should estimate tokens for a system message", () => {
      const message = { role: "system", content: "You are a helpful assistant." }
      const tokens = Token.estimateMessage(message)
      expect(tokens).toBeGreaterThan(0)
    })

    it("should estimate tokens for an assistant message with tool calls", () => {
      const message = {
        role: "assistant",
        content: "Let me help you with that.",
        tool_calls: [
          {
            id: "call_123",
            type: "function",
            function: {
              name: "bash",
              arguments: '{"command": "ls -la"}',
            },
          },
        ],
      }
      const tokens = Token.estimateMessage(message)
      expect(tokens).toBeGreaterThan(0)
    })

    it("should estimate tokens for a tool result message", () => {
      const message = {
        role: "tool",
        tool_call_id: "call_123",
        content: "file1.txt\nfile2.txt\nfile3.txt",
      }
      const tokens = Token.estimateMessage(message)
      expect(tokens).toBeGreaterThan(0)
    })

    it("should estimate tokens for message with image", () => {
      const message = {
        role: "user",
        content: [
          { type: "text", text: "What's in this image?" },
          { type: "image_url", image_url: { url: "data:image/png;base64,abc" } },
        ],
      }
      const tokens = Token.estimateMessage(message)
      expect(tokens).toBeGreaterThan(85)
    })
  })

  describe("estimateMessages", () => {
    it("should estimate total tokens for multiple messages", () => {
      const messages = [
        { role: "system", content: "You are a helpful assistant." },
        { role: "user", content: "Hello!" },
        { role: "assistant", content: "Hi there!" },
      ]
      const tokens = Token.estimateMessages(messages)
      expect(tokens).toBeGreaterThan(0)
    })

    it("should return 0 for empty array", () => {
      expect(Token.estimateMessages([])).toBe(0)
    })
  })

  describe("estimateTools", () => {
    it("should estimate tokens for tool definitions", () => {
      const tools = [
        {
          type: "function",
          function: {
            name: "bash",
            description: "Execute a bash command",
            parameters: {
              type: "object",
              properties: {
                command: { type: "string", description: "The command to execute" },
              },
              required: ["command"],
            },
          },
        },
      ]
      const tokens = Token.estimateTools(tools)
      expect(tokens).toBeGreaterThan(0)
    })
  })

  describe("estimateRequest", () => {
    it("should estimate total request tokens", () => {
      const request = {
        messages: [
          { role: "user", content: "Hello, world!" },
        ],
        tools: [],
        max_tokens: 1024,
      }
      const tokens = Token.estimateRequest(request)
      expect(tokens).toBeGreaterThan(1024)
    })
  })

  describe("formatTokenCount", () => {
    it("should format small numbers as-is", () => {
      expect(Token.formatTokenCount(500)).toBe("500")
    })

    it("should format thousands with K suffix", () => {
      expect(Token.formatTokenCount(5000)).toBe("5.0K")
      expect(Token.formatTokenCount(15000)).toBe("15.0K")
    })

    it("should format millions with M suffix", () => {
      expect(Token.formatTokenCount(1500000)).toBe("1.5M")
    })
  })

  describe("buildLimitErrorMessage", () => {
    it("should build a descriptive error message", () => {
      const message = Token.buildLimitErrorMessage(250000, 200000, "claude-sonnet-4")
      expect(message).toContain("claude-sonnet-4")
      expect(message).toContain("250.0K")
      expect(message).toContain("200.0K")
      expect(message).toContain("50.0K")
      expect(message).toContain("Reduce")
    })
  })
})
