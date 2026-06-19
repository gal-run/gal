# GAL Merge Rules

This document defines the reference merge behavior for combining:

- workspace scope from `~/.gal/config.yaml`
- project scope from `<repo>/.gal/config.yaml`

The effective config is what GAL should use to generate native agent files.

## Precedence

Project scope wins over workspace scope.

```text
project scope > workspace scope > generated native files
```

Important:

- project scope does not silently mutate workspace scope
- omission is not deletion
- explicit masking is required for inherited entries

## Merge Behavior By Type

### Instructions

- if only workspace instructions exist, use them
- if only project instructions exist, use them
- if project `strategy` is `replace`, project instructions replace workspace instructions
- if project `strategy` is `append`, concatenate workspace content and project content with a blank line between them

### Commands, agents, rules, hooks, MCP servers

These are merged by key.

- union keys from both scopes
- if the same key exists in both, project wins
- if the winning entry has `disabled: true`, omit it from the effective config

### Settings

Settings are deep-merged as plain objects.

- nested project values override workspace values
- object subtrees are merged recursively
- arrays are replaced by the project value

### Domain policy

Reference behavior:

- no project policy: use workspace policy
- project `mode: union`: union workspace and project `allow`
- project `mode: narrow`: intersect workspace and project `allow`

If there is no workspace allowlist, `narrow` behaves like project-only allow.

## Explicit Masking

Project config should use `disabled: true` to mask inherited named entries.

Example:

```yaml
platforms:
  common:
    commands:
      test:
        disabled: true
```

This removes `test` from the effective config even if it exists in workspace scope.

## Reference Implementation

The public repo includes a dependency-free reference resolver:

- [apps/console/reference/resolve-config.mjs](../apps/console/reference/resolve-config.mjs)

And node built-in tests:

- [apps/console/reference/resolve-config.test.mjs](../apps/console/reference/resolve-config.test.mjs)
