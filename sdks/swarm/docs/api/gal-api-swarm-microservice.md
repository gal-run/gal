# GAL API Swarm Microservice Contract

The Swarm HTTP API belongs to `gal-api`, not this package. `@gal/swarm`
defines the typed planning contracts used by that service; `gal-api` owns the
microservice route, auth gates, persistence, dispatch integration, and status
hydration.

## Ownership

| Layer | Repository | Source | Responsibility |
| --- | --- | --- | --- |
| Swarm microservice API | `gal-run/gal-api` | `src/routes/swarm-routes.ts` | HTTP routes, auth, org access, run storage, dispatch, status, actuals, capacity observations. |
| Route registration | `gal-run/gal-api` | `src/routes/index.ts` | Mounts the swarm router at `/api/swarm` with GAL API middleware and service dependencies. |
| Contract SDK | `gal-run/gal-swarm` | `src/contracts.ts`, `src/contracts/*`, `src/swarm.ts` | TypeScript contracts, schema versions, topology modes, run-plan types, capacity decisions, and evidence contracts. |
| Planning implementation | `gal-run/gal-swarm` | `src/application/*.ts` | Pure planning functions consumed by the API service. No HTTP server, auth, database, or deployment ownership. |

`gal-api` already depends on `@gal/swarm` through the workspace dependency. That
is the intended integration: the service imports contract functions from the
package root and exposes them through GAL API microservice routes.

## Service Boundary

`gal-swarm` must stay a library. It should not define Express routes, service
tokens, persistence adapters, or deployment configuration. Those belong in
`gal-api` so Swarm remains part of the larger GAL API microservice surface.

`gal-api` should use this package for:

- request and response types such as `GalSwarmRunRequest`,
  `GalSwarmRunPlan`, `GalSwarmCapacityObservation`, and
  `GalSwarmProviderActionPlan`
- stored-run, worker-dispatch, runner-label, and response DTOs such as
  `GalSwarmStoredRun`, `GalSwarmWorkerDispatchRequest`,
  `GalSwarmWorkerDispatchState`, and `GalSwarmRunCreateResponse`
- planning functions such as `createGalSwarmRunPlan()`,
  `decideGalSwarmCapacity()`, `createGalSwarmProviderActionPlan()`, and
  `createGalSwarmTopologyPlan()`
- adapter-safe helpers such as `normalizeGalSwarmWorkerDispatchRequest()`,
  `normalizeGalSwarmWorkerIssues()`, `normalizeGalSwarmRunnerLabels()`,
  `createGalSwarmStoredRun()`, and `createGalSwarmRunCreateResponse()`
- architecture-mode helpers such as `listGalSwarmTopologyAliases()`,
  `normalizeGalSwarmTopologyMode()`, and `routeGalSwarmTopology()`

`gal-api` should own:

- `/api/swarm` route mounting
- authentication and organization access
- feature gates for internal Swarm access
- Firestore or repository-backed run storage
- Stratus dispatch and worker-session dispatch
- live status hydration
- API-level tests for request, response, authorization, persistence, and
  dispatch behavior

## Cross-Repo Isolation Rule

Swarm DTOs that are shared by API, CLI, MCP, dashboard, agent-network, or
runtime adapters belong in `@gal/swarm`. Product repos may adapt those contracts
to their local UI, transport, auth, or persistence, but they should not redefine
parallel TypeScript interfaces for the same run request, stored run, worker
dispatch, runner label, or wave-ledger event envelope.

Current consumers should converge on this package:

| Consumer | Keep there | Import from `@gal/swarm` |
| --- | --- | --- |
| `gal-api` | Express routes, auth, org access, Firestore, session dispatch, Stratus workflow dispatch, live status hydration | run request/response DTOs, stored run DTOs, worker-dispatch DTOs, runner-label normalization, planning helpers |
| `gal-cli` | Commander UX, auth config, terminal rendering, remote API calls | request builders, worker issue normalization, runner-label normalization |
| `gal-mcp` | MCP tool schemas, active workspace resolution, API client transport | request DTOs, worker dispatch DTOs, default request builders |
| `gal-dashboard` | React UI, form state, feature gating, visual status rendering | run request/plan/status DTOs |
| `agent-network` | transport adapters and service envelopes | wave-ledger event envelope and evidence reference types |
| `gal-agents` | agent cards and capability definitions | swarm role ids or task constants only if they become cross-runtime contract |

## Current GAL API Route Shape

The current `gal-api` swarm microservice route is mounted at `/api/swarm`.

| Method | Path | Contract |
| --- | --- | --- |
| `GET` | `/api/swarm/:orgName/runs` | List stored swarm runs for an organization. |
| `POST` | `/api/swarm/:orgName/runs` | Normalize request input, call `createGalSwarmRunPlan()`, store the run, optionally dispatch Stratus and worker sessions, and return the plan plus service endpoints. |
| `GET` | `/api/swarm/:orgName/runs/:runId` | Fetch a run and hydrate live status from dispatch/session readers. |
| `PATCH` | `/api/swarm/:orgName/runs/:runId/actuals` | Store execution actuals and compute calibration with `createGalSwarmCalibrationSummary()`. |
| `PATCH` | `/api/swarm/:orgName/runs/:runId/capacity` | Store capacity observation, call `decideGalSwarmCapacity()`, and derive a provider action plan. |

This package documents the contract those routes consume. The route-level API
definition and operational service behavior should be maintained in `gal-api`.

## Architecture Mode Contract

Canonical architecture modes are still defined here because they are part of the
shared contract consumed by `gal-api`, GAL Code, MCP tools, and dashboards:

```ts
type GalSwarmOrchestrationMode =
  | 'sequential'
  | 'concurrent'
  | 'graph'
  | 'hierarchical'
  | 'mixture'
  | 'group_chat'
  | 'forest'
  | 'heavy'
  | 'router'
```

Public Swarms names are compatibility aliases. `gal-api` should accept user
input through this package and store the canonical GAL mode:

1. `normalizeGalSwarmTopologyMode(input)` maps canonical modes and public
   aliases into GAL modes.
2. `routeGalSwarmTopology(request)` resolves explicit modes or auto-router
   heuristics.
3. `createGalSwarmTopologyPlan(request)` creates the lane/evidence plan that the
   `gal-api` microservice can persist or expose.

## Microservice Implementation Rule

When a new Swarm API endpoint is needed:

1. Add or extend the pure contract in `gal-swarm`.
2. Add the HTTP route, auth, storage, and integration behavior in `gal-api`.
3. Add contract tests in `gal-swarm` for pure planning behavior.
4. Add route/service tests in `gal-api` for the real API behavior.
5. Keep dashboard, CLI, and MCP clients pointed at the `gal-api` microservice,
   not directly at local package internals.

This keeps the API part of the larger GAL API microservice system while keeping
`@gal/swarm` small, testable, and reusable.
