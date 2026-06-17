# Super-Agent Recursive Bootstrap Requirements

## Functional Requirements

- The system must represent blocked work and missing capability as first-class
  state.
- The system must support recursive decomposition of a blocked task into a
  synthesis task.
- The system must support synthesizing a missing tool, adapter, or sub-agent
  when that is the safest path to continue.
- The system must verify every synthesized capability before it is used.
- The system must retry the blocked task after a capability is synthesized.
- The system must expose an explicit no-synthesis path when the gap cannot be
  closed safely.
- The system must preserve the `si-bootstrap` constitution and verifier as the
  root of trust.
- The system must record provenance for each recursion step, including the
  blocked task, synthesized capability, verification result, and retry result.

## Non-Functional Requirements

- Recursion depth must be bounded.
- Decisions must be machine-readable and human-readable.
- The system must remain auditable after the fact.
- The system must not hide self-modification of the constitution or verifier.
- The system must remain interruptible by an authorized human.
- The system must be usable as a research program before any production runtime
  exists.

## Acceptance Criteria

- A future agent can tell when to recurse and when to stop.
- A future agent can identify the missing capability that triggered the loop.
- A future agent can see which synthesized tool or sub-agent closed the gap.
- A future agent can verify that `si-bootstrap` remained the root of trust.
- A future agent can audit the recursion history without reading implementation
  code first.
