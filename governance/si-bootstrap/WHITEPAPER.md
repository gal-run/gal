# Whitepaper Outline: A Signed Root of Trust for Layered Autonomous Agent Systems

> Status: OUTLINE. This document frames the problem and the proposed approach,
> and is explicit about what is *proven* in this repository versus what is
> *open / not yet empirically demonstrated*.

## 1. Problem

As autonomous agent systems gain the ability to dispatch sub-agents, transact,
and modify their own code, two failure modes become safety-critical:

1. **Goal drift** — a self-improving layer optimizes against the constraints it
   was launched under (resists shutdown, hides activity, edits its own
   objectives).
2. **Authority forgery** — an agent claims authority it was never granted, or a
   policy at a lower layer silently contradicts a higher-layer constraint.

A layered agent stack (meta-reasoning orchestration -> declarative runtime ->
agent-to-agent markets -> self-governing collectives) multiplies both risks:
each higher layer can amplify a violation introduced below it. The question this
work addresses: **what is the minimal, immutable, cryptographically anchored
component that every layer must derive authority from, and that no layer can
modify, disable, or optimize around?**

## 2. Approach

This repository defines three artifacts and one design:

- **A constitution** (`CONSTITUTION.md`) — six immutable pillars (human
  sovereignty, alignment stability, resource bounds, governance root of trust,
  self-modification constraints, termination). It is the single source of
  authority. It changes only via a new signed version that hash-chains to the
  prior one.
- **A goals manifest** (`goals.yaml`) — top-level objectives expressed as
  measurable metrics, declared immutable, modifiable only with a new signed
  constitution version.
- **A signed root of trust** (`artifacts/`) — a detached ed25519 signature over
  the constitution, the signer's public key, and a `genesis.json` record
  pinning the canonical `constitution_hash`. Downstream layers pin this hash and
  reject proof chains anchored to any other value. The private root key is held
  outside the repository.
- **A verifier design** (`VERIFIER.md`) — an unbypassable gating component that
  runs at a privilege level above all agents. Every agent action is checked
  against (1) a proof chain to the genesis block, (2) layer policy lineage,
  (3) resource caps, and (4) consent gates for destructive actions. The verifier
  is the one component that is explicitly *not* self-improving.

The trust model: authority flows from a human-held key, through a signed
constitution hash, down a declared policy lineage, and is enforced at runtime by
a component agents cannot rewrite.

## 3. What Is Proven (in this repository)

- The constitution can be deterministically hashed and signed, and the signature
  + hash can be independently verified offline with stock `openssl` and
  `shasum` (`scripts/verify-root-of-trust.sh` reproduces the published
  `genesis.json`).
- The published artifacts are self-consistent: the public key, signature, and
  pinned `constitution_hash` verify against the committed `CONSTITUTION.md`.
- The governance design (immutability, lineage, verifier supremacy, consent
  gates) is fully specified and internally consistent.

## 4. What Is Open / Not Yet Demonstrated

- **No reference verifier implementation.** `VERIFIER.md` specifies a gRPC
  interface and constraints (Rust, single static binary, constitution compiled
  in, append-only logging, reproducible build) but no implementation ships here.
- **No compliance test suite** for downstream layers to prove lineage.
- **No proof of "convergent self-improvement"** (pillar 2.2). The requirement
  that a modified agent provably converges to the same-or-stricter alignment
  envelope is stated as a goal; the formal/statistical machinery to discharge it
  is unbuilt and is the hardest open research problem here.
- **No empirical evaluation** of the verifier under adversarial agents (forged
  proof chains, resource-cap evasion, consent-gate bypass attempts).
- **Key custody** is described as a next step, not yet realized in
  hardware-backed / split-custody form.

## 5. Roadmap

1. Build the verifier reference implementation against the specified gRPC
   interface.
2. Publish a compliance test suite that downstream layers run to prove lineage
   to the genesis hash.
3. Adversarially evaluate the verifier (red-team proof chains, caps, consent).
4. Formalize the convergent-self-improvement proof obligation.
5. Move the private root key into long-term human custody / hardware-backed
   storage.
