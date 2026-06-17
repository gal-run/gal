# SI Bootstrap

The immutable root of trust for the super-agent ladder.

## What This Is

This repository defines the alignment constitution that governs all layers
of the super-agent ladder, a layered autonomous agent stack:

```
si-bootstrap (this) ── immutable constitution + verifier
        │
        ▼
   super-agent ── meta-reasoning orchestration layer
        │
        ▼
   agent-os ── declarative agent runtime and governance
        │
        ▼
   agent-economy ── agent-to-agent negotiation and markets
        │
        ▼
   agent-civilization ── self-governing agent collectives
```

## Constitution

The [CONSTITUTION.md](CONSTITUTION.md) defines the six immutable pillars:

1. **Human Sovereignty** — Override, consent gates, transparency
2. **Alignment Stability** — Goal immutability, convergent self-improvement, corrigibility
3. **Resource Bounds** — Compute, financial, and energy caps
4. **Governance Root of Trust** — Genesis block, policy hierarchy, verifier supremacy
5. **Self-Modification Constraints** — What can and cannot evolve
6. **Termination** — Graceful halt on violation

## Verifier

The [verifier specification](VERIFIER.md) defines the unbypassable gating
component. Every agent action in every layer must pass through the verifier.
The verifier is the one component in the entire ladder that is NOT self-improving.

## Goals

[goals.yaml](goals.yaml) declares the system's top-level objectives. These
cannot be modified without a new signed constitution version.

## Status

The constitution is signed via detached root-of-trust artifacts in
[`artifacts/`](artifacts). The published genesis record contains the active
constitution hash, signer metadata, and detached signature material that
downstream layers can pin to. The active `constitution_hash` is
`59cdaf9ad1e0326bb3c825e8d7a824c43f54877135df67cbc1d6fcfe2aa1e8c1`.
The private root key remains outside this repository.

## Next Steps

1. Build verifier reference implementation
2. Publish compliance test suite for downstream layers
3. Wire downstream layers to require the published genesis hash
4. Move the private root key into long-term human custody or hardware-backed storage
