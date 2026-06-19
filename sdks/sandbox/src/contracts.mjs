// SPDX-License-Identifier: Apache-2.0
// Copyright The sandbox-runtime-contract authors.

export const SANDBOX_RUNTIME_CONTRACT_VERSION = "sandbox-runtime-v1";

// A starter set of dispatch backends that should never be trusted as the
// execution boundary for a managed agent runtime. Callers may extend this with
// their own environment-specific denylist via validateSandboxPlan options.
export const defaultDeniedLaunchBackends = Object.freeze([
  "github-actions",
  "gha",
  "warm-pool"
]);

// Environment variable names that must never be inherited by an isolated agent
// runtime. These are provider/dispatch credential *names* used as a hardening
// denylist -- the contract refuses to start if any are present in the runtime
// environment. No secret values are stored here.
export const defaultDeniedRunnerEnv = Object.freeze([
  "ACTIONS_ID_TOKEN_REQUEST_TOKEN",
  "ACTIONS_ID_TOKEN_REQUEST_URL",
  "ACTIONS_RUNTIME_TOKEN",
  "AWS_ACCESS_KEY_ID",
  "AWS_SECRET_ACCESS_KEY",
  "AWS_SESSION_TOKEN",
  "AZURE_CLIENT_ID",
  "AZURE_CLIENT_SECRET",
  "AZURE_TENANT_ID",
  "GITHUB_ACTIONS",
  "GITHUB_TOKEN",
  "GOOGLE_APPLICATION_CREDENTIALS",
  "GOOGLE_CLOUD_PROJECT"
]);

// The narrow startup contract a managed runtime receives. The runtime is told
// its session, its workspace, where to call back (API_ENDPOINT) and the scoped
// tokens that authorize that one session -- and nothing else.
export const defaultRequiredRunnerEnv = Object.freeze([
  "SESSION_ID",
  "ORGANIZATION_ID",
  "SELECTED_AGENT",
  "INITIAL_PROMPT",
  "PROJECT_CONTEXT",
  "PROJECT_PATH",
  "API_ENDPOINT",
  "RUNNER_TOKEN",
  "SESSION_TOKEN"
]);

// A reference plan that satisfies the contract. It is intentionally backend- and
// dispatch-agnostic: the launch backend ("example-runtime") and dispatch bus
// ("example-bus") are placeholders you replace with your own deployment's values
// and pass through the validator options.
export const referenceSandboxPlan = Object.freeze({
  contractVersion: SANDBOX_RUNTIME_CONTRACT_VERSION,
  launchBackend: "example-runtime",
  namespace: "agent-sandbox",
  runtimeClassName: "kata",
  dispatchBuses: ["example-bus"],
  repoHydration: {
    mode: "checkout",
    workspacePath: "/workspace"
  },
  podSecurityContext: {
    automountServiceAccountToken: false,
    runAsNonRoot: true,
    runAsUser: 1000,
    runAsGroup: 1000,
    fsGroup: 1000,
    seccompProfile: "RuntimeDefault"
  },
  containerSecurityContext: {
    allowPrivilegeEscalation: false,
    readOnlyRootFilesystem: true,
    runAsNonRoot: true,
    capabilitiesDrop: ["ALL"]
  },
  filesystem: {
    writableMounts: ["/home/runner", "/workspace", "/tmp"],
    rootFilesystemReadOnly: true
  },
  networkPolicy: {
    defaultDeny: true,
    egressMode: "allowlist"
  },
  runnerEnv: defaultRequiredRunnerEnv
});

/**
 * Validate an OS/pod enforcement plan for an isolated agent runtime.
 *
 * The validator is deployment-agnostic. Supply your own allowed launch backends
 * and dispatch buses through `options`; the OS-level controls (Kata runtime,
 * non-root, read-only rootfs, dropped capabilities, default-deny egress, etc.)
 * are enforced for every plan.
 *
 * @param {object} plan
 * @param {object} [options]
 * @param {string[]} [options.allowedLaunchBackends] - backends accepted as the
 *   enabled launch path. Defaults to the plan's own launchBackend.
 * @param {string[]} [options.allowedDispatchBuses] - dispatch buses accepted.
 *   Defaults to the plan's own dispatchBuses.
 * @param {string[]} [options.deniedLaunchBackends]
 * @param {string[]} [options.requiredRunnerEnv]
 * @param {string[]} [options.deniedRunnerEnv]
 * @returns {string[]} list of validation errors (empty when valid)
 */
