import { describe, expect, test } from "bun:test"
import { Provider } from "../../../src/provider/provider"
import { ModelsCommand } from "../../../src/cli/cmd/models"
import yargs from "yargs"

describe("Provider.parseModel", () => {
  test("parses simple provider/model", () => {
    const result = Provider.parseModel("anthropic/claude-sonnet")
    expect(String(result.providerID)).toBe("anthropic")
    expect(String(result.modelID)).toBe("claude-sonnet")
  })

  test("parses model with slashes in name", () => {
    const result = Provider.parseModel("openai/gpt/4-turbo")
    expect(String(result.providerID)).toBe("openai")
    expect(String(result.modelID)).toBe("gpt/4-turbo")
  })

  test("parses deepseek model", () => {
    const result = Provider.parseModel("deepseek/deepseek-v4-pro")
    expect(String(result.providerID)).toBe("deepseek")
    expect(String(result.modelID)).toBe("deepseek-v4-pro")
  })

  test("parses gal-code provider", () => {
    const result = Provider.parseModel("gal-code/claude-sonnet")
    expect(String(result.providerID)).toBe("gal-code")
    expect(String(result.modelID)).toBe("claude-sonnet")
  })

  test("parses model with version suffix", () => {
    const result = Provider.parseModel("anthropic/claude-sonnet-4-20250514")
    expect(String(result.providerID)).toBe("anthropic")
    expect(String(result.modelID)).toBe("claude-sonnet-4-20250514")
  })

  test("parses model with multiple path segments", () => {
    const result = Provider.parseModel("amazon-bedrock/us.anthropic.claude-3-5-sonnet-20241022-v2:0")
    expect(String(result.providerID)).toBe("amazon-bedrock")
    expect(String(result.modelID)).toBe("us.anthropic.claude-3-5-sonnet-20241022-v2:0")
  })
})

describe("ModelsCommand option definitions", () => {
  test("defines positional provider argument", () => {
    expect(ModelsCommand.command).toBe("models [provider]")
    expect(ModelsCommand.describe).toBe("list all available models")
  })

  test("defines --verbose and --refresh flags via yargs builder", () => {
    const y = yargs([])
    const built = (ModelsCommand.builder as any)(y)
    const opts = built.getOptions()
    expect(opts.key["verbose"]).toBeDefined()
    expect(opts.key["refresh"]).toBeDefined()
  })
})
