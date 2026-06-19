# SI Bootstrap Verifier

The verifier is the only non-self-improving component in the system. It
runs at a privilege level above all agents. Every agent action must pass
through the verifier before execution.

## Design

```
Agent Action
    │
    ▼
┌──────────────┐
│   Verifier   │  ← Unbypassable. Immutable. Above all agents.
│              │
│ 1. Check     │  Action hash → constitution proof chain valid?
│ 2. Policy    │  Action type → allowed by layer policies?
│ 3. Bounds    │  Resource impact → within caps?
│ 4. Consent   │  Destructive? → human approval obtained?
│              │
└──────┬───────┘
       │
   ALLOW │ DENY
       ▼
   Execution
```

## Interfaces

The verifier exposes a single gRPC endpoint:

```
service ConstitutionVerifier {
  rpc Verify(VerifyRequest) returns (VerifyResponse);
}

message VerifyRequest {
  string agent_id = 1;
  string action_type = 2;   // tool_call, dispatch, contract, self_modify
  bytes action_payload = 3;
  string proof_chain = 4;   // hash chain to genesis block
  int64 resource_impact_compute = 5;  // estimated compute units
  int64 resource_impact_financial = 6; // estimated cost cents
  string policy_layer = 7;  // super-agent, agent-os, economy, civilization
}

message VerifyResponse {
  enum Verdict {
    ALLOW = 0;
    DENY = 1;
    REQUIRE_CONSENT = 2;  // human must approve
  }
  Verdict verdict = 1;
  string reason = 2;
  string consent_token = 3;  // if REQUIRE_CONSENT
}
```

## Implementation Constraints

1. Written in Rust (memory safety, formal verification tooling)
2. Single binary, statically linked
3. No network access except to the agent it verifies (air-gapped from internet)
4. Constitution is compiled into the binary — no runtime config loading
5. All decisions are logged to append-only storage
6. Binary is reproducible-build signed

## Active Genesis

The current root-of-trust artifacts are published under [`artifacts/`](artifacts):

- `artifacts/genesis.json` — canonical genesis record with constitution SHA-256
- `artifacts/root.pub.pem` — detached root public key
- `artifacts/constitution.sig.base64` — detached signature over `CONSTITUTION.md`
- Active `constitution_hash` — `59cdaf9ad1e0326bb3c825e8d7a824c43f54877135df67cbc1d6fcfe2aa1e8c1`
- Active `public_key_sha256` — `8a020f4927235fdde58914e3cb7e1f51e1baa57e4add7a02d378c22826c732e4`

Downstream layers should pin
`59cdaf9ad1e0326bb3c825e8d7a824c43f54877135df67cbc1d6fcfe2aa1e8c1`
and reject proof chains anchored to any other value.
