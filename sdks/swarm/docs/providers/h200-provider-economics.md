# H200 Provider Economics

Last updated: 2026-05-16.

This note records when `gal-swarm` should consider paid 8x NVIDIA H200 capacity.
It is a planning input for `gal-swarm`; concrete provider activation remains
owned by Stratus.

The current production inference path is GAL-mediated DeepSeek access, not
direct DeepSeek API usage from `gal-swarm` and not a self-hosted H200 model
stack. H200 provider economics are therefore only relevant for exceptional
self-hosted inference, infrastructure smoke tests, or burst sandbox capacity
that cannot be satisfied by GAL-managed inference plus existing Stratus runners.

## Current Decision

Use GAL-managed inference as the default model path, with DeepSeek behind GAL
where configured. Do not start paid H200 capacity for normal agent inference
while the GAL inference path is healthy and within policy.

Do not use AWS, Azure, or GCP as the default H200 burst providers.

Use hyperscalers as quota-request, credits, compliance, or fallback paths only.
For rare paid H200 bursts, prefer specialized GPU clouds first:

1. Crusoe, when H200 infrastructure quota is granted.
2. RunPod, when account balance and spend guardrails are ready.
3. AWS, Azure, or GCP only when credits materially offset cost or specialized
   providers cannot satisfy the burst.

The first infrastructure smoke should still use the cheapest already-available
GPU capacity, currently GCP L4/T4 quota, not H200.

## Default AI Path

- Primary inference provider path: GAL-managed inference.
- Current underlying model provider: DeepSeek, routed through GAL.
- Credential ownership: GAL owns provider credentials; `@gal/swarm` must not
  name, read, or pass DeepSeek credentials directly.
- `@gal/swarm` treats DeepSeek as an AI provider option behind GAL, not a
  sandbox provider and not a directly called API.
- Stratus remains the production sandbox provider for governed worker execution.
- RunPod, Crusoe, GCP, AWS, and Azure remain infrastructure candidates for
  capacity planning, not the default model endpoint.

This preserves the AI provider / sandbox provider split:

- GAL owns the inference interface and routes to DeepSeek when selected.
- Stratus owns governed sandbox execution.
- H200 providers are capacity options only when self-hosted GPU work is
  explicitly approved.

## Pricing Snapshot

| Provider | H200 shape | Public on-demand price | Approx. per H200-hour | Approx. 8x H200-hour | Current readiness |
| --- | --- | ---: | ---: | ---: | --- |
| Crusoe | NVIDIA H200 141GB HGX/SXM | USD 4.29/GPU-hour | USD 4.29 | USD 34.32 | Auth ready; infrastructure GPU quota is 0 and needs sales/quota approval. |
| RunPod | H200 SXM / Instant Cluster | about USD 4.31/GPU-hour | about USD 4.31 | about USD 34.48 | Auth ready; balance is about USD 25.47, so only hard spend guardrails remain before a paid burst. |
| AWS | `p5en.48xlarge`, 8x H200 | USD 63.296/hour | USD 7.91 | USD 63.30 | Auth was working, but GPU/accelerator quotas are 0 in checked regions; session may need refresh. |
| Azure | `ND96isr_H200_v5`, 8x H200 | USD 84.80/hour in cheapest checked Linux regions | USD 10.60 | USD 84.80 | Auth ready and providers registered; modern GPU family quotas are 0. |
| GCP | H200 141GB GPU charge | USD 4.575323/GPU-hour in checked Cloud Billing SKUs | USD 4.58 before host/platform cost | about USD 36.60 before host/platform cost | Auth/billing ready for `gal-run`; H200 quota is not available. |

The material point is the ratio:

- Specialized GPU clouds: about USD 34/hour for an 8x H200 node.
- AWS: about 1.8x specialized-provider cost.
- Azure: about 2.5x specialized-provider cost.
- GCP H200 GPU SKUs are close to specialized GPU-cloud GPU pricing, but host,
  platform shape, quota, and provisioning readiness still make it a fallback
  path for now.

## Provider Readiness

### Crusoe

- CLI auth verified with `crusoe whoami`.
- Credentials are stored in GCP Secret Manager:
  - `crusoe-access-key-id`
  - `crusoe-secret-key`
- Console showed infrastructure GPU quota as 0 and instructed contacting sales
  for infrastructure cloud quotas.
- Treat Crusoe as the preferred H200 path once quota is granted.

### RunPod

- CLI auth verified with `runpodctl user`.
- Credential is stored in GCP Secret Manager:
  - `runpod-api-key`
- Stale RunPod secret versions were disabled; version 3 was the verified value
  at the time of this check.
- Account balance was about USD 25.47, with spend limit USD 80.
- Treat RunPod as preferred for H200 after hard spend guardrails.

### AWS

- CLI auth was verified against account `872515284994`.
- H200 on-demand pricing was checked from the public EC2 offer file for
  `p5en.48xlarge`.
- GPU/accelerator quotas were 0 in checked regions.
- AWS remains a fallback or quota-request path, not the default H200 provider.

### Azure

- CLI auth verified for subscription `Azure subscription 1`
  (`0bc2daf3-74f4-4811-98b0-939d70003321`).
- Core providers registered:
  - `Microsoft.Compute`
  - `Microsoft.Network`
  - `Microsoft.Insights`
  - `Microsoft.ManagedIdentity`
- Azure Retail Prices API showed the cheapest Linux `ND96isr_H200_v5` entries at
  USD 84.80/hour.
- Modern GPU quotas, including T4/A100/H100/H200 families, were 0 in checked
  regions.
- Azure AI credits should be used for model/API smoke, not raw H200 VM bursts.

### GCP

- `gal-run` billing and Compute/Monitoring APIs are enabled.
- Current useful smoke quota is 1x L4/T4 in several regions.
- H200 quota is not currently available.
- GCP remains the best first GPU infrastructure smoke path with L4, but not the
  default H200 path.
- The chosen first preflight is GCP L4 Spot in `us-east4-a`: about USD
  0.282/hour for `g2-standard-4` plus 1x L4, about USD 0.07 for a 15 minute
  capped run.

### NVIDIA / NGC

- No local `ngc` CLI or `nvidia-ngc-api-key` Secret Manager entry existed at
  this check.
- NVIDIA/NGC is a registry/model/API access path, not a cloud capacity provider
  by itself.
- Add an NGC API key before using NIM images or `nvcr.io` assets in provider
  pods.

## Operational Policy

Before any H200 burst:

1. Confirm the work cannot be handled through the GAL-managed inference path.
2. Run prediction readiness and model-fit gates.
3. Confirm provider credentials from Secret Manager.
4. Confirm live provider quota and availability.
5. Confirm the selected provider's current hourly price.
6. Confirm hard spend cap, max duration, drain, and shutdown policies.
7. Prefer Crusoe or RunPod for paid H200 unless a hyperscaler credit changes the
   effective price.
8. Do not start H200 when the work can be proven through GAL-managed inference
   or on GCP L4/T4 smoke capacity.

## Source Notes

- Azure pricing was checked through Azure Retail Prices API for
  `Standard_ND96isr_H200_v5`.
- AWS pricing was checked through the public EC2 offer file for
  `p5en.48xlarge`.
- RunPod pricing was checked from the RunPod H200/pricing surface and CLI
  availability.
- Crusoe pricing was checked from Crusoe Cloud pricing/support pages.
- GCP H200 pricing was rechecked through Cloud Billing SKUs after GCP auth
  refresh; the quoted value is GPU charge only and excludes host/platform cost.
