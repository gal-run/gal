/**
 * Structured logging factory using pino.
 *
 * In production (Cloud Run), outputs GCP-compatible JSON via pino.
 * In development, outputs pretty-printed logs.
 *
 * Browser-safe: the Node.js-only `createRequire` from `node:module` is
 * loaded lazily inside a try-catch so this module can be bundled for the
 * browser without crashing at module-evaluation time.  When running in a
 * browser environment the pino path is skipped and the console-based
 * fallback logger is returned instead.
 *
 * Usage:
 *   import { createLogger } from '@gal/telemetry';
 *   const logger = createLogger('api');
 */

import { getEnvironment } from "./constants.js";

/** Logger interface matching pino's core API */
export interface Logger {
  fatal(obj: object, msg?: string, ...args: unknown[]): void;
  fatal(msg: string, ...args: unknown[]): void;
  error(obj: object, msg?: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  warn(obj: object, msg?: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  info(obj: object, msg?: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  debug(obj: object, msg?: string, ...args: unknown[]): void;
  debug(msg: string, ...args: unknown[]): void;
  trace(obj: object, msg?: string, ...args: unknown[]): void;
  trace(msg: string, ...args: unknown[]): void;
  child(bindings: Record<string, unknown>): Logger;
}

/** Options for creating a logger */
export interface LoggerOptions {
  /** Service name for log context */
  service: string;
  /** Override log level (defaults to 'info' in production, 'debug' in development) */
  level?: string;
  /** Additional default bindings added to every log entry */
  bindings?: Record<string, unknown>;
}

/**
 * Create a structured logger.
 *
 * Attempts to use pino if available. Falls back to a console-based
 * logger that still outputs structured JSON in production.
 */
export function createLogger(options: LoggerOptions | string): Logger {
  const opts: LoggerOptions =
    typeof options === "string" ? { service: options } : options;
  const env = getEnvironment();
  const level =
    opts.level ||
    (typeof process !== "undefined" ? process.env["LOG_LEVEL"] : undefined) ||
    (env === "production" ? "info" : "debug");

  // SEA binaries cannot resolve pino transports from disk at runtime.
  // Use the console fallback there and in browser contexts.
  if (typeof window !== "undefined" || isSeaRuntime()) {
    return createConsoleLogger(opts.service, level);
  }

  try {
    // Lazily load createRequire to avoid a top-level static import of
    // `node:module` which crashes webpack client bundles (the browser
    // export condition may not always be respected by transpilePackages).
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const { createRequire } = require("node:module") as typeof import("node:module");

    // Try to use pino (optional peer dependency)
    // Use createRequire for ESM compatibility (NodeNext module resolution)
    const esmRequire = createRequire(import.meta.url);
    const pino = esmRequire("pino");

    const pinoOpts: Record<string, unknown> = {
      level,
      name: opts.service,
      ...(opts.bindings ?? {}),
    };

    if (env === "production") {
      // GCP Cloud Logging compatible format.
      // Cloud Run automatically parses JSON with severity/message fields.
      pinoOpts["messageKey"] = "message";
      pinoOpts["formatters"] = {
        level(label: string) {
          // Map pino levels to GCP severity
          const gcpSeverity: Record<string, string> = {
            trace: "DEBUG",
            debug: "DEBUG",
            info: "INFO",
            warn: "WARNING",
            error: "ERROR",
            fatal: "CRITICAL",
          };
          return { severity: gcpSeverity[label] ?? "DEFAULT" };
        },
      };
    } else {
      // Pretty print in development
      pinoOpts["transport"] = {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss",
          ignore: "pid,hostname",
        },
      };
    }

    // eslint-disable-next-line @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access
    return pino.default ? pino.default(pinoOpts) : pino(pinoOpts);
  } catch {
    // Pino not available - use console-based fallback
    return createConsoleLogger(opts.service, level);
  }
}

function isSeaRuntime(): boolean {
  if (typeof process === "undefined") {
    return false;
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports, @typescript-eslint/no-var-requires
    const sea = require("node:sea") as { isSea?: () => boolean };
    return typeof sea.isSea === "function" ? sea.isSea() : false;
  } catch {
    return false;
  }
}

/** Console-based fallback logger that outputs structured JSON in production */
function createConsoleLogger(service: string, level: string): Logger {
  const env = getEnvironment();
  const levels = ["trace", "debug", "info", "warn", "error", "fatal"];
  const minLevel = levels.indexOf(level);

  function shouldLog(lvl: string): boolean {
    return levels.indexOf(lvl) >= minLevel;
  }

  function log(
    lvl: string,
    objOrMsg: unknown,
    msg?: string,
    ...args: unknown[]
  ): void {
    if (!shouldLog(lvl)) return;

    if (env === "production") {
      // Structured JSON for Cloud Logging
      const gcpSeverity: Record<string, string> = {
        trace: "DEBUG",
        debug: "DEBUG",
        info: "INFO",
        warn: "WARNING",
        error: "ERROR",
        fatal: "CRITICAL",
      };
      const entry: Record<string, unknown> = {
        severity: gcpSeverity[lvl] ?? "DEFAULT",
        service,
        timestamp: new Date().toISOString(),
      };
      if (typeof objOrMsg === "object" && objOrMsg !== null) {
        Object.assign(entry, objOrMsg);
        if (msg) entry["message"] = msg;
      } else {
        entry["message"] = String(objOrMsg);
      }
      console.log(JSON.stringify(entry));
    } else {
      // Pretty console output in development
      const prefix = `[${service}]`;
      const consoleFn =
        lvl === "error" || lvl === "fatal"
          ? console.error
          : lvl === "warn"
            ? console.warn
            : console.log;
      if (typeof objOrMsg === "object" && objOrMsg !== null) {
        consoleFn(prefix, msg ?? "", objOrMsg, ...args);
      } else {
        consoleFn(prefix, objOrMsg, ...args);
      }
    }
  }

  const logger: Logger = {
    fatal: (objOrMsg: unknown, msg?: string, ...args: unknown[]) =>
      log("fatal", objOrMsg, msg, ...args),
    error: (objOrMsg: unknown, msg?: string, ...args: unknown[]) =>
      log("error", objOrMsg, msg, ...args),
    warn: (objOrMsg: unknown, msg?: string, ...args: unknown[]) =>
      log("warn", objOrMsg, msg, ...args),
    info: (objOrMsg: unknown, msg?: string, ...args: unknown[]) =>
      log("info", objOrMsg, msg, ...args),
    debug: (objOrMsg: unknown, msg?: string, ...args: unknown[]) =>
      log("debug", objOrMsg, msg, ...args),
    trace: (objOrMsg: unknown, msg?: string, ...args: unknown[]) =>
      log("trace", objOrMsg, msg, ...args),
    child(bindings: Record<string, unknown>): Logger {
      // Return a new logger with additional bindings baked into the service name
      const childService =
        typeof bindings["reqId"] === "string" ||
        typeof bindings["reqId"] === "number"
          ? `${service}:${bindings["reqId"]}`
          : service;
      return createConsoleLogger(childService, level);
    },
  };

  return logger;
}
