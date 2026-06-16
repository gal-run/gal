// SPDX-License-Identifier: Apache-2.0
// Copyright The sandbox-runtime-contract authors.

import { defaultDeniedRunnerEnv, defaultRequiredRunnerEnv } from "./contracts.mjs";

export const RUNTIME_SESSION_CHANNEL_KIND = "runtime-session-channel";

/**
 * Validate the runtime startup environment for an isolated agent runtime.
 *
 * Enforces three deployment-agnostic properties:
 *  - every required startup field is present,
 *  - no denied provider/dispatch credential is inherited,
 *  - the callback endpoint uses HTTPS (except localhost) and the project path
 *    stays under /workspace.
 *
 * @param {Record<string,string>} env
 * @param {object} [options]
 * @param {string[]} [options.requiredEnv]
 * @param {string[]} [options.deniedEnv]
 * @returns {string[]} validation errors (empty when valid)
 */
export function validateRuntimeSessionEnv(env = {}, options = {}) {
  const errors = [];
  const requiredEnv = options.requiredEnv ?? defaultRequiredRunnerEnv;
  const deniedEnv = options.deniedEnv ?? defaultDeniedRunnerEnv;

  for (const name of requiredEnv) {
    if (!hasValue(env[name])) {
      errors.push(`env missing ${name}`);
    }
  }

  for (const name of deniedEnv) {
    if (hasValue(env[name])) {
      errors.push(`env must not include ${name}`);
    }
  }

  if (hasValue(env.API_ENDPOINT)) {
    const url = parseEndpoint(env.API_ENDPOINT);
    if (!url) {
      errors.push("API_ENDPOINT must be a valid URL");
    } else if (url.protocol !== "https:" && !isLocalhost(url.hostname)) {
      errors.push("API_ENDPOINT must use https outside localhost");
    }
  }

  if (hasValue(env.PROJECT_PATH) && !env.PROJECT_PATH.startsWith("/workspace")) {
    errors.push("PROJECT_PATH must be under /workspace");
  }

  return errors;
}

/**
 * Resolve a frozen, scoped session channel from the runtime startup environment.
 * Throws before any work starts if the environment fails validation.
 *
 * @param {Record<string,string>} [env]
 * @param {object} [options] - forwarded to validateRuntimeSessionEnv
 */
export function resolveRuntimeSessionChannel(env = process.env, options = {}) {
  const errors = validateRuntimeSessionEnv(env, options);
  if (errors.length > 0) {
    const error = new Error(`Invalid sandbox runtime session environment:\n${errors.join("\n")}`);
    error.code = "SANDBOX_RUNTIME_ENV_INVALID";
    error.errors = errors;
    throw error;
  }

  const endpoint = new URL(env.API_ENDPOINT).toString();
  const sessionId = env.SESSION_ID;
  const organizationId = env.ORGANIZATION_ID;
  const runnerToken = env.RUNNER_TOKEN;
  const sessionToken = env.SESSION_TOKEN;

  return Object.freeze({
    kind: RUNTIME_SESSION_CHANNEL_KIND,
    endpoint,
    sessionId,
    organizationId,
    selectedAgent: env.SELECTED_AGENT,
    projectPath: env.PROJECT_PATH,
    projectContext: env.PROJECT_CONTEXT,
    initialPrompt: env.INITIAL_PROMPT,
    auth: Object.freeze({
      mode: "scoped-session",
      runnerTokenEnv: "RUNNER_TOKEN",
      sessionTokenEnv: "SESSION_TOKEN"
    }),
    buildHeaders() {
      return {
        authorization: `Bearer ${sessionToken}`,
        "x-runner-token": runnerToken,
        "x-session-id": sessionId,
        "x-organization-id": organizationId
      };
    }
  });
}

function parseEndpoint(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function isLocalhost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

function hasValue(value) {
  return typeof value === "string" ? value.trim().length > 0 : value !== undefined && value !== null;
}
