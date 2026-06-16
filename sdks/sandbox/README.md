# sandbox-runtime-contract

A small, dependency-free contract for running an untrusted agent inside a secure,
isolated runtime sandbox. It defines two enforcement planes as executable
contracts so they can be tested in CI rather than only documented:

- **OS enforcement plan** (`src/contracts.mjs`) — the Kubernetes/Kata pod and
  container controls a sandbox must satisfy: explicit non-default namespace, a
  Kata-backed runtime class, service-account-token automount disabled, non-root
  user, read-only root filesystem, all Linux capabilities dropped, an explicit
  writable-mount allowlist, and a default-deny network policy with allowlisted
  egress.
- **Runtime startup contract** (`src/runtime-session-channel.mjs`) — the narrow
  environment a runtime receives at startup, plus a credential-hygiene denylist
  that refuses to start if provider/dispatch secrets (cloud keys, CI tokens,
  etc.) leak into the sandbox. It also requires an HTTPS callback endpoint
  (except localhost) and confines the project path under `/workspace`.

This library is **deployment-agnostic**. It does not embed any specific cloud,
cluster lifecycle service, or dispatch gateway. You bring your own allowed launch
backends and dispatch buses and pass them to the validator.

> Note: the denylists hold credential *variable names* used for hardening. No
> secret values are stored in this repository.

## Install

```sh
npm install sandbox-runtime-contract
```

## Use

```js
import { referenceSandboxPlan, validateSandboxPlan } from "sandbox-runtime-contract/contracts";

const errors = validateSandboxPlan(myPlan, {
  allowedLaunchBackends: ["my-runtime"],
  allowedDispatchBuses: ["my-control-plane"]
});
if (errors.length) throw new Error(errors.join("\n"));
```

```js
import { resolveRuntimeSessionChannel } from "sandbox-runtime-contract/runtime-session-channel";

// Throws SANDBOX_RUNTIME_ENV_INVALID before any work starts if the
// environment is missing required fields or carries denied credentials.
const channel = resolveRuntimeSessionChannel(process.env);
const res = await fetch(channel.endpoint, { headers: channel.buildHeaders() });
```

## Required startup environment

| Variable | Meaning |
| --- | --- |
| `SESSION_ID` | the one session this runtime serves |
| `ORGANIZATION_ID` | owning organization |
| `SELECTED_AGENT` | agent profile to run |
| `INITIAL_PROMPT` | first task |
| `PROJECT_CONTEXT` | project/context label |
| `PROJECT_PATH` | workspace path (must be under `/workspace`) |
| `API_ENDPOINT` | callback endpoint (HTTPS outside localhost) |
| `RUNNER_TOKEN` | session-scoped runner token |
| `SESSION_TOKEN` | session-scoped bearer token |

## Test

```sh
npm test
```

## Non-negotiables

- No warm-pool scheduler or preheated repo cache as the execution boundary.
- No CI runner used as a managed-agent runtime dispatch path.
- No provider credentials injected into the agent container by default.
- No default-namespace execution.
- No privileged containers, privilege escalation, writable root filesystem, or
  broad Linux capabilities.
- No open egress policy.

## License

Apache-2.0. See `LICENSE` and `NOTICE`.
