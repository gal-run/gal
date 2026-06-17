# Managed Per-Org Fine-Tuning Cloud — Architecture (Design)

Status: design / RFC. This document describes the architecture for an optional
managed service that fine-tunes the open-source GAL governance model to each
customer organization's review culture. The open-source model, training code,
and evaluation harness in this repository run standalone with no dependency on
this service. The managed cloud is a separate, hosted, commercial offering.

## 1. Goals

- Let each organization adapt the base GAL model to its own governance norms
  (review posture, risk tolerance, escalation thresholds) without sharing data
  with any other organization.
- Keep per-org data tenant-isolated end to end (storage, training, serving).
- Allow the base model to improve over time from **aggregate, privacy-preserving**
  signal across organizations — never raw cross-org data.
- Honor data-residency obligations (region pinning, deletion, export).
- Preserve the safety boundary: outputs remain advisory; no per-org adapter may
  unlock physical-action approval or hardware control (see `AGENTS.md`,
  `model_cards/`).

## 2. Tenancy and isolation model

Isolation is enforced at every layer, defense in depth:

| Layer | Isolation mechanism |
|---|---|
| Identity | Per-org tenant id minted at onboarding; all requests carry a verified tenant claim. No request is processed without it. |
| Storage | Per-tenant object-store prefix + per-tenant encryption key (envelope encryption, KMS-managed, customer-key option for enterprise). No shared buckets across tenants. |
| Training | Each fine-tune job runs in a single-tenant worker (ephemeral, network-egress-restricted) that can read exactly one tenant's data prefix and one tenant's key. |
| Adapters | Each org's fine-tuned weights stored under its own prefix/key; never co-located with another org's adapter at rest. |
| Serving | Adapter selected by verified tenant claim at request time; base weights shared read-only, adapters loaded per-tenant. |
| Audit | Every data read, train job, adapter publish, and inference is logged to a per-tenant, append-only audit trail. |

The base model weights are the only artifact shared across tenants, and they are
read-only at serving time. Nothing tenant-derived flows laterally between tenants
except through the explicitly designed, privacy-preserving aggregation path
(Section 4).

## 3. Per-org adaptation: LoRA / adapters (not full fine-tunes)

The base GAL model is small (an MLP over structured governance features, plus an
optional text-embedding head). Per-org adaptation uses **parameter-efficient
adapters** rather than full fine-tunes:

- **Why adapters:** cheap to train, cheap to store (kilobytes–megabytes per org),
  trivially hot-swappable per request, and they keep the shared base frozen so
  one org's adaptation cannot corrupt another's.
- **What is adapted:** calibration of decision thresholds and feature weighting
  to the org's review culture; for the text head, low-rank LoRA adapters over the
  embedding-conditioned layers.
- **Training input:** the org's own governance signal — its `gal-api` session
  exports, its reviewed PR/decision ledger, and its annotation corrections —
  passed through the same curation pipeline in this repo (dedup → quality filter →
  weak-label aggregation), run inside the tenant-isolated worker.
- **Lifecycle:** adapters are versioned; each version pins (base-model-version,
  curation-config, training-data-snapshot-hash) for full reproducibility and
  rollback. A new adapter is promoted only after passing the org's eval slice
  plus the global safety/regression gates.

Conceptual serving:

```
decision = base_model(features)            # shared, frozen
          ⊕ org_adapter[tenant](features)  # per-tenant, hot-loaded
```

## 4. Cross-org aggregation feedback (privacy-preserving)

Goal: improve the **base** model from collective experience without any org's
data leaking to another. Raw per-org data never leaves its tenant boundary.
Only aggregated, minimized signal is eligible to influence the shared base.

Candidate mechanisms (defense in depth; not all required at launch):

- **Federated / aggregate-only updates.** Tenant workers compute model-update
  contributions locally; a secure aggregator combines contributions across many
  orgs and only the aggregate is applied to the base. Individual contributions
  are never persisted in the clear.
- **Differential privacy.** Per-contribution clipping + calibrated noise on the
  aggregate, with a tracked global privacy budget, so no single org's data is
  reconstructable from base-model changes.
- **k-anonymity threshold.** A signal is eligible to inform the base only if it
  is corroborated by at least `k` independent orgs; never below threshold.
- **Schema-level signal only.** Aggregation operates over derived, structured
  governance features and label-correction patterns — never raw diffs, code,
  PR bodies, or identities.
- **Opt-in.** Contribution to base improvement is an explicit per-org setting,
  off by default; enterprise tenants may run fully isolated with zero
  contribution.

All base-model updates pass the same safety + regression gates (`make`-driven
benchmark and eval harness in this repo) before promotion, with provenance
recorded.

## 5. Data residency

- **Region pinning.** Each tenant is pinned to a region/data boundary at
  onboarding; storage, training workers, and serving for that tenant stay within
  it. Cross-region replication only with explicit configuration.
- **Right to deletion / export.** Per-tenant deletion removes the org's data,
  adapters, and derived snapshots; export produces the org's data and its trained
  adapters in a portable form.
- **Residency vs. aggregation.** The aggregation path (Section 4) is designed so
  that residency-restricted tenants can still contribute only via in-region
  aggregation, or be excluded entirely, without raw data crossing a boundary.
- **Key custody.** Enterprise tenants may supply their own KMS key (BYOK);
  revoking it renders that tenant's data and adapters cryptographically
  inaccessible.

## 6. Boundaries and safety

- This managed service is **out of scope** for the open-source repository. The
  OSS model, training, and eval code do not call it and do not require it.
- The advisory-only safety boundary is invariant: no per-org adapter or
  aggregation result may enable physical-action approval, hardware/command
  control, targeting, or any prohibited use named in `AGENTS.md` and the model
  card. Safety gates are evaluated on every adapter and every base update.
- Tenant data, keys, ledgers, and infrastructure identifiers for the hosted
  service live in the cloud control plane, not in this repository.
