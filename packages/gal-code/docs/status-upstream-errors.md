# Status-Aware Upstream Errors

GAL Code must distinguish local failures from GAL service degradation before this repository publishes independent runtime artifacts.

## Source Dependency

The current source of truth remains `gal-run/gal-private/apps/gal-code` until runtime extraction is complete. The status-aware retry behavior is implemented there and must be included in the first release owned by this repo.

## User Contract

When requests to `api.gal.run` fail with retryable GAL Gateway responses, GAL Code must show:

- the affected GAL component, such as `gal-code-gateway`
- the HTTP status when available
- retry-after timing when available
- the GAL request ID or upstream request ID when available
- the canonical status page URL

When runtime funding fails before provider execution, GAL Code must also show:

- a canonical reason class such as `provider_credit_insufficient`, `provider_allocation_unavailable`, or `runtime_budget_insufficient`
- that the failure is a runtime-funding/budget problem, not a generic model crash
- no provider payloads, prompts, or tokenized operator diagnostics

GAL Code must not expose prompts, provider payloads, tokens, tenant internals, or operator-only diagnostics in user-facing errors.

## Release Gate

Do not mark a GAL Code release ready unless:

- retry banners and final retry-exhaustion errors render GAL Gateway/service degradation context
- runtime-funding failures render canonical reason codes and explicit billing/runtime wording
- tests cover GAL Gateway errors with status metadata, without metadata, and after retry exhaustion
- the release notes link the shipped fix back to `gal-run/gal-code#3`
- the package has been verified against the deployed GAL Gateway status headers and body fields

This issue stays open until the source sync and release publish a GAL Code package containing the behavior.
