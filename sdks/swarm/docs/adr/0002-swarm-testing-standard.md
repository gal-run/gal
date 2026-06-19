# ADR 0002: GAL Swarm Testing Standard Surface

- **Status:** Accepted
- **Date:** 2026-05-16
- **Decider:** GAL Swarm maintainers
- **Technical Story:** gal-swarm needed a local testing standard so future
  agents can tell what is tested at all times without inferring the answer from
  package scripts, CI, proof docs, and unit-test filenames.

## Context

gal-swarm already has unit tests, consumer smoke, build checks, and proof
scripts. The coverage was real, but the standards docs did not name the
always-on test surface or distinguish dry-run control-plane proof from live
provider capacity.

The canonical prompt-to-binary standard now treats a testing document as part
of the standards surface. gal-swarm needs a local version that maps that rule
to this package's actual behavior.

## Decision

Add `docs/standard/testing.md` as the local GAL Swarm testing standard and add
it to `docs/standard.manifest.json`.

The testing standard defines:

- package checks that are always required
- proof commands and their non-claims
- architecture-mode coverage expectations
- evidence requirements for local and CI verification
- the rule that live provider capacity cannot be inferred from dry-run proof

## Consequences

### Positive

- Future agents can find the required test surface in one document.
- The manifest can be checked by the canonical prompt-to-binary verifier.
- The 300-wave proof and startup-latency proof have explicit scope boundaries.

### Negative

- Changes that weaken or rename checks must update the local standard docs.

### Neutral

- This is documentation and standard metadata. It does not change runtime
  behavior.

## References

- [GAL Swarm Testing Standard](../standard/testing.md)
- [GAL Swarm Requirements](../standard/requirements.md)
- [Prompt-to-Binary Standard Repository](https://github.com/GravitonChips/prompt-to-binary)
