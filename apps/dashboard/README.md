<!--
  License: Apache-2.0 for everything EXCEPT src/ee/** (GAL Enterprise License).
  See LICENSE, NOTICE, and src/ee/LICENSE.
-->

# GAL Dashboard

**An open-source web dashboard for governing AI coding agents** — discover and
review agent configs across your repositories, enforce policy, run and observe
agent sessions, manage approved configurations, and inspect compliance. Built
with Next.js (App Router) + React 19 + TypeScript.

The default build is a **single-tenant, fully open-source (Apache-2.0)**
application you can self-host today. A source-visible **Enterprise (EE)** layer
under [`src/ee/`](./src/ee) adds multi-tenant workspaces and commercial
features; it is disabled unless you provide a license key.

---

## Self-host quickstart

### Option A — Docker Compose (recommended)

```bash
cp .env.example .env        # fill in your values (Firebase web config, API URL)
docker compose up --build   # builds + runs on http://localhost:3000
```

### Option B — local dev

```bash
pnpm install
cp .env.example .env.local  # fill in your values
pnpm dev                    # http://localhost:5175
```

### Option C — Docker image directly

```bash
docker build \
  --build-arg NEXT_PUBLIC_API_URL=https://api.example.com \
  --build-arg NEXT_PUBLIC_FIREBASE_API_KEY=$YOUR_FIREBASE_WEB_API_KEY \
  -t gal-dashboard .
docker run -p 3000:3000 gal-dashboard
```

All configuration is environment-driven — see [`.env.example`](./.env.example).
**No secrets or API keys are committed to this repository.** A Firebase *web*
API key is shipped to browsers by design (it is not a secret); provide your own.

---

## Build

```bash
pnpm install         # regenerates the lockfile (this is a standalone app)
pnpm build           # next build — produces .next/standalone
pnpm start           # serve the production build
```

This repo is **standalone**: the former `@gal/*` git submodules have been
vendored inline (see [Architecture](#architecture--vendored-packages)), so there
are no private submodules to initialize and no private registry to authenticate
against.

---

## Open core: the `src/ee/` split

This project follows an **open-core** model (the same shape used by projects
like Langfuse):

| Tier | Location | License | What it is |
|------|----------|---------|-----------|
| **Core** | everything outside `src/ee/` | Apache-2.0 | Single-tenant dashboard: discovery, approved config, proposals, enforcement, policies, agents/sessions, evals, swarm, agent-network, settings, auth. |
| **Enterprise (EE)** | [`src/ee/`](./src/ee) | GAL Enterprise License (source-visible, paid for production) | Multi-tenant workspaces & org membership, team management, billing, managed agents, rate-cards, the cross-org repository layer, and internal billing analytics. |

**The default build runs Core only (single-tenant).** EE is gated behind a
license key and is *off* unless you configure one:

- `GAL_EE_LICENSE_KEY` (server) and `NEXT_PUBLIC_GAL_EE_LICENSE_KEY` (client).
- With no key: EE nav items never render, EE routes 404 / show an "unavailable"
  notice, and the feature-flag audience resolver is collapsed to the free public
  tier. See [`src/ee/README.md`](./src/ee/README.md) and
  [`src/ee/license.ts`](./src/ee/license.ts).

See [`src/ee/LICENSE`](./src/ee/LICENSE) for the Enterprise terms.

---

## Architecture / vendored packages

To make the open-source build self-contained, first-party GAL packages are
vendored inline and resolved via `tsconfig` path aliases:

- `@gal/types` → `src/vendored-gal/types`
- `@gal/core` → `src/vendored-gal/core`
- `@gal/swarm` → `src/vendored-gal/swarm`
- `@gal/telemetry` → `src/vendored-gal/telemetry` (+ `src/lib/gal-telemetry-browser.ts`)
- `@gal/enforce-rules` → `src/vendored-gal/enforce-rules`

The Enterprise repository/client layer (`@gal/api` client) is vendored under
`src/ee/vendored-gal-api/` and is covered by the Enterprise License.

---

## License

- **Core** (everything outside `src/ee/`): [Apache-2.0](./LICENSE) (see also [`NOTICE`](./NOTICE)).
- **Enterprise** (`src/ee/`): [GAL Enterprise License](./src/ee/LICENSE) — source-visible; a paid license is required for production use.
