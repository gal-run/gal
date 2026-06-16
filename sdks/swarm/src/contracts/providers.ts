/**
 * Provider taxonomy for GAL Swarm.
 *
 * AI providers are inference backends. Sandbox providers are isolated execution
 * substrates owned by Stratus or other infrastructure layers. Keeping the two
 * catalogs separate prevents API callers from treating a model endpoint as a
 * sandbox runner.
 */

// AI providers: the inference backends that swarm agents use.
// These map to compute profiles (model endpoints, API keys, rate limits).
export const GAL_SWARM_AI_PROVIDERS = [
  'deepseek',
  'claude',
  'gemini',
  'openai',
  'anthropic',
  'codestral',
  'codex',
  'runpod',       // serverless GPU inference
  'other',
] as const

export type GalSwarmAIProvider = (typeof GAL_SWARM_AI_PROVIDERS)[number]

// Sandbox providers: the infrastructure where sandboxed execution runs.
// Each must satisfy: isolated filesystem, deterministic environment, network controls.
export const GAL_SWARM_SANDBOX_PROVIDERS = [
  'stratus',
  'runpod',       // @disabled — serverless GPU, not a sandbox. Kept for backward compat.
  'gcp',          // @disabled — G2/L4 GPU VMs. Burst gate not sandbox-ready.
  'aws',          // @disabled — not provisioned.
  'azure',        // @disabled — not provisioned.
  'crusoe',       // @disabled — not provisioned.
  'kubernetes',   // @disabled — not wired.
  'github_actions',// @disabled — not wired.
  'local_pool',   // @disabled — not wired.
  'other',
] as const

export type GalSwarmSandboxProvider = (typeof GAL_SWARM_SANDBOX_PROVIDERS)[number]

// Only sandbox providers currently enabled for production use.
export const GAL_SWARM_ENABLED_SANDBOX_PROVIDERS: readonly GalSwarmSandboxProvider[] = [
  'stratus',
]

// Only AI providers currently enabled for production use.
export const GAL_SWARM_ENABLED_AI_PROVIDERS: readonly GalSwarmAIProvider[] = [
  'deepseek',
  'claude',
  'gemini',
  'openai',
  'runpod',
]

// @deprecated Use GalSwarmAIProvider or GalSwarmSandboxProvider.
// Kept for backward compatibility during migration.
export const GAL_SWARM_PROVIDER_KINDS = [
  ...GAL_SWARM_AI_PROVIDERS,
  ...GAL_SWARM_SANDBOX_PROVIDERS,
] as const

export type GalSwarmProviderKind = (typeof GAL_SWARM_PROVIDER_KINDS)[number]
