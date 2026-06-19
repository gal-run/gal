# gal kernel — Safe-C Guidelines

The bare kernel is **pure C** by deliberate choice (max embeddability + the seL4/SQLite
high-assurance lineage). C earns that place **only when written with discipline** — these
rules are mandatory. "C done the seL4/SQLite way," not naive C.

## The core invariants (enforced by review + CI)

1. **No heap.** No `malloc`/`free`/`calloc`/`realloc` in the core. All buffers are
   caller-owned with explicit capacities (`reason`/`reason_cap`). The kernel copies
   nothing onto a heap and frees nothing.
2. **No IO / no syscalls.** The core is pure computation. No files, sockets, time, env,
   logging. (Consumers do IO in their shell.)
3. **No untrusted parsing in the core.** The core takes a *typed* `gal_request`
   (bounded `ptr,len` slices). Parsing untrusted bytes (JSON/wire) happens in the
   **shell** (`gal_decide.c` / a consumer) which validates and builds the struct first.
   This is the single most important rule — it moves C's #1 risk class (parsing) out of
   the TCB.
4. **Fail-closed.** Every error path — null args, ABI mismatch, malformed field, "can't
   decide" — yields `GAL_EFFECT_DENY`. `DENY == 0` so a zeroed result is already safe.
5. **Bounded everything.** Every string is `(ptr,len)`; no `strcpy`/`strcat`/`sprintf`/
   `gets`/`scanf`; lengths checked against `GAL_MAX_FIELD`; compare via `memcmp` with
   matched lengths. No unbounded loops over external input.
6. **Small.** The reference-monitor definition requires a core small enough to be
   completely analyzed. Keep it that way; push everything non-essential to the shell.

## Build / CI gates (all must pass)

- `cc -std=c11 -Wall -Wextra -Werror -O2` — zero warnings (see `Makefile`).
- `make test` — unit tests green (fail-closed + ruleset).
- `make asan` — AddressSanitizer + UndefinedBehaviorSanitizer clean.
- `make cppcheck` — static analysis clean (`--error-exitcode=1`).
- Add `clang-tidy` and a **fuzzer on the shell's parse boundary** as the surface grows.

## Roadmap to higher assurance

- Adopt a **MISRA-C** subset checker once the engine stabilizes.
- **Formal verification** of `gal_kernel_eval` (Frama-C / CBMC) — tractable precisely
  because the core is small, allocation-free, and IO-free. This is the seL4-grade ceiling.

## What is NOT in the bare kernel (lives in the shell / consumers)

JSON/wire parsing, the C ABI marshaling (`gal_decide.h` JSON-in/out wrapper), the store,
auth, multi-tenancy, sync, IO, logging. The bare kernel only *decides*.
