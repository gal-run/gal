import { ModelsDev } from "../../src/provider/models"
import { ProviderID } from "../../src/provider/schema"

type ModelInput = Partial<ModelsDev.Model> & {
  id: string
  name: string
}

function model(input: ModelInput): ModelsDev.Model {
  return {
    family: input.family ?? input.id.split(/[-.]/)[0],
    release_date: input.release_date ?? "2026-01-01",
    attachment: input.attachment ?? false,
    reasoning: input.reasoning ?? false,
    temperature: input.temperature ?? true,
    tool_call: input.tool_call ?? true,
    cost: input.cost ?? { input: 1, output: 1, cache_read: 0, cache_write: 0 },
    limit: input.limit ?? { context: 128000, input: 128000, output: 32000 },
    modalities: input.modalities ?? { input: ["text"], output: ["text"] },
    ...input,
  }
}

const anthropic: ModelsDev.Provider = {
  id: "anthropic",
  name: "Anthropic",
  env: ["ANTHROPIC_API_KEY"],
  npm: "@ai-sdk/anthropic",
  api: "https://api.anthropic.com/v1",
  models: {
    "claude-sonnet-4-20250514": model({
      id: "claude-sonnet-4-20250514",
      name: "Claude Sonnet 4",
      family: "claude",
      attachment: true,
      reasoning: true,
      interleaved: { field: "reasoning_content" },
      cost: { input: 3, output: 15, cache_read: 0.3, cache_write: 3.75 },
      limit: { context: 200000, input: 200000, output: 64000 },
      modalities: { input: ["text", "image", "pdf"], output: ["text"] },
    }),
    "claude-opus-4-20250514": model({
      id: "claude-opus-4-20250514",
      name: "Claude Opus 4",
      family: "claude",
      attachment: true,
      reasoning: true,
      interleaved: { field: "reasoning_content" },
      cost: { input: 15, output: 75, cache_read: 1.5, cache_write: 18.75 },
      limit: { context: 200000, input: 200000, output: 32000 },
      modalities: { input: ["text", "image", "pdf"], output: ["text"] },
    }),
    "claude-haiku-4-5-20251001": model({
      id: "claude-haiku-4-5-20251001",
      name: "Claude Haiku 4.5",
      family: "claude",
      attachment: true,
      cost: { input: 1, output: 5, cache_read: 0.1, cache_write: 1.25 },
      limit: { context: 200000, input: 200000, output: 16000 },
      modalities: { input: ["text", "image", "pdf"], output: ["text"] },
    }),
  },
}

const openai: ModelsDev.Provider = {
  id: "openai",
  name: "OpenAI",
  env: ["OPENAI_API_KEY"],
  npm: "@ai-sdk/openai",
  api: "https://api.openai.com/v1",
  models: {
    "gpt-5": model({
      id: "gpt-5",
      name: "GPT-5",
      family: "gpt",
      attachment: true,
      reasoning: true,
      temperature: false,
      cost: { input: 2.5, output: 10, cache_read: 0.25, cache_write: 2.5 },
      limit: { context: 400000, input: 400000, output: 128000 },
      modalities: { input: ["text", "image", "pdf"], output: ["text"] },
    }),
  },
}

const openrouter: ModelsDev.Provider = {
  id: "openrouter",
  name: "OpenRouter",
  env: ["OPENROUTER_API_KEY"],
  npm: "@openrouter/ai-sdk-provider",
  api: "https://openrouter.ai/api/v1",
  models: {},
}

const amazonBedrock: ModelsDev.Provider = {
  id: "amazon-bedrock",
  name: "Amazon Bedrock",
  env: ["AWS_BEARER_TOKEN_BEDROCK", "AWS_ACCESS_KEY_ID", "AWS_PROFILE", "AWS_WEB_IDENTITY_TOKEN_FILE"],
  npm: "@ai-sdk/amazon-bedrock",
  models: {
    "anthropic.claude-haiku-4-5-20251001-v1:0": model({
      id: "anthropic.claude-haiku-4-5-20251001-v1:0",
      name: "Claude Haiku 4.5",
      family: "claude",
      attachment: true,
      cost: { input: 1, output: 5, cache_read: 0.1, cache_write: 1.25 },
      limit: { context: 200000, input: 200000, output: 16000 },
      provider: { npm: "@ai-sdk/amazon-bedrock" },
      modalities: { input: ["text", "image", "pdf"], output: ["text"] },
    }),
  },
}

const cloudflareAIGateway: ModelsDev.Provider = {
  id: "cloudflare-ai-gateway",
  name: "Cloudflare AI Gateway",
  env: ["CLOUDFLARE_API_TOKEN"],
  npm: "@ai-sdk/openai-compatible",
  api: "https://gateway.ai.cloudflare.com/v1/${CLOUDFLARE_ACCOUNT_ID}/${CLOUDFLARE_GATEWAY_ID}/compat",
  models: {
    "@cf/meta/llama-3.1-8b-instruct": model({
      id: "@cf/meta/llama-3.1-8b-instruct",
      name: "Llama 3.1 8B Instruct",
      cost: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
      limit: { context: 128000, input: 128000, output: 4096 },
    }),
  },
}

let installed = false

export function installProviderFixtures() {
  if (installed) return
  installed = true

  Object.assign(ProviderID, {
    anthropic: ProviderID.make("anthropic"),
    openai: ProviderID.make("openai"),
    openrouter: ProviderID.make("openrouter"),
    amazonBedrock: ProviderID.make("amazon-bedrock"),
    google: ProviderID.make("google"),
  })

  const originalData = ModelsDev.Data
  const data = async () => {
    const base = (await originalData()) as Record<string, ModelsDev.Provider>
    const galCode = base["gal-code"]

    return {
      ...base,
      "gal-code": {
        ...galCode,
        models: {
          "kimi-k2.5-free": model({
            id: "kimi-k2.5-free",
            name: "Kimi K2.5 Free",
            family: "kimi",
            reasoning: true,
            interleaved: { field: "reasoning_content" },
            cost: { input: 0, output: 0, cache_read: 0, cache_write: 0 },
            limit: { context: 200000, input: 200000, output: 32000 },
            provider: { npm: "@ai-sdk/openai-compatible", api: "https://api.gal.run/api/gal-code/v1" },
          }),
          ...galCode.models,
        },
      },
      anthropic,
      openai,
      openrouter,
      "amazon-bedrock": amazonBedrock,
      "cloudflare-ai-gateway": cloudflareAIGateway,
    } satisfies Record<string, ModelsDev.Provider>
  }
  data.reset = () => {}
  ;(ModelsDev as { Data: typeof ModelsDev.Data }).Data = data
}
