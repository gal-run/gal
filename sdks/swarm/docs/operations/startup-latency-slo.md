# GAL Swarm Startup Latency SLO

This proof lane measures only the local, provider-neutral bootstrap path in
`@gal/swarm`: loading the built contract package, constructing preflight compute
profiles, creating a dry-run swarm run plan, and deriving the default capacity
policy. It does not start Stratus capacity, touch provider credentials, or prove
live 300-worker capacity.

## SLO

- Cold local bootstrap p95: <= 500 ms, measured as a fresh Node process loading
  `dist/index.js` and running the dry-run bootstrap path.
- Warm local bootstrap p95: <= 5 ms, measured in-process after the package is
  already loaded.
- Evidence must include cold and warm sample counts, p50, p95, max, and the
  exact threshold used.

The cold budget is intentionally a local proof threshold, not a live provider
startup target. Live GPU provisioning, image pulls, model hydration, Kubernetes
RuntimeClass scheduling, and 300-capacity readiness remain separate Stratus or
provider-adapter proof lanes.

## Command

```sh
npm run proof:startup-latency
```

Optional stricter local gates:

```sh
GAL_SWARM_STARTUP_COLD_P95_MS=250 GAL_SWARM_STARTUP_WARM_P95_MS=2 npm run proof:startup-latency
```

The command fails non-zero when p95 exceeds either threshold.
