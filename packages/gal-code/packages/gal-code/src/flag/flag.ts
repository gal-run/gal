import { Config } from "effect"

function truthy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "true" || value === "1"
}

function falsy(key: string) {
  const value = process.env[key]?.toLowerCase()
  return value === "false" || value === "0"
}

export namespace Flag {
  export const OTEL_EXPORTER_OTLP_ENDPOINT = process.env["OTEL_EXPORTER_OTLP_ENDPOINT"]
  export const OTEL_EXPORTER_OTLP_HEADERS = process.env["OTEL_EXPORTER_OTLP_HEADERS"]

  export const GAL_CODE_AUTO_SHARE = truthy("GAL_CODE_AUTO_SHARE")
  export const GAL_CODE_AUTO_HEAP_SNAPSHOT = truthy("GAL_CODE_AUTO_HEAP_SNAPSHOT")
  export const GAL_CODE_GIT_BASH_PATH = process.env["GAL_CODE_GIT_BASH_PATH"]
  export const GAL_CODE_CONFIG = process.env["GAL_CODE_CONFIG"]
  export declare const GAL_CODE_PURE: boolean
  export declare const GAL_CODE_TUI_CONFIG: string | undefined
  export declare const GAL_CODE_CONFIG_DIR: string | undefined
  export declare const GAL_CODE_PLUGIN_META_FILE: string | undefined
  export const GAL_CODE_CONFIG_CONTENT = process.env["GAL_CODE_CONFIG_CONTENT"]
  export const GAL_CODE_DISABLE_AUTOUPDATE = truthy("GAL_CODE_DISABLE_AUTOUPDATE")
  export const GAL_CODE_ALWAYS_NOTIFY_UPDATE = truthy("GAL_CODE_ALWAYS_NOTIFY_UPDATE")
  export const GAL_CODE_DISABLE_PRUNE = truthy("GAL_CODE_DISABLE_PRUNE")
  export const GAL_CODE_DISABLE_TERMINAL_TITLE = truthy("GAL_CODE_DISABLE_TERMINAL_TITLE")
  export const GAL_CODE_SHOW_TTFD = truthy("GAL_CODE_SHOW_TTFD")
  export const GAL_CODE_PERMISSION = process.env["GAL_CODE_PERMISSION"]
  export const GAL_CODE_DISABLE_DEFAULT_PLUGINS = truthy("GAL_CODE_DISABLE_DEFAULT_PLUGINS")
  export const GAL_CODE_DISABLE_LSP_DOWNLOAD = truthy("GAL_CODE_DISABLE_LSP_DOWNLOAD")
  export const GAL_CODE_ENABLE_EXPERIMENTAL_MODELS = truthy("GAL_CODE_ENABLE_EXPERIMENTAL_MODELS")
  export const GAL_CODE_DISABLE_AUTOCOMPACT = truthy("GAL_CODE_DISABLE_AUTOCOMPACT")
  export const GAL_CODE_DISABLE_MODELS_FETCH = truthy("GAL_CODE_DISABLE_MODELS_FETCH")
  export const GAL_CODE_DISABLE_MOUSE = truthy("GAL_CODE_DISABLE_MOUSE")
  export const GAL_CODE_DISABLE_CLAUDE_CODE = truthy("GAL_CODE_DISABLE_CLAUDE_CODE")
  export const GAL_CODE_DISABLE_CLAUDE_CODE_PROMPT =
    GAL_CODE_DISABLE_CLAUDE_CODE || truthy("GAL_CODE_DISABLE_CLAUDE_CODE_PROMPT")
  export const GAL_CODE_DISABLE_CLAUDE_CODE_SKILLS =
    GAL_CODE_DISABLE_CLAUDE_CODE || truthy("GAL_CODE_DISABLE_CLAUDE_CODE_SKILLS")
  export const GAL_CODE_DISABLE_EXTERNAL_SKILLS =
    GAL_CODE_DISABLE_CLAUDE_CODE_SKILLS || truthy("GAL_CODE_DISABLE_EXTERNAL_SKILLS")
  export declare const GAL_CODE_DISABLE_PROJECT_CONFIG: boolean
  export const GAL_CODE_FAKE_VCS = process.env["GAL_CODE_FAKE_VCS"]
  export declare const GAL_CODE_CLIENT: string
  export const GAL_CODE_SERVER_PASSWORD = process.env["GAL_CODE_SERVER_PASSWORD"]
  export const GAL_CODE_SERVER_USERNAME = process.env["GAL_CODE_SERVER_USERNAME"]
  export const GAL_CODE_ENABLE_QUESTION_TOOL = truthy("GAL_CODE_ENABLE_QUESTION_TOOL")

  // Experimental
  export const GAL_CODE_EXPERIMENTAL = truthy("GAL_CODE_EXPERIMENTAL")
  export const GAL_CODE_EXPERIMENTAL_FILEWATCHER = Config.boolean("GAL_CODE_EXPERIMENTAL_FILEWATCHER").pipe(
    Config.withDefault(false),
  )
  export const GAL_CODE_EXPERIMENTAL_DISABLE_FILEWATCHER = Config.boolean(
    "GAL_CODE_EXPERIMENTAL_DISABLE_FILEWATCHER",
  ).pipe(Config.withDefault(false))
  export const GAL_CODE_EXPERIMENTAL_ICON_DISCOVERY =
    GAL_CODE_EXPERIMENTAL || truthy("GAL_CODE_EXPERIMENTAL_ICON_DISCOVERY")

