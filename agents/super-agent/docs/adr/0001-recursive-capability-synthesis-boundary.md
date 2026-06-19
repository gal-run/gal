# ADR 0001: Separate Recursive Capability Synthesis From Root-of-Trust Governance

## Status

Accepted

## Context

The `si-bootstrap` repository already defines the immutable constitution,
verifier, and alignment rules for the super-agent ladder. The recursive
bootstrap problem is a different concern: how the system should use itself to
create the missing capability needed to continue a blocked task.

Mixing those concerns into one repository would blur the distinction between:

- immutable governance
- recursive orchestration
- capability synthesis

## Decision

Keep `si-bootstrap` as the root-of-trust repository and use `super-agent` as
the separate research home for recursive capability synthesis and meta-
reasoning.

`super-agent` may create tools, adapters, workflows, or sub-agents to close a
gap, but it must do so under the `si-bootstrap` constitution and verifier.

## Consequences

- the recursion problem has its own boundary and terminology
- the constitution remains separate from the orchestration research
- future implementation work can evolve without redefining the root of trust
- repository docs can describe the bootstrap loop without collapsing it into the
  governance layer
