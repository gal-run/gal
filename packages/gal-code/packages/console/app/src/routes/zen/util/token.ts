export namespace Token {
  const CHARS_PER_TOKEN = 4
  const TOOL_CALL_OVERHEAD = 50
  const IMAGE_TOKEN_COST = 85

  export function estimateText(text: string): number {
    if (!text) return 0
    return Math.max(0, Math.round(text.length / CHARS_PER_TOKEN))
  }

  export function estimateMessage(message: any): number {
    let tokens = 0

    if (typeof message.content === "string") {
      tokens += estimateText(message.content)
    } else if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part.type === "text") {
          tokens += estimateText(part.text || "")
        } else if (part.type === "image_url" && part.image_url?.url) {
          tokens += IMAGE_TOKEN_COST
        }
      }
    }

    if (message.role === "system") {
      tokens += 4
    } else if (message.role === "user") {
      tokens += 4
    } else if (message.role === "assistant") {
      tokens += 4
      if (message.tool_calls && Array.isArray(message.tool_calls)) {
        for (const tc of message.tool_calls) {
          tokens += TOOL_CALL_OVERHEAD
          tokens += estimateText(tc.function?.name || "")
          tokens += estimateText(tc.function?.arguments || "")
        }
      }
    } else if (message.role === "tool") {
      tokens += TOOL_CALL_OVERHEAD
      tokens += estimateText(message.content || "")
    }

    return tokens
  }

  export function estimateMessages(messages: any[]): number {
    if (!Array.isArray(messages)) return 0
    return messages.reduce((sum, msg) => sum + estimateMessage(msg), 0)
  }

  export function estimateTools(tools: any[]): number {
    if (!Array.isArray(tools)) return 0
    let tokens = 0
    for (const tool of tools) {
      if (tool.type === "function" && tool.function) {
        tokens += estimateText(tool.function.name || "")
        tokens += estimateText(tool.function.description || "")
        if (tool.function.parameters) {
          tokens += estimateText(JSON.stringify(tool.function.parameters))
        }
      }
    }
    return tokens
  }

  export function estimateRequest(body: {
    messages: any[]
    tools?: any[]
    max_tokens?: number
  }): number {
    const messageTokens = estimateMessages(body.messages || [])
    const toolTokens = estimateTools(body.tools || [])
    const outputTokens = body.max_tokens || 4096
    return messageTokens + toolTokens + outputTokens
  }

  export function formatTokenCount(tokens: number): string {
    if (tokens >= 1_000_000) {
      return `${(tokens / 1_000_000).toFixed(1)}M`
    }
    if (tokens >= 1_000) {
      return `${(tokens / 1_000).toFixed(1)}K`
    }
    return tokens.toString()
  }

  export function buildLimitErrorMessage(
    estimatedTokens: number,
    maxContextTokens: number,
    modelId: string,
  ): string {
    const reductionNeeded = estimatedTokens - maxContextTokens
    const reductionPercent = Math.round((reductionNeeded / estimatedTokens) * 100)

    return (
      `Request exceeds ${modelId}'s maximum context length. ` +
      `Estimated: ${formatTokenCount(estimatedTokens)} tokens, ` +
      `Limit: ${formatTokenCount(maxContextTokens)} tokens. ` +
      `Reduce your prompt by ~${formatTokenCount(reductionNeeded)} tokens (${reductionPercent}%). ` +
      `Try: reducing conversation history, removing large file attachments, or starting a new session.`
    )
  }
}
