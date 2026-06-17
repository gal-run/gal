# Architecture

`gal-model` owns the learned model path for GAL governance decisions.

## Input

The model consumes normalized governance evidence, not raw domain data:

- detection counts;
- scene-safety flags;
- evidence completeness;
- latency/evaluation availability;
- approval-reference completeness;
- operator-review requirements.

Application repos should transform domain evidence into this stable input
shape before calling the model.

## Model

Version `gal-model://governance-decision/v0` is a PyTorch multilayer perceptron
baseline over structured features.

This is intentionally small. The goal is to establish:

- trainable data flow;
- repeatable feature encoding;
- model artifact output;
- inference contract;
- evaluation and model-card discipline.

Future versions can use richer encoders once enough governed traces exist.

## Direction

GAL is expected to be called inline by other models and runtimes as a secondary
governance scorer. That makes low latency, fixed input shape, conservative
outputs, and quantization readiness part of the architecture, not just runtime
concerns.

The current direction is documented in
[`docs/architecture-decision.md`](architecture-decision.md):

- keep the MLP as the v0 baseline;
- evaluate a ResNet-like MLP or small FT-Transformer next;
- treat OpenMythos/recurrent-depth ideas as a research lane;
- keep Taalas-style specialization as a deployment north star.

How applications should call the model is documented in
[`docs/application-integration-architecture.md`](application-integration-architecture.md).

## Output

The model outputs an advisory decision:

- `clear_for_operator_review`
- `hold_for_operator_review`

The output is never a hardware command and never approval for physical action.
