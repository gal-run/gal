import { Schema } from "effect"
import z from "zod"

import { withStatics } from "@/util/schema"

const providerIdSchema = Schema.String.pipe(Schema.brand("ProviderID"))

export type ProviderID = typeof providerIdSchema.Type

export const ProviderID = providerIdSchema.pipe(
  withStatics((schema: typeof providerIdSchema) => ({
    zod: z.string().pipe(z.custom<ProviderID>()),
    "gal-code": schema.make("gal-code"),
    anthropic: schema.make("anthropic"),
    openai: schema.make("openai"),
    openrouter: schema.make("openrouter"),
    amazonBedrock: schema.make("amazon-bedrock"),
    google: schema.make("google"),
  })),
)

const modelIdSchema = Schema.String.pipe(Schema.brand("ModelID"))

export type ModelID = typeof modelIdSchema.Type

export const ModelID = modelIdSchema.pipe(
  withStatics((schema: typeof modelIdSchema) => ({
    zod: z.string().pipe(z.custom<ModelID>()),
  })),
)
