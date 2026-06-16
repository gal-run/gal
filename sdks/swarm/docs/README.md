# GAL Swarm Docs

This directory is organized by the role each document plays in the project.

## Start Here

- [Architecture](standard/architecture.md) explains the package boundary,
  lifecycle, topology, provider split, and standard conformance.
- [Requirements](standard/requirements.md) maps the package behavior to
  verifiable swarm requirements.
- [Testing Standard](standard/testing.md) defines the always-on test surface,
  proof scope, evidence requirements, and non-claims.
- [GAL API Swarm Microservice Contract](api/gal-api-swarm-microservice.md)
  maps API ownership to `gal-api` and package contracts to `@gal/swarm`.
- [Governed Coding Swarm](concepts/governed-coding-swarm.md) describes the
  300-lane governed collaboration model and evidence ledger.

## Standard Adoption

- [Standard Manifest](standard.manifest.json) declares the
  Prompt-to-Binary adoption metadata.
- [ADR 0001](adr/0001-swarm-standard-adoption.md) records the decision to adopt
  the Prompt-to-Binary standard as an SDK consumer.
- [ADR 0002](adr/0002-swarm-testing-standard.md) records the local testing
  standard surface.

## Operations

- [Startup Latency SLO](operations/startup-latency-slo.md) defines the
  hot-start dispatch SLO and proof command.
- [Release Runbook](operations/release-runbook.md) captures internal package
  release gates and release commands.

## Providers

- [H200 Provider Economics](providers/h200-provider-economics.md) records the
  current H200 provider preference and operational policy.

## Proofs

- [300-Wave Dry-Run Proof](proofs/300-wave-dry-run-proof.md) documents the
  dry-run proof harness for the 300-wave control plane.

## Release Notes

- [v0.3.3](releases/v0.3.3.md)
- [v0.3.2](releases/v0.3.2.md)
- [v0.3.1](releases/v0.3.1.md)
- [v0.3.0](releases/v0.3.0.md)
- [v0.2.0](releases/v0.2.0.md)
- [v0.1.0](releases/v0.1.0.md)
