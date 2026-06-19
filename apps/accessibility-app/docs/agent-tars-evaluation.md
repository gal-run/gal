# Agent TARS Evaluation

This note records the first local evaluation of ByteDance Agent TARS as a possible
GAL computer-use backend.

Upstream: https://github.com/bytedance/UI-TARS-desktop#agent-tars

Tracking issue: the project issue tracker

## Position

Agent TARS should not replace the GAL computer-use MCP surface yet. It is better
treated as an alternate GUI-agent runtime candidate that must sit behind the GAL
computer-use or agent-network boundary.

The reason is practical: the local smoke proved the CLI and Web UI can run, but
it did not prove a full tool-enabled computer-use workflow with the providers
currently configured on this machine.

## Local Environment

- Date: 2026-05-12
- Workspace: `<local workspace>`
- Package: `@agent-tars/cli@0.3.0`
- Runtime: Node `v25.8.1`, npm `11.11.0`

Version check:

```bash
npx -y @agent-tars/cli@latest --version
```

Observed:

```text
agent-tars/0.3.0 darwin-arm64 node-v25.8.1
```

## What Worked

Direct/no-tool Gemini calls worked:

```bash
npx -y @agent-tars/cli@latest request \
  --provider gemini \
  --model gemini-2.5-flash \
  --body '{"messages":[{"role":"user","content":"Reply with exactly agent-tars-gemini-ok."}],"max_tokens":128}'
```

The Agent TARS Web UI also ran when tools were intentionally disabled:

```bash
npx -y @agent-tars/cli@latest \
  --port 8890 \
  --model.provider gemini \
  --model.id gemini-2.5-flash \
  --tool.include __no_such_tool__ \
  --mcpServer.include __no_such_mcp__ \
  --workspace .tmp/agent-tars-workspace-gemini-notools \
  --quiet
```

Browser-level smoke against `http://127.0.0.1:8890/` completed with the prompt:

```text
Reply with exactly agent-tars-ui-notools-ok. Do not use tools.
```

Observed response:

```text
agent-tars-ui-notools-ok
```

## What Failed

Tool-enabled Gemini failed before task execution. Agent TARS emitted tool
schemas with JSON Schema fields that the Gemini API rejected, including
`$schema` and `additionalProperties`.

The local Anthropic-compatible path produced the expected assistant text once,
then failed because Agent TARS tried to execute a malformed empty tool call:

```text
Tool "" not found
SyntaxError: Unexpected end of JSON input
```

Direct Anthropic was not proven on this machine. The official Anthropic path
returned `401` with the currently configured local credentials.

Agent TARS also warned that hybrid/visual-grounding browser control is limited
to Doubao 1.5 VL, and it falls back to DOM mode for Gemini/Anthropic.

## Boundary Recommendation

Keep the current GAL computer-use interface as the stable integration surface.
Agent TARS can be evaluated as one possible implementation behind that surface,
but should not become a direct dependency of GAL core.

The adapter boundary should preserve:

- deterministic command/API entrypoints,
- structured tool-call and tool-result events,
- explicit workspace and filesystem scope,
- screenshot and accessibility permission controls,
- credential isolation,
- compatibility with GAL session records.

## Promotion Gate

Agent TARS can move from spike to implementation only after it passes all of the
following:

- A tool-enabled provider setup runs without schema or malformed tool-call
  failures.
- A headless command drives a browser/computer workflow end to end.
- The workflow uses a controlled GAL target, not only a plain text prompt.
- The emitted events can map into GAL session and tool-call records.
- The security model is documented for accessibility permissions, screenshots,
  filesystem scope, credentials, and network access.
- The integration remains behind `gal-accessibility-app` or `agent-network` instead
  of embedding Agent TARS directly into GAL core.

## First Real Proof

The first useful proof should be a low-risk browser task:

1. Open a local or staging GAL page.
2. Inspect visible UI state.
3. Perform one non-destructive interaction.
4. Emit an event trace that GAL can store or replay.

That proof is the point where Agent TARS becomes a credible alternate backend
for GAL computer-use work. Until then it is a benchmark and compatibility spike.
