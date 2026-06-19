import z from "zod"

export const GALTConfig = z.object({
  enabled: z.boolean().default(false).describe("Enable GAL-T sanitization middleware"),
  guard_url: z.string().default("http://localhost:8081").describe("URL of the GAL-T Guard service"),
  entitlements: z.array(z.string()).default([]).describe("Console-granted entitlements for GAL-T access"),
  timeout_ms: z.number().default(30000).describe("Timeout for sanitization requests in milliseconds"),
  default_classification: z
    .enum(["UNCLASSIFIED", "CONFIDENTIAL", "SECRET", "TOP_SECRET"])
    .default("UNCLASSIFIED")
    .describe("Default classification level for content"),
  input_sanitization: z.boolean().default(true).describe("Enable input (prompt) sanitization"),
  output_sanitization: z.boolean().default(true).describe("Enable output (response) sanitization"),
  block_on_failure: z.boolean().default(true).describe("Block requests if sanitization service is unavailable"),
  audit_logging: z.boolean().default(true).describe("Enable audit logging for security events"),
  patterns: z
    .object({
      secrets: z.boolean().default(true).describe("Detect and redact secrets (API keys, passwords, tokens)"),
      pii: z.boolean().default(true).describe("Detect and redact PII (personal identifiable information)"),
      steganography: z.boolean().default(true).describe("Detect hidden data in content"),
      vulnerabilities: z.boolean().default(true).describe("Scan for security vulnerabilities in generated code"),
    })
    .default({
      secrets: true,
      pii: true,
      steganography: true,
      vulnerabilities: true,
    })
    .describe("Sanitization pattern configuration"),
  token_governance: z
    .object({
      enabled: z.boolean().default(false).describe("Enable token-based access control"),
      issuer_url: z.string().optional().describe("Token issuer URL"),
      required_claims: z.array(z.string()).default([]).describe("Required claims in tokens"),
    })
    .default({ enabled: false, required_claims: [] })
    .describe("Token governance configuration"),
})

export type GALTConfig = z.infer<typeof GALTConfig>

export const defaultGALTConfig: GALTConfig = {
  enabled: false,
  guard_url: "http://localhost:8081",
  entitlements: [],
  timeout_ms: 30000,
  default_classification: "UNCLASSIFIED",
  input_sanitization: true,
  output_sanitization: true,
  block_on_failure: true,
  audit_logging: true,
  patterns: {
    secrets: true,
    pii: true,
    steganography: true,
    vulnerabilities: true,
  },
  token_governance: {
    enabled: false,
    required_claims: [],
  },
}
