# ADR 0001: Adopt the Prompt-to-Binary Standard

## Status

Accepted

## Context

gal-run/gal-code needs a stable, documented boundary for future AI-assisted
executable generation work and for repo-wide standardization.

## Decision

Pin the canonical standard from `GravitonChips/prompt-to-binary` and require
the following local files:

- `docs/architecture.md`
- `docs/requirements.md`
- `docs/adr/`
- `docs/standard.manifest.json`

## Consequences

- the repo follows a shared artifact ladder and verification model
- generated executable work must go through the canonical framework
- future changes to the standard must be recorded as ADRs
