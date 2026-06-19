declare global {
  const GAL_CODE_VERSION: string
  const GAL_CODE_CHANNEL: string
}

export const VERSION = typeof GAL_CODE_VERSION === "string" ? GAL_CODE_VERSION : "local"
export const CHANNEL = typeof GAL_CODE_CHANNEL === "string" ? GAL_CODE_CHANNEL : "local"
