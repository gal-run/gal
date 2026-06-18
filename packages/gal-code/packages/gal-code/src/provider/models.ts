import { Log } from "../util/log"
import z from "zod"
import { lazy } from "@/util/lazy"

export namespace ModelsDev {
  const log = Log.create({ service: "models.dev" })

  type JsonValue = string | number | boolean | null | { [key: string]: JsonValue } | JsonValue[]

  const JsonValue: z.ZodType<JsonValue> = z.lazy(() =>
    z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(JsonValue), z.record(z.string(), JsonValue)]),
  )

  const Cost = z.object({
    input: z.number(),
    output: z.number(),
    cache_read: z.number().optional(),
    cache_write: z.number().optional(),
    context_over_200k: z
      .object({
        input: z.number(),
        output: z.number(),
        cache_read: z.number().optional(),
        cache_write: z.number().optional(),
      })
      .optional(),
  })

  export const Model = z.object({
    id: z.string(),
    name: z.string(),
    family: z.string().optional(),
    release_date: z.string(),
    attachment: z.boolean(),
    reasoning: z.boolean(),
    temperature: z.boolean(),
    tool_call: z.boolean(),
    interleaved: z
      .union([
        z.literal(true),
        z
          .object({
            field: z.enum(["reasoning_content", "reasoning_details"]),
          })
          .strict(),
      ])
      .optional(),
    cost: Cost.optional(),
    limit: z.object({
      context: z.number(),
      input: z.number().optional(),
      output: z.number(),
    }),
    modalities: z
      .object({
        input: z.array(z.enum(["text", "audio", "image", "video", "pdf"])),
        output: z.array(z.enum(["text", "audio", "image", "video", "pdf"])),
      })
      .optional(),
    experimental: z
      .object({
        modes: z
          .record(
            z.string(),
            z.object({
              cost: Cost.optional(),
              provider: z
                .object({
                  body: z.record(z.string(), JsonValue).optional(),
                  headers: z.record(z.string(), z.string()).optional(),
                })
                .optional(),
            }),
          )
          .optional(),
      })
      .optional(),
    status: z.enum(["alpha", "beta", "deprecated"]).optional(),
    provider: z.object({ npm: z.string().optional(), api: z.string().optional() }).optional(),
  })
  export type Model = z.infer<typeof Model>

  export const Provider = z.object({
    api: z.string().optional(),
    name: z.string(),
    env: z.array(z.string()),
    id: z.string(),
    npm: z.string().optional(),
    models: z.record(z.string(), Model),
  })

  export type Provider = z.infer<typeof Provider>

  const GAL_CODE_PROVIDER: Provider = {
    id: "gal-code",
    name: "GAL Code",
    env: ["GAL_AUTH_TOKEN", "GAL_CODE_CONSOLE_TOKEN"],
    npm: "@ai-sdk/openai-compatible",
    api: "https://api.gal.run/api/gal-code/v1",
    models: {
      "zai-org/glm-4.7-maas": {
        id: "zai-org/glm-4.7-maas",
        name: "GLM-4.7",
        family: "glm",
        attachment: false,
        reasoning: true,
        tool_call: true,
        temperature: true,
        interleaved: { field: "reasoning_content" },
        release_date: "2026-04-28",
        cost: { input: 0.6, output: 2.2, cache_read: 0.06 },
        limit: { context: 200000, input: 200000, output: 32000 },
        modalities: { input: ["text"], output: ["text"] },
        provider: { npm: "@ai-sdk/openai-compatible", api: "https://api.gal.run/api/gal-code/v1" },
      },
      "qwen3.5-35b-a3b-fp8": {
        id: "qwen3.5-35b-a3b-fp8",
        name: "Qwen3.5 35B A3B FP8",
        family: "qwen",
        attachment: false,
        reasoning: true,
        tool_call: true,
        temperature: true,
        interleaved: { field: "reasoning_content" },
        release_date: "2026-02-15",
        cost: { input: 0.34, output: 0.34, cache_read: 0 },
        limit: { context: 262144, input: 262144, output: 65536 },
        modalities: { input: ["text"], output: ["text"] },
        provider: { npm: "@ai-sdk/openai-compatible", api: "https://api.gal.run/api/gal-code/v1" },
      },
      "deepseek-v4-pro": {
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
        family: "deepseek",
        attachment: false,
        reasoning: true,
        tool_call: true,
        temperature: true,
        interleaved: { field: "reasoning_content" },
        release_date: "2026-04-24",
        cost: { input: 0.435, output: 0.87, cache_read: 0.003625 },
        limit: { context: 1000000, input: 1000000, output: 384000 },
        modalities: { input: ["text"], output: ["text"] },
        provider: { npm: "@ai-sdk/openai-compatible", api: "https://api.gal.run/api/gal-code/v1" },
      },
      "deepseek-v4-flash": {
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        family: "deepseek",
        attachment: false,
        reasoning: true,
        tool_call: true,
        temperature: true,
        interleaved: { field: "reasoning_content" },
        release_date: "2026-04-24",
        cost: { input: 0.14, output: 0.28, cache_read: 0.0028 },
        limit: { context: 1000000, input: 1000000, output: 384000 },
        modalities: { input: ["text"], output: ["text"] },
        provider: { npm: "@ai-sdk/openai-compatible", api: "https://api.gal.run/api/gal-code/v1" },
      },
    },
  }

  const OPENROUTER_PROVIDER: Provider = {
    id: "openrouter",
    name: "OpenRouter",
    env: ["OPENROUTER_API_KEY"],
    npm: "@openrouter/ai-sdk-provider",
    api: "https://openrouter.ai/api/v1",
    models: {
      "deepseek/deepseek-v4-pro": {
        id: "deepseek/deepseek-v4-pro",
        name: "DeepSeek V4 Pro (OpenRouter)",
        family: "deepseek",
        attachment: false,
        reasoning: true,
        tool_call: true,
        temperature: true,
        release_date: "2026-04-24",
        cost: { input: 0.14, output: 0.28, cache_read: 0.07 },
        limit: { context: 1000000, input: 1000000, output: 384000 },
        modalities: { input: ["text"], output: ["text"] },
        provider: { npm: "@openrouter/ai-sdk-provider", api: "https://openrouter.ai/api/v1" },
      },
      "deepseek/deepseek-v4-flash": {
        id: "deepseek/deepseek-v4-flash",
        name: "DeepSeek V4 Flash (OpenRouter)",
        family: "deepseek",
        attachment: false,
        reasoning: true,
        tool_call: true,
        temperature: true,
        release_date: "2026-04-24",
        cost: { input: 0.06, output: 0.12, cache_read: 0.03 },
        limit: { context: 1000000, input: 1000000, output: 384000 },
        modalities: { input: ["text"], output: ["text"] },
        provider: { npm: "@openrouter/ai-sdk-provider", api: "https://openrouter.ai/api/v1" },
      },
      "openai/gpt-5.4-mini": {
        id: "openai/gpt-5.4-mini",
        name: "GPT-5.4 Mini",
        family: "gpt",
        attachment: true,
        reasoning: true,
        tool_call: true,
        temperature: true,
        release_date: "2026-03-17",
        cost: { input: 0.75, output: 4.5, cache_read: 0.075 },
        limit: { context: 400000, input: 400000, output: 128000 },
        modalities: { input: ["text", "image"], output: ["text"] },
        provider: { npm: "@openrouter/ai-sdk-provider", api: "https://openrouter.ai/api/v1" },
      },
      "moonshotai/kimi-k2.6": {
        id: "moonshotai/kimi-k2.6",
        name: "Kimi K2.6",
        family: "kimi",
        attachment: true,
        reasoning: true,
        tool_call: true,
        temperature: true,
        release_date: "2026-04-20",
        cost: { input: 0.73, output: 3.49, cache_read: 0.25 },
        limit: { context: 262144, input: 262144, output: 262144 },
        modalities: { input: ["text", "image"], output: ["text"] },
        provider: { npm: "@openrouter/ai-sdk-provider", api: "https://openrouter.ai/api/v1" },
      },
      "google/gemma-4-26b-a4b-it": {
        id: "google/gemma-4-26b-a4b-it",
        name: "Gemma 4 26B MoE",
        family: "gemma",
        attachment: true,
        reasoning: true,
        tool_call: true,
        temperature: true,
        release_date: "2026-04-03",
        cost: { input: 0.06, output: 0.33 },
        limit: { context: 262144, input: 262144, output: 32000 },
        modalities: { input: ["text", "image"], output: ["text"] },
        provider: { npm: "@openrouter/ai-sdk-provider", api: "https://openrouter.ai/api/v1" },
      },
      "google/gemma-4-31b-it": {
        id: "google/gemma-4-31b-it",
        name: "Gemma 4 31B",
        family: "gemma",
        attachment: true,
        reasoning: true,
        tool_call: true,
        temperature: true,
        release_date: "2026-04-02",
        cost: { input: 0.12, output: 0.37 },
        limit: { context: 262144, input: 262144, output: 131072 },
        modalities: { input: ["text", "image"], output: ["text"] },
        provider: { npm: "@openrouter/ai-sdk-provider", api: "https://openrouter.ai/api/v1" },
      },
    },
  }

  const DEEPSEEK_PROVIDER: Provider = {
    id: "deepseek",
    name: "DeepSeek",
    env: ["DEEPSEEK_API_KEY"],
    npm: "@ai-sdk/openai-compatible",
    api: "https://api.deepseek.com",
    models: {
      "deepseek-v4-pro": {
        id: "deepseek-v4-pro",
        name: "DeepSeek V4 Pro",
        family: "deepseek",
        attachment: false,
        reasoning: true,
        tool_call: true,
        temperature: true,
        interleaved: { field: "reasoning_content" },
        release_date: "2026-04-24",
        cost: { input: 0.435, output: 0.87, cache_read: 0.003625 },
        limit: { context: 1000000, input: 1000000, output: 384000 },
        modalities: { input: ["text"], output: ["text"] },
        provider: { npm: "@ai-sdk/openai-compatible", api: "https://api.deepseek.com" },
      },
      "deepseek-v4-flash": {
        id: "deepseek-v4-flash",
        name: "DeepSeek V4 Flash",
        family: "deepseek",
        attachment: false,
        reasoning: true,
        tool_call: true,
        temperature: true,
        interleaved: { field: "reasoning_content" },
        release_date: "2026-04-24",
        cost: { input: 0.14, output: 0.28, cache_read: 0.0028 },
        limit: { context: 1000000, input: 1000000, output: 384000 },
        modalities: { input: ["text"], output: ["text"] },
        provider: { npm: "@ai-sdk/openai-compatible", api: "https://api.deepseek.com" },
      },
    },
  }

  export const Data = lazy(async () => {
    return {
      "gal-code": GAL_CODE_PROVIDER,
      openrouter: OPENROUTER_PROVIDER,
      deepseek: DEEPSEEK_PROVIDER,
    } as Record<string, unknown>
  })

  export async function get() {
    const result = await Data()
    return result as Record<string, Provider>
  }

  export async function refresh(_force = false) {
    log.info("refresh skipped - gal-code only mode")
  }
}
