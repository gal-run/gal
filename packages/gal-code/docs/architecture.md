# gal-run/gal-code Architecture

## Purpose

This repository is a consumer of the canonical prompt-to-binary standard for
any generated executable artifact work that may be driven through gal-run/gal-code.

## Boundary

- GAL Code runtime and UI surface for model selection, governance, and generated executable adoption
- the canonical prompt-to-binary framework governs generated executable
  artifacts.
- this repo does not redefine the standard; it pins it through
  `docs/standard.manifest.json`.

## SDK / Framework Split

- The SDK-facing layer is the stable command and configuration interface.
- The framework layer is the verifier and adoption gate that checks repo
  alignment.

## Local Contract

This repo must keep its repo-local docs aligned with the pinned standard and
must not accept generated executable artifacts without the canonical
verification gates.

## Machine Contract

```ptb.arch v0
{
  "id": "ARCH-standard-adoption-001",
  "module": "gal-run/gal-code",
  "kind": "consumer-repository",
  "interfaces": [
    {
      "name": "verify_standard_adoption",
      "input": "PromptToBinaryConsumerManifest",
      "output": "FrameworkVerificationResult"
    }
  ],
  "permissions": {
    "filesystem": "read-only",
    "network": false
  },
  "invariants": [
    "repo_local_docs_follow_pinned_standard",
    "generated_executable_artifacts_require_framework_gates"
  ]
}
```
