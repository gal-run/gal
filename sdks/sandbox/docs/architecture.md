# Architecture

Secure agent execution has two enforcement planes that should be owned
deliberately and validated as contracts, not just described in prose:

- **Agent enforcement** — what the agent is allowed to do, which tools and
  settings it receives, how repo access is hydrated, and how audit events are
  emitted.
- **OS enforcement** — the kernel, container, filesystem, service-account, and
  network controls that constrain the process even if the agent misbehaves.

A cluster lifecycle service can launch an isolated pod, but it should not become
the owner of runtime policy: mixing infrastructure scheduling with agent trust
makes the boundary harder to audit. This library captures the runtime-side
contract independently of any specific launcher.

## Boundary model

```text
control plane
  validates session and authorization
  calls a lifecycle API

lifecycle service (your infra)
  creates an isolated Kata-backed pod
  applies the OS controls from this contract
  reports lifecycle status

runtime (your image)
  hydrates the workspace under /workspace
  applies agent policy
  resolves its session channel from the narrow startup env
  emits audit-ready lifecycle events
```

## Required isolation

- Runtime namespace must be explicit and isolated (never `default`).
- Runtime class must be Kata-backed.
- Service-account token automount must be disabled for agent pods.
- Agent container must run as non-root.
- Root filesystem must be read-only.
- Linux capabilities must drop `ALL`.
- Writable paths must be explicit.
- Network policy must be default-deny with allowlisted egress.
- Provider credentials must not be inherited from the cluster or dispatcher.

## Denied paths

The default denylist treats CI runners (e.g. GitHub Actions) and warm-pool /
preheated caches as invalid execution boundaries. Extend the denylist for your
own environment via the validator options; the OS-level controls above are
enforced for every plan regardless.
