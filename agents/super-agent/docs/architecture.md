# Super-Agent Recursive Bootstrap Architecture

## Purpose

This repository is the separate research home for recursive capability
synthesis. The problem itself is defined in `docs/chicken-and-egg.md`.
The recursive mechanism is defined in `docs/recursive.md`.

The question this repo studies is:

- when the system is blocked because it lacks a capability, can it recurse into
  itself to create that capability safely, verify it, and continue?

## Relationship to `si-bootstrap`

- `si-bootstrap` is the immutable constitution and root of trust.
- `super-agent` is the recursive orchestration layer that operates under that
  constitution.
- `super-agent` may create tools, workflows, or sub-agents to close a gap, but
  it must not alter the constitution, the verifier, or the human sovereignty
  rules.

## Problem Model

The bootstrap problem is a loop:

1. A task is blocked.
2. The block is traced to a missing capability.
3. The system decides whether the capability can be synthesized safely.
4. The system creates the missing capability or reports a hard blocker.
5. The new capability is verified.
6. The blocked task is retried under the new capability.

## System Shape

The architecture is a control loop with these parts:

- intent intake
- capability-gap detection
- recursive planning
- topology routing
- capability synthesis
- verification gate
- retry controller
- audit trail

## Recursion Policy

- Recursion is allowed only when the missing capability is explicit.
- Recursion depth must be bounded.
- Every synthesized capability must be verified before use.
- Every recursion step must have provenance.
- If a safe synthesis path does not exist, the system must stop and surface the
  blocker.

## Non-Goals

- Not a new root of trust
- Not open-ended self-improvement
- Not unconstrained goal rewriting
- Not bypassing human consent
- Not bypassing the verifier

## Implementation Boundary

Implementation details live in `SPEC.md`. This document defines the research
and system boundary that `SPEC.md` must respect.
