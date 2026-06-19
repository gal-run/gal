# GAL Status Components

GAL status is published through the central Scheduler Systems status page:
`https://status.scheduler-systems.com`.

This document maps GAL product capabilities to customer-facing status
components.

## Public Components

| Component | Customer path | Public status meaning |
| --- | --- | --- |
| GAL API | `https://api.gal.run` authenticated REST/MCP/API traffic | GAL control-plane API availability and safe request correlation |
| GAL Code Gateway | `https://api.gal.run/api/gal-code/*` OpenAI-compatible GAL Code traffic | Gateway availability, retryable upstream failures, timeout handling |
| GLM Gateway | GLM model route behind GAL Code | Upstream model/provider availability, throttling, and dependency degradation |
| GAL Web App | `https://app.gal.run` authenticated product UI | Dashboard availability and authenticated GAL workflows |
| GAL CLI Distribution | install/update channels for `gal` | CLI install/update availability, package registry health, release artifact access |
| VS Code Extension | GAL VS Code extension runtime and update path | Extension update availability and API service-degradation UX |
| Browser Extension | GAL browser extension runtime and update path | Extension update availability, sync retries, and API service-degradation UX |
| Agent Network | Agent Network APIs and SDK-facing service boundary | API availability and request correlation |
| GAL-T | GAL-T gateway deployments | Gateway availability, policy engine availability, queue/backpressure |

## Client UX Rules

- Show the canonical status-page link when a GAL API returns safe degradation metadata.
- Preserve request IDs and retry-after values in support-visible messages.
- Treat `429`, `500`, `502`, `503`, `504`, network failures, and upstream timeouts as service states when the API marks them as gateway/upstream degradation.
- Do not tell users to re-authenticate, reinstall, or change local config when the service is reporting degraded or unavailable state.

## Status Endpoint Contract

Product services should expose:

- `/healthz` for process/liveness checks.
- `/readyz` for deployment readiness and required local dependencies.
- `/status` for machine-readable public component state, dependency state, and safe diagnostic metadata.

Public `/status` output should include only:

- component name
- status value
- generated timestamp
- request/correlation ID where applicable
- dependency status family, not secret dependency details
- retry-after or maintenance window when available
- status-page URL
