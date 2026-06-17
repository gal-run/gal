# Repository Instructions

Scope: this file applies to the whole `gal-model` repository.

This repository is for the GAL deep-learning governance model. Keep work focused
on model architecture, datasets, training, evaluation, model cards, inference
adapters, and advisory governance outputs.

Do not add application-specific experiment data here. Domain experiments should
reference the GAL model by URI through their own integration configuration.

Do not add model definitions, datasets, prompts, docs, or tests that enable
weapons, payload delivery for harm, targeting, engagement, pursuit, evasion,
coercive surveillance, or operational harm.

Model outputs must remain advisory unless a separate approved runtime contract
allows stronger behavior. The initial model can recommend operator review, but
it must not approve physical action or command hardware.

Before committing, run:

```bash
make validate
```