  const copy = process.env["GAL_CODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT"]
  export const GAL_CODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT =
    copy === undefined ? process.platform === "win32" : truthy("GAL_CODE_EXPERIMENTAL_DISABLE_COPY_ON_SELECT")
  export const GAL_CODE_ENABLE_EXA =
    truthy("GAL_CODE_ENABLE_EXA") || GAL_CODE_EXPERIMENTAL || truthy("GAL_CODE_EXPERIMENTAL_EXA")
  export const GAL_CODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS = number("GAL_CODE_EXPERIMENTAL_BASH_DEFAULT_TIMEOUT_MS")
  export const GAL_CODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX = number("GAL_CODE_EXPERIMENTAL_OUTPUT_TOKEN_MAX")
  export const GAL_CODE_EXPERIMENTAL_OXFMT = GAL_CODE_EXPERIMENTAL || truthy("GAL_CODE_EXPERIMENTAL_OXFMT")
  export const GAL_CODE_EXPERIMENTAL_LSP_TY = truthy("GAL_CODE_EXPERIMENTAL_LSP_TY")
  export const GAL_CODE_EXPERIMENTAL_LSP_TOOL = GAL_CODE_EXPERIMENTAL || truthy("GAL_CODE_EXPERIMENTAL_LSP_TOOL")
  export const GAL_CODE_DISABLE_FILETIME_CHECK = Config.boolean("GAL_CODE_DISABLE_FILETIME_CHECK").pipe(
    Config.withDefault(false),
  )
  export const GAL_CODE_EXPERIMENTAL_PLAN_MODE = GAL_CODE_EXPERIMENTAL || truthy("GAL_CODE_EXPERIMENTAL_PLAN_MODE")
  export const GAL_CODE_EXPERIMENTAL_WORKSPACES = GAL_CODE_EXPERIMENTAL || truthy("GAL_CODE_EXPERIMENTAL_WORKSPACES")
  export const GAL_CODE_EXPERIMENTAL_MARKDOWN = !falsy("GAL_CODE_EXPERIMENTAL_MARKDOWN")
  export const GAL_CODE_MODELS_URL = process.env["GAL_CODE_MODELS_URL"]
  export const GAL_CODE_MODELS_PATH = process.env["GAL_CODE_MODELS_PATH"]
  export const GAL_CODE_DISABLE_EMBEDDED_WEB_UI = truthy("GAL_CODE_DISABLE_EMBEDDED_WEB_UI")
  export const GAL_CODE_DB = process.env["GAL_CODE_DB"]
  export const GAL_CODE_DISABLE_CHANNEL_DB = truthy("GAL_CODE_DISABLE_CHANNEL_DB")
  export const GAL_CODE_SKIP_MIGRATIONS = truthy("GAL_CODE_SKIP_MIGRATIONS")
  export const GAL_CODE_STRICT_CONFIG_DEPS = truthy("GAL_CODE_STRICT_CONFIG_DEPS")

  function number(key: string) {
    const value = process.env[key]
    if (!value) return undefined
    const parsed = Number(value)
    return Number.isInteger(parsed) && parsed > 0 ? parsed : undefined
  }
}

// Dynamic getter for GAL_CODE_DISABLE_PROJECT_CONFIG
// This must be evaluated at access time, not module load time,
// because external tooling may set this env var at runtime
Object.defineProperty(Flag, "GAL_CODE_DISABLE_PROJECT_CONFIG", {
  get() {
    return truthy("GAL_CODE_DISABLE_PROJECT_CONFIG")
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for GAL_CODE_TUI_CONFIG
// This must be evaluated at access time, not module load time,
// because tests and external tooling may set this env var at runtime
Object.defineProperty(Flag, "GAL_CODE_TUI_CONFIG", {
  get() {
    return process.env["GAL_CODE_TUI_CONFIG"]
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for GAL_CODE_CONFIG_DIR
// This must be evaluated at access time, not module load time,
// because external tooling may set this env var at runtime
Object.defineProperty(Flag, "GAL_CODE_CONFIG_DIR", {
  get() {
    return process.env["GAL_CODE_CONFIG_DIR"]
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for GAL_CODE_PURE
// This must be evaluated at access time, not module load time,
// because the CLI can set this flag at runtime
Object.defineProperty(Flag, "GAL_CODE_PURE", {
  get() {
    return truthy("GAL_CODE_PURE")
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for GAL_CODE_PLUGIN_META_FILE
// This must be evaluated at access time, not module load time,
// because tests and external tooling may set this env var at runtime
Object.defineProperty(Flag, "GAL_CODE_PLUGIN_META_FILE", {
  get() {
    return process.env["GAL_CODE_PLUGIN_META_FILE"]
  },
  enumerable: true,
  configurable: false,
})

// Dynamic getter for GAL_CODE_CLIENT
// This must be evaluated at access time, not module load time,
// because some commands override the client at runtime
Object.defineProperty(Flag, "GAL_CODE_CLIENT", {
  get() {
    return process.env["GAL_CODE_CLIENT"] ?? "cli"
  },
  enumerable: true,
  configurable: false,
})
