# GAL Status Components

GAL status is published through the central Scheduler Systems status page:
`https://status.scheduler-systems.com`.

This document maps GAL product capabilities to customer-facing status
components. Component names should match the Stratus status catalog so support,
client UX, synthetic probes, and incident updates use the same language.

## Public Components

| Component | Customer path | Owning source | Public status meaning |
| --- | --- | --- | --- |
| GAL API | `https://api.gal.run` authenticated REST/MCP/API traffic | `gal-run/gal-private` | GAL control-plane API availability, auth/API routing, and safe request correlation |
| GAL Code Gateway | `https://api.gal.run/api/gal-code/*` OpenAI-compatible GAL Code traffic | `gal-run/gal-private` | Gateway availability, retryable upstream failures, timeout handling, and safe upstream metadata |
| GLM Gateway | GLM model route behind GAL Code | `gal-run/gal-private` | Upstream model/provider availability, throttling, and dependency degradation |
| GAL Web App | `https://app.gal.run` authenticated product UI | `gal-run/gal-private` | Dashboard availability and authenticated GAL workflows |
| GAL CLI Distribution | install/update channels for `gal` | `gal-run/gal-cli` and release automation | CLI install/update availability, package registry health, and release artifact access |
| VS Code Extension | GAL VS Code extension runtime and update path | `gal-run/gal-vscode-extension` | Extension update availability and API service-degradation UX |
| Browser Extension | GAL browser extension runtime and update path | `gal-run/gal-browser-extension` | Extension update availability, sync retries, and API service-degradation UX |
| Agent Network | Agent Network APIs and SDK-facing service boundary | `gal-run/agent-network` | API availability, SDK-safe degraded dependency metadata, and request correlation |
| GAL-T | GAL-T gateway deployments | `gal-run/gal-t` | Gateway availability, policy engine availability, queue/backpressure, and safe connectivity state |

## Client UX Rules

- Show the canonical status-page link when a GAL API returns safe degradation
  metadata.
- Preserve request IDs and retry-after values in support-visible messages.
- Treat `429`, `500`, `502`, `503`, `504`, network failures, and upstream
  timeouts as service states when the API marks them as gateway/upstream
  degradation.
- Do not tell users to re-authenticate, reinstall, or change local config when
  the service is reporting degraded or unavailable state.
- Do not expose provider secrets, prompts, tenant identifiers, policy payloads,
  internal project names, raw stack traces, or unredacted upstream responses.

## Status Endpoint Contract

Product services should expose:

- `/healthz` for process/liveness checks.
- `/readyz` for deployment readiness and required local dependencies.
- `/status` for machine-readable public component state, dependency state, and
  safe diagnostic metadata.

Public `/status` output should include only:

- component name
- status value
- generated timestamp
- request/correlation ID where applicable
- dependency status family, not secret dependency details
- retry-after or maintenance window when available
- status-page URL

Internal dashboards can hold richer operator-only fields, but those fields must
not be required for customer support to triage degraded-service reports.

## Related Work

- Stratus parent status feature: `StratusCloudLabs/stratus#3283`
- Stratus status-page seed PR: `StratusCloudLabs/stratus#3285`
- GAL Gateway diagnostics: `gal-run/gal-private#6921`
- GAL Gateway implementation PR: `gal-run/gal-private#6923`
- GAL CLI status command: `gal-run/gal-cli#7`
- VS Code service-degradation UX: `gal-run/gal-vscode-extension#3`
- Browser service-degradation UX: `gal-run/gal-browser-extension#3`
