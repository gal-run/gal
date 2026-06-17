# Application Integration Architecture

`gal-model` is not meant to become a large application service by itself. It is
the learned governance model package that real GAL applications can call through
a stable contract.

The recommended production architecture is layered:

```text
application event
  -> application evidence adapter
  -> deterministic governance checks
  -> fast GAL sidecar model
  -> optional deep-review model
  -> human/operator review when required
  -> audit log and training feedback
```

## Roles

### Application Repos

Application repos own domain context and raw evidence. Examples include config
proposal diffs, agent execution plans, session summaries, experiment evidence,
or product-specific approval metadata.

Application repos must not push raw private data into `gal-model`. They convert
domain evidence into the normalized feature contract owned here.

### GAL API or Runtime Adapter

The application calls GAL through one of these deployment modes:

- in-process Python package for local/offline evaluation;
- in-process ONNX Runtime sidecar for low-latency production scoring;
- local sidecar service for low-latency internal calls;
- central GAL API for product workflows;
- deep-review endpoint for slower LLM-based escalation.

The API/runtime adapter is responsible for auth, tenant boundaries, audit
logging, retries, and fallbacks. The model package is responsible for the
learned scoring contract.

### Fast Sidecar Model

The fast sidecar is the default inline model. It should be small, fixed-shape,
quantization-ready, and cheap to call from other models or services.

Current target:

```text
normalized governance features -> advisory routing decision
```

The sidecar should be trained from scratch on structured governance features.
It is the right place for the MLP, ResNet-like MLP, or small FT-Transformer
line.

The preferred runtime artifact for application embedding is:

```text
PyTorch checkpoint -> ONNX export -> ONNX Runtime CPU session in process
```

That keeps the hot path independent from the Python training stack and makes it
easier to embed the model in `gal-code` shadow mode.

For current internal dogfood, `gal-code` can also run the sidecar in active
block mode and persist the decision stream to `.gal/code/governance/*.jsonl`.
That ledger is the immediate feedback surface for reviewing mistakes before they
are promoted into human-reviewed training data.

### Deep Review Model

The older Phi-4 + LoRA governance model should be treated as a deep-review lane,
not the default hot path. It can inspect richer text context, produce structured
JSON advisories, and help label or explain ambiguous cases.

Use it when:

- the fast sidecar is uncertain;
- deterministic policy detects a high-risk boundary;
- the application requires richer explanation;
- a human-review packet needs a model-generated summary.

Do not put this model on the inline path for every application call. Cold starts,
GPU serving, and token generation make it a poor default secondary-model guard.

## Hot Path

The hot path should stay predictable:

```text
1. Validate request schema.
2. Run deterministic policy checks.
3. Encode normalized features.
4. Run fast sidecar inference in process through ONNX Runtime.
5. Return advisory decision.
6. Persist audit event.
```

The hot path must not call tools, fetch raw domain data, emit hardware commands,
or approve physical action.

## Escalation Path

Escalation is intentionally slower:

```text
fast sidecar says escalate/hold
  -> gather redacted context packet
  -> call deep-review model
  -> attach advisory rationale
  -> route to human/operator review
```

The deep-review model can help explain or triage. It still does not approve
action by itself.

## Request Contract

The canonical request should be small and stable. The checked-in schema is
[`schemas/inference-request.schema.json`](../schemas/inference-request.schema.json).

```json
{
  "schema_ref": "https://gal.run/schemas/model/inference-request.schema.json",
  "request_id": "req_123",
  "application": "example-application",
  "model_ref": "gal-model://governance-decision/v0",
  "evidence_ref": "gal://evidence/<application>/<id>",
  "features": {
    "people_present": false,
    "vehicles_present": false,
    "obstacles_present": true,
    "evidence_complete": true,
    "operator_review_required": true,
    "latency_measured": true,
    "approval_refs_complete": false,
    "detection_count": 4
  }
}
```

`evidence_ref` points back to the owning application or audit store. It should
not require `gal-model` to store raw evidence.

## Response Contract

The fast model response should be machine-readable. The checked-in schema is
[`schemas/inference-response.schema.json`](../schemas/inference-response.schema.json).

```json
{
  "schema_ref": "https://gal.run/schemas/model/inference-response.schema.json",
  "request_id": "req_123",
  "application": "example-application",
  "evidence_ref": "gal://evidence/<application>/<id>",
  "model_ref": "gal-model://governance-decision/v0",
  "architecture": "mlp",
  "decision": "hold_for_operator_review",
  "confidence": 0.98608,
  "calibration_bucket": "high",
  "escalate_for_deeper_review": true,
  "policy_findings": [],
  "advisory_only": true,
  "physical_action_allowed": false,
  "hardware_commands_issued": false
}
```

Future versions should consider adding `latency_ms`, artifact digest, and a
first-class `escalate_for_deeper_review` decision class if evaluation proves
that a third class is cleaner than the current response flag.

## Real Application Patterns

### Config Approval

```text
config diff + policy scan
  -> normalized risk features
  -> fast sidecar decision
  -> approve-for-human-review / hold / escalate
```

The model does not directly merge config. It advises the workflow.

### Agent Execution

```text
agent plan + permissions + repository class
  -> normalized governance features
  -> fast sidecar decision
  -> allow runner to continue only within approved runtime contract
```

Destructive, externally visible, or privileged actions still need the runtime's
existing approval gates.

### Experiment Governance

```text
experiment evidence summary
  -> repository-owned evidence adapter
  -> normalized GAL features
  -> fast sidecar advisory
  -> operator review packet
```

Raw experiment data, approvals, device identifiers, private media, and domain
fixtures remain in the application repo or evidence store.

## Training Feedback Loop

The production loop should be:

```text
audit events + human decisions
  -> curated training examples
  -> train fast sidecar from scratch
  -> evaluate calibration and latency
  -> shadow deploy
  -> promote only if it beats current thresholds
```

During internal `gal-code` dogfood, the pre-review loop is:

```text
governed tool attempt
  -> sidecar decision ledger
  -> human review on blocked/allowed calls
  -> adapted weak-label dataset
  -> curated reviewed dataset
```

The Phi-4 LoRA lane can be used to help create labels or explanations, but it
should not be the only source of truth. Human outcomes and deterministic policy
results remain important labels.

## Deployment Direction

The fast sidecar should be built for:

- CPU inference first;
- batching when many applications call it;
- quantization;
- fixed feature order;
- artifact metadata validation;
- eventual hardware-specialized deployment if call volume justifies it.

Taalas-style specialization is relevant only after the feature schema, model
graph, and evaluation thresholds are stable.
