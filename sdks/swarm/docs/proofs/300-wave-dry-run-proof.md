# 300-Wave Dry-Run Proof Harness

This harness proves the control-plane contract without applying provider changes,
touching API routes, or changing any live Stratus cluster state.

Run it from `gal-run/gal-swarm`:

```bash
npm run proof:wave-300
```

The harness checks this end-to-end path:

1. The topology alias `300-wave` is accepted and normalized to
   `wave-300-control-plane`.
2. A `dry-run` swarm run plan is generated for 300 planned workers.
3. The provider action plan is `noop-dry-run`, has `canApply: false`, and emits
   only a no-op provider command.
4. The evidence ledger expectation requires 300 workers, the dispatch-plan,
   evidence-ledger, and closeout-gate verifiers, plus the wave-status
   reconciler.
5. Closeout remains `blocked` when no evidence has been received.

The expected blocked closeout is intentional. It proves the closeout gate cannot
declare the wave complete from a generated plan alone.

## Non-Claim

The no-op provider command is capacity-action evidence, not worker fanout
evidence. The dry-run proof does not claim that 300 live sandboxes started and
does not require the provider command's worker count to equal the 300 planned
ledger workers.
