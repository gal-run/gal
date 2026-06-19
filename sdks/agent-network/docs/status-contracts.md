# Agent Network Health And Status Contracts

Agent Network is an enterprise API and SDK boundary. It must expose enough
status metadata for operators, client SDKs, and the central Stratus status page
to distinguish service degradation from local integration errors.

## Endpoint Contract

Agent Network services should expose:

- `GET /healthz`: process liveness, no dependency checks.
- `GET /readyz`: readiness for serving API traffic and required local
  dependencies.
- `GET /status`: machine-readable component state, public dependency state,
  synthetic probe definitions, request IDs, retry hints, and status-page URL.

The shared TypeScript contracts are exported from `src/service-agent.ts`:

- `GalServiceHealthResponse`
- `GalServiceStatusResponse`
- `GalServiceDependencyStatus`
- `GalServiceSyntheticProbe`

Schema versions:

- `gal.service-health.v1`
- `gal.service-status.v1`

## Public State Values

Health responses use:

- `ok`
- `degraded`
- `unavailable`

Status responses use the central status-page values:

- `operational`
- `degraded`
- `unavailable`
- `maintenance`
- `monitor_pending`

## Safe Metadata

Public status output may include:

- service ID and display name
- status-page URL
- generated timestamp
- request or correlation ID
- dependency ID, name, kind, and status
- HTTP status family or status code
- retry-after value
- public synthetic probe ID, method, path, timeout, and expected statuses

Public status output must not include:

- tokens, API keys, or signed URLs
- tenant identifiers unless explicitly customer-scoped and authenticated
- prompts, payloads, policy bodies, or tool arguments
- internal stack traces
- private infrastructure hostnames
- unredacted upstream responses

## SDK Guidance

SDKs should surface `GalServiceStatusResponse` metadata when an Agent Network
call fails with a retryable service error. Callers should receive:

- a stable error code
- `retryable: true` when the server says retry is appropriate
- request ID or correlation ID
- retry-after value when present
- status-page URL
- public component/dependency state

SDKs should not turn upstream or service degradation into local auth,
installation, or configuration guidance.

## Initial Synthetic Probes

The central Stratus status catalog should monitor:

| Probe | Method | Expected status | Notes |
| --- | --- | --- | --- |
| `agent-network-healthz` | `GET /healthz` | `200` | Process liveness |
| `agent-network-readyz` | `GET /readyz` | `200` | Local dependency readiness |
| `agent-network-status` | `GET /status` | `200` or `503` | Machine-readable public component state |

`/status` may return `503` during known degradation as long as the response body
conforms to `GalServiceStatusResponse` and includes safe request metadata.

## Related Work

- Parent status feature: `example-org/stratus#3283`
- Agent Network tracking issue: `gal-run/agent-network#3`
- GAL product component map: `gal-run/gal#398`
