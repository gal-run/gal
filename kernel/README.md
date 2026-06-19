# gal

**gal kernel source tree** — the governance reference monitor for agentic systems.

> `decide(agent, capability, scope, action) → { effect, reason, obligations }`

A minimal, tamper-proof, verifiable decision core in **C**, designed to be embedded at the
lowest chokepoint of every layer — agents, frameworks, CLIs, the OS, GPUs. A kernel, never an OS.

## Why a kernel

A reference monitor must be small enough to be completely understood, always invoked, and
impossible for the thing it governs to bypass. gal's bare core is pure computation:

- **no heap, no I/O, no untrusted parsing** in the core — the surrounding shell parses input and
  hands the core a typed request;
- **fail-closed** — any error yields `deny`;
- **default-deny** — only an explicit grant permits an action.

This is the seL4/SQLite discipline applied to governance (see `KERNEL-C-GUIDELINES.md`).

## Layout

```
include/gal_kernel.h     bare core API — typed request in, verdict out (no parsing)
include/gal_decide.h     consumer ABI — JSON in, JSON out (implemented by the shell)
src/gal_kernel.c         the decision core (no heap / no I/O / fail-closed)
src/gal_decide.c         the shell — parses untrusted JSON, calls the core, serializes
schemas/                 gal/v1 wire schemas (DecisionRequest / DecisionResult)
test/                    unit tests
KERNEL-C-GUIDELINES.md   the safe-C discipline (mandatory for contributions)
```

## The contract

A policy enforcement point (PEP) intercepts an action at its layer, asks the kernel one question,
and enforces the verdict:

```
DecisionRequest   { agent, capability: "verb:noun", scope, action?, context? }
DecisionResult    { allowed, action: allowed | denied | audit | human_required, reason, obligations? }
```

The same kernel can be embedded in-process (via the C ABI), run as a local sidecar, or called
remotely — the contract is identical in all three.

## Build

```bash
make test       # build (-Werror) + run unit tests
make asan       # AddressSanitizer + UndefinedBehaviorSanitizer
make cppcheck   # static analysis
```

## Hosting

gal is open source — run it yourself. A managed, hosted option is also available for teams who
would rather not operate it themselves.

## License

Apache-2.0. See `LICENSE` and `NOTICE`. If you build on gal, attribution is appreciated.
