// OSS free build: telemetry primitives are vendored inline under
// src/vendored-gal/telemetry (the @gal/* git submodules are dropped).
export * from '../vendored-gal/telemetry/constants'
export * from '../vendored-gal/telemetry/privacy'
export * from '../vendored-gal/telemetry/sentry'

export interface Logger {
  debug(...args: unknown[]): void
  info(...args: unknown[]): void
  warn(...args: unknown[]): void
  error(...args: unknown[]): void
  trace(...args: unknown[]): void
  fatal(...args: unknown[]): void
  child(bindings: Record<string, unknown>): Logger
}

export interface LoggerOptions {
  service: string
  level?: string
}

export function createLogger(options: LoggerOptions | string): Logger {
  const service = typeof options === 'string' ? options : options.service

  const write = (method: 'debug' | 'info' | 'warn' | 'error') => (...args: unknown[]) => {
    const target = console[method] ?? console.log
    target.call(console, `[${service}]`, ...args)
  }

  return {
    debug: write('debug'),
    info: write('info'),
    warn: write('warn'),
    error: write('error'),
    trace: write('debug'),
    fatal: write('error'),
    child(bindings: Record<string, unknown>): Logger {
      const suffix = Object.entries(bindings)
        .map(([key, value]) => `${key}=${String(value)}`)
        .join(',')
      return createLogger(suffix ? `${service}:${suffix}` : service)
    },
  }
}
