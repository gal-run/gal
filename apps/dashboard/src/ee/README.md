# GAL Dashboard — Enterprise (EE)

> **License:** Everything in this `src/ee/` directory is covered by the
> [GAL Enterprise License](./LICENSE), **not** the repository-root Apache-2.0
> license. The source is visible for evaluation/development, but a paid license
> is required to use it in production.

This directory contains the **Enterprise (open-core) surface** of the GAL
Dashboard. The rest of the repository (everything outside `src/ee/`) is a
complete, single-tenant, Apache-2.0 application that works on its own.

## What's in here

| Path | Feature |
|------|---------|
| `app/billing/` | Billing & subscription management UI (+ checkout, seat metrics, payment warning logic). |
| `app/managed-agents/` | Managed (hosted) agent templates and management. |
| `app/settings/rate-cards/` | Token rate-cards (split out of Core settings). |
| `app/workspaces/[org]/` | Cross-org workspace view (multi-tenant). |
| `app/team/` | Org membership / team management. |
| `lib/managed-agent-templates.ts` | Managed-agent template catalog. |
| `vendored-gal-api/client/` | The cross-org repository/client layer (`@gal/api` client) — the multi-tenant data access seam. |
| `license.ts` | The runtime EE license gate (`isEeEnabled()`). |
| `EeRouteGate.tsx` | Defense-in-depth wrapper rendered by each EE route's `page.tsx`. |

## How the gate works

`src/ee/license.ts` exports `isEeEnabled()`, which mirrors the existing
demo-mode env-flag pattern (`src/lib/demo-guard.ts`). It reads:

- `GAL_EE_LICENSE_KEY` — server-side checks (route handlers, RSC).
- `NEXT_PUBLIC_GAL_EE_LICENSE_KEY` — client-side checks (nav rendering, providers).

The template implementation is a **presence + basic-format check only**
(`/^gal-ee-[A-Za-z0-9_-]{16,}$/`), memoized.

> **TODO(prod):** replace the format check with signed-key verification
> (jose JWT / ed25519 signature, expiry, feature claims). See Langfuse's
> `ee/getLicenseKey` for the reference pattern.

Four layers enforce the gate (defense in depth):

1. **Nav** — in `src/app/(dashboard)/layout.tsx`, EE `NAV_ITEMS`
   (billing, managed-agents, workspaces, team, rate-cards) are tagged
   `ee: true`. The render filter drops them with
   `if (item.ee && !isEeEnabled()) return null` **before** the existing
   `isPageVisible()` check, so EE nav never renders in the free build.
2. **Routes** — each EE route's `page.tsx` wraps the real implementation in
   `<EeRouteGate>`, which renders a Core `<FeatureGate>` when EE is disabled
   (so a hand-typed `/billing` URL shows "unavailable" in the free build).
3. **Providers** — see `src/providers.tsx`. The cross-org repository layer
   (`CoreServicesProvider`, backed by `vendored-gal-api`) is the multi-tenant
   seam; the single-tenant free build does not enable EE behavior.
4. **Feature flags** — in `src/contexts/FeatureFlagsContext.tsx`,
   `isPageVisibleForUser()` collapses to `FALLBACK_PUBLIC_PAGES` (dashboard,
   discovery, project-scope-configs, team, cli, vscode, docs, settings) when
   `!isEeEnabled()`. No key means single-tenant free, never EE.

## Provider gating contract (implementation note)

A few **Core** pages historically read `organizationRepository` via
`useCoreRepositories()` (`dashboard/page.tsx`, `InteractiveSessionPage.tsx`)
to list the current single workspace. Because of that, `CoreServicesProvider`
is mounted in both builds rather than being unmounted when EE is off — removing
it would break those Core reads. Enterprise *behavior* (multi-tenant, cross-org
switching) is therefore enforced at the nav / route / audience-tier layers
above, not by unmounting the provider. This is the single deliberate deviation
from a strict "no repo layer in the free build" split, made to keep the
single-tenant Core build functional and buildable.

## Enabling EE

Set both env vars to a valid key (see `.env.example`) and rebuild:

```bash
GAL_EE_LICENSE_KEY=gal-ee-XXXXXXXXXXXXXXXX
NEXT_PUBLIC_GAL_EE_LICENSE_KEY=gal-ee-XXXXXXXXXXXXXXXX
```

Production use of EE requires a paid license — see [`LICENSE`](./LICENSE).
