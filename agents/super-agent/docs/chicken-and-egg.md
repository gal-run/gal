# Chicken-and-Egg Problem

## Problem Statement

The chicken-and-egg problem in recursive AI bootstrap is the blockage that
appears when a system cannot do an action because it lacks the tool, workflow,
or capability required to perform that action.

The system is stuck because:

- it needs a capability to complete the task
- it does not yet have that capability
- it cannot safely skip the missing step
- the missing capability may itself need to be created by the same system

This is the bootstrap loop:

1. A task is blocked.
2. The blocker is traced to a missing capability.
3. The system decides whether it can safely create that capability.
4. The system uses what it already has to create the missing capability.
5. The new capability is verified.
6. The blocked task retries.

## Why It Matters

This problem shows up whenever the system reaches a boundary it cannot cross
with its current toolset.

Examples:

- the system can reason about code but lacks a browser automation tool
- the system can plan a change but lacks a verifier
- the system can generate a workflow but lacks the scaffolding needed to add it
- the system can explain a missing capability but cannot yet create it directly

Without recursion, the system stops at the missing capability.
With recursion, the system may be able to create the missing capability and
continue, but only if the synthesis path is safe and verifiable.

## Core Constraint

The missing capability cannot be treated as a free pass to rewrite the trust
boundary.

The system may create:

- tools
- adapters
- workflows
- sub-agents
- verification helpers

The system may not create, bypass, or weaken:

- the root of trust
- the verifier
- human sovereignty
- the requirement for provenance

## Success Condition

The problem is solved only when the system can:

- identify the missing capability explicitly
- synthesize it safely using the existing system
- verify the synthesized capability
- retry the blocked task
- stop cleanly if no safe synthesis path exists

## Relationship to This Repo

This document defines the problem.

`docs/recursive.md` defines the mechanism that solves it.
`docs/architecture.md` defines the control loop that handles it.
`docs/requirements.md` defines the requirements that the control loop must meet.
`SPEC.md` defines the implementation details for the current bootstrap slice.
