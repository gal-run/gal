# Recursive Capability Synthesis

## Purpose

This document defines the mechanism that lets the system use itself to create
the missing capability required to continue a blocked task.

The problem statement lives in `docs/chicken-and-egg.md`.
The control-loop architecture lives in `docs/architecture.md`.

## Recursive Loop

The recursive loop is:

1. Detect that the current task is blocked by a missing capability.
2. Name the missing capability explicitly.
3. Decide whether the capability can be synthesized safely.
4. Generate the missing capability using the capabilities already available.
5. Verify the synthesized capability.
6. Install or activate the new capability.
7. Retry the blocked task with the improved system.

If the capability cannot be synthesized safely, the loop must stop and report
the blocker.

## Binary-First Interpretation

This repo treats recursion as a binary or module upgrade path, not as a
prompt-only trick.

That means the system should be able to produce one of the following artifacts:

- a new CLI command
- a plugin or module
- a workflow adapter
- a verifier helper
- a generated sub-agent runtime
- a signed executable or patched binary

The important rule is that the new artifact becomes part of the system's
capability set only after verification and promotion.

## Recursive Upgrade Pattern

The practical shape is:

```text
CLI vN
  -> detect missing capability
  -> synthesize capability artifact
  -> build / test / verify
  -> sign / publish / install
  -> CLI vN+1
  -> retry blocked task
```

This may happen more than once, but the recursion depth must be bounded.

## Safety Boundaries

Recursive synthesis may create new behavior, but it must not:

- change the `si-bootstrap` constitution
- bypass the verifier
- weaken human sovereignty
- hide provenance
- create unbounded self-modification

## Success Condition

Recursion succeeds only if the system can:

- identify the missing capability
- synthesize the next capability artifact
- verify it
- promote it into the live binary or runtime
- retry the task
- continue without violating the root of trust

## Relationship to the Repo

This document defines the mechanism.

`docs/chicken-and-egg.md` defines the problem.
`docs/architecture.md` defines the system boundary and control loop.
`docs/requirements.md` defines the required behavior and constraints.
