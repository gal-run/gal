# gal-run/gal-code Standard Requirements

## Functional Requirements

- The repository must pin the canonical prompt-to-binary standard in
  `docs/standard.manifest.json`.
- The repository must keep `docs/architecture.md`, `docs/requirements.md`, and
  `docs/adr/` present.
- The repository must not let generated executable artifacts bypass the
  canonical framework verifier.
- Any future generated executable workflow must preserve prompt, model,
  toolchain, OS, and hash provenance.

```ptb.requirement v0
{
  "id": "REQ-standard-adoption-001",
  "intent": "This repository must validate its prompt-to-binary standard adoption before accepting generated executable artifacts.",
  "inputs": [
    {
      "name": "manifest",
      "type": "PromptToBinaryConsumerManifest"
    }
  ],
  "outputs": [
    {
      "name": "result",
      "type": "FrameworkVerificationResult"
    }
  ],
  "constraints": [
    "manifest pins GravitonChips/prompt-to-binary",
    "architecture and requirements docs are present",
    "generated executable artifacts do not bypass framework gates"
  ],
  "verification": [
    {
      "gate": "framework_verify",
      "kind": "schema"
    }
  ]
}
```

## Non-Functional Requirements

- The standard adoption must be readable by humans and machine-checkable by
  future agents.
- The standard pin must be explicit and versioned.
- The repo must remain usable even when the framework is enforced by CI only.

## Acceptance Criteria

- A future agent can tell which standard version this repo follows.
- A future agent can find the repo-local architecture and requirements docs.
- A future agent can verify the repo against the canonical framework without
  reading implementation code first.
