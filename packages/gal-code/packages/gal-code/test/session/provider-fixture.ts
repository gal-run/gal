import path from "path"
import type { Config } from "../../src/config/config"
import type { ModelsDev } from "../../src/provider/models"
import { Filesystem } from "../../src/util/filesystem"

const local: Record<string, string> = {
  "@ai-sdk/anthropic": import.meta.resolve("@ai-sdk/anthropic"),
  "@ai-sdk/google": import.meta.resolve("@ai-sdk/google"),
  "@ai-sdk/openai": import.meta.resolve("@ai-sdk/openai"),
}

export async function loadProviderFixture(providerID: string, modelID: string) {
  const file = path.join(import.meta.dir, "../tool/fixtures/models-api.json")
  const data = await Filesystem.readJson<Record<string, ModelsDev.Provider>>(file)
  const provider = data[providerID]
  if (!provider) throw new Error(`Missing provider in fixture: ${providerID}`)

  const model = provider.models[modelID]
  if (!model) throw new Error(`Missing model in fixture: ${modelID}`)

  return { provider, model }
}

export function providerConfig(
  fixture: Awaited<ReturnType<typeof loadProviderFixture>>,
  options: Record<string, unknown>,
): Partial<Config.Info> {
  const base = {
    id: fixture.model.id,
    name: fixture.model.name,
    family: fixture.model.family,
    release_date: fixture.model.release_date,
    attachment: fixture.model.attachment,
    reasoning: fixture.model.reasoning,
    temperature: fixture.model.temperature,
    tool_call: fixture.model.tool_call,
    interleaved: fixture.model.interleaved,
    cost: fixture.model.cost,
    limit: fixture.model.limit,
    modalities: fixture.model.modalities,
    status: fixture.model.status,
    provider: fixture.model.provider,
    options: {},
  }
  const model =
    fixture.provider.npm === "@ai-sdk/openai"
      ? {
          ...base,
          variants: {
            high: { reasoningEffort: "high", reasoningSummary: "auto", include: ["reasoning.encrypted_content"] },
            xhigh: { reasoningEffort: "xhigh", reasoningSummary: "auto", include: ["reasoning.encrypted_content"] },
          },
        }
      : base

  return {
    enabled_providers: [fixture.provider.id],
    provider: {
      [fixture.provider.id]: {
        id: fixture.provider.id,
        name: fixture.provider.name,
        env: fixture.provider.env,
        npm: fixture.provider.npm ? (local[fixture.provider.npm] ?? fixture.provider.npm) : undefined,
        api: fixture.provider.api,
        models: {
          [fixture.model.id]: model,
        },
        options,
      },
    },
  }
}