export function validateSandboxPlan(plan, options = {}) {
  const errors = [];
  const value = plan ?? {};

  const allowedLaunchBackends =
    options.allowedLaunchBackends ?? (value.launchBackend ? [value.launchBackend] : []);
  const allowedDispatchBuses =
    options.allowedDispatchBuses ?? (Array.isArray(value.dispatchBuses) ? value.dispatchBuses : []);
  const deniedLaunchBackends = options.deniedLaunchBackends ?? defaultDeniedLaunchBackends;
  const requiredRunnerEnv = options.requiredRunnerEnv ?? defaultRequiredRunnerEnv;
  const deniedRunnerEnv = options.deniedRunnerEnv ?? defaultDeniedRunnerEnv;

  requireEqual(errors, value.contractVersion, SANDBOX_RUNTIME_CONTRACT_VERSION, "contractVersion");

  if (!allowedLaunchBackends.includes(value.launchBackend)) {
    errors.push(`launchBackend must be one of: ${allowedLaunchBackends.join(", ")}`);
  }
  if (deniedLaunchBackends.includes(value.launchBackend)) {
    errors.push(`launchBackend ${value.launchBackend} is denied`);
  }

  const dispatchBuses = value.dispatchBuses ?? [];
  if (!Array.isArray(dispatchBuses) || dispatchBuses.length === 0) {
    errors.push("dispatchBuses must list at least one allowed bus");
  }
  for (const backend of dispatchBuses) {
    if (deniedLaunchBackends.includes(backend)) {
      errors.push(`dispatch bus ${backend} is denied`);
    }
    if (allowedDispatchBuses.length > 0 && !allowedDispatchBuses.includes(backend)) {
      errors.push(`dispatch bus ${backend} is not allowed`);
    }
  }

  if (value.repoHydration?.mode === "warm-pool") {
    errors.push("repoHydration.mode warm-pool is denied");
  }
  requireEqual(errors, value.repoHydration?.mode, "checkout", "repoHydration.mode");
  requireEqual(errors, value.repoHydration?.workspacePath, "/workspace", "repoHydration.workspacePath");

  if (!value.namespace || value.namespace === "default") {
    errors.push("namespace must be explicit and must not be default");
  }

  if (!String(value.runtimeClassName ?? "").startsWith("kata")) {
    errors.push("runtimeClassName must use a Kata runtime class");
  }

  requireEqual(errors, value.podSecurityContext?.automountServiceAccountToken, false, "podSecurityContext.automountServiceAccountToken");
  requireEqual(errors, value.podSecurityContext?.runAsNonRoot, true, "podSecurityContext.runAsNonRoot");
  requireOneOf(errors, value.podSecurityContext?.seccompProfile, ["RuntimeDefault", "Localhost"], "podSecurityContext.seccompProfile");
  requireEqual(errors, value.containerSecurityContext?.allowPrivilegeEscalation, false, "containerSecurityContext.allowPrivilegeEscalation");
  requireEqual(errors, value.containerSecurityContext?.readOnlyRootFilesystem, true, "containerSecurityContext.readOnlyRootFilesystem");
  requireEqual(errors, value.containerSecurityContext?.runAsNonRoot, true, "containerSecurityContext.runAsNonRoot");

  if (!new Set(value.containerSecurityContext?.capabilitiesDrop ?? []).has("ALL")) {
    errors.push("containerSecurityContext.capabilitiesDrop must include ALL");
  }

  requireEqual(errors, value.networkPolicy?.defaultDeny, true, "networkPolicy.defaultDeny");
  requireEqual(errors, value.networkPolicy?.egressMode, "allowlist", "networkPolicy.egressMode");

  const env = new Set(Array.isArray(value.runnerEnv) ? value.runnerEnv : Object.keys(value.runnerEnv ?? {}));
  for (const name of requiredRunnerEnv) {
    if (!env.has(name)) {
      errors.push(`runnerEnv missing ${name}`);
    }
  }
  for (const name of deniedRunnerEnv) {
    if (env.has(name)) {
      errors.push(`runnerEnv must not include ${name}`);
    }
  }

  return errors;
}

function requireEqual(errors, actual, expected, field) {
  if (actual !== expected) {
    errors.push(`${field} must be ${String(expected)}`);
  }
}

function requireOneOf(errors, actual, expected, field) {
  if (!expected.includes(actual)) {
    errors.push(`${field} must be one of: ${expected.join(", ")}`);
  }
}
