# ADR 0001: GAL Swarm Adoption of the Prompt-to-Binary Standard

- **Status:** Accepted
- **Date:** 2026-05-15
- **Decider:** GAL Swarm maintainers
- **Technical Story:** gal-swarm needed standardization as a consumer of the
  prompt-to-binary framework so that future agents can understand its role
  without reading TypeScript implementation code.

## Context

gal-swarm orchestrates GPU-backed agent bursts. It produces swarm plans,
provider selections, and capacity decisions. Before standard adoption, gal-swarm
did not declare its relationship to the prompt-to-binary standard, making it
unclear to future agents whether it generates artifacts, consumes the standard,
or both.

The GravitonChips/prompt-to-binary standard defines:

- An artifact ladder (requirements → source → IR → bytecode → assembly → native)
- Verification gates for every artifact type
- Provenance requirements
- An SDK/framework boundary

gal-swarm produces plans and run requests but does not own the toolchain,
sandbox, or binary output of individual agents. It needed a clear, documented
boundary.

## Decision

gal-swarm adopts the prompt-to-binary standard as an SDK consumer:

- Swarm plans are mapped to the standard's **requirements** artifact type.
- Swarm run requests are mapped to the standard's **source** artifact type.
- Preflight checks are mapped to the standard's **verification gates**.
- The framework layer (artifact generation, verification, provenance
  enforcement) is deferred to `GravitonChips/prompt-to-binary/framework`.

Concrete deliverables:

1. `docs/standard.manifest.json` declares adoption with the canonical standard
   reference.
2. `docs/standard/architecture.md` documents gal-swarm's role in the standard
   ecosystem.
3. `docs/standard/requirements.md` maps gal-swarm features to standard
   requirements.
4. `docs/standard/testing.md` defines the always-on local testing surface.
5. `docs/adr/0001-swarm-standard-adoption.md` (this document) records the
   decision.

## Consequences

### Positive

- gal-swarm is now standards-conformant and can be verified with
  `framework/verify.py`.
- Future agents can understand gal-swarm's role by reading the docs, not the
  source code.
- The AI provider / sandbox provider split aligns naturally with the standard's
  SDK/framework boundary.

### Negative

- None. This is a documentation-only change; no runtime code was modified.

### Neutral

- The standard's artifact ladder applies to individual agent outputs, not swarm
  plans. This is documented explicitly so there is no ambiguity.

## References

- [Prompt-to-Binary Standard Repository](https://github.com/GravitonChips/prompt-to-binary)
- [GAL Swarm README](../../README.md)
- [GAL Swarm Docs](../README.md)
- [GAL Swarm Architecture](../standard/architecture.md)
- [GAL Swarm Requirements](../standard/requirements.md)
- [GAL Swarm Testing Standard](../standard/testing.md)
