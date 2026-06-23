#!/usr/bin/env node
// T5 guard: fail if an in-development feature is reachable without the flag.
//
// "claims derive from the flag" (FEATURES.md): every CLI command marked
// `#[command(hide = true)] // in-development: gated behind GAL_DEVELOPMENT` MUST
// also be (a) hidden from `--help` and (b) dispatch-guarded by `development_enabled()`
// with a reject arm — so it is neither advertised nor callable by default. This
// static check catches the regression where someone marks a command in-development
// (or adds one) but forgets to gate its dispatch, leaving it reachable un-flagged.
//
// Self-skips when the development-gate mechanism isn't present in the tree yet
// (e.g. before the CLI gate lands), so it is safe to ship ahead of the gate.

import { readFileSync } from "node:fs";

const MAIN = "cli/src/main.rs";
const MARKER = "in-development: gated behind GAL_DEVELOPMENT";

let src;
try {
  src = readFileSync(MAIN, "utf8");
} catch {
  console.log(`check-development-gate: skipped — ${MAIN} not found`);
  process.exit(0);
}

if (!src.includes("fn development_enabled()")) {
  console.log("check-development-gate: skipped — development gate mechanism not present yet");
  process.exit(0);
}

const lines = src.split("\n");
const devCommands = [];
for (let i = 0; i < lines.length; i++) {
  if (!lines[i].includes(MARKER)) continue;
  const m = (lines[i + 1] || "").match(/^\s*([A-Z][A-Za-z0-9]*)\s*\(/);
  if (m) devCommands.push(m[1]);
}

if (devCommands.length === 0) {
  console.error(
    "check-development-gate: FAIL — gate mechanism present but 0 commands carry the " +
      `\`${MARKER}\` marker (was a gated command silently un-marked?)`,
  );
  process.exit(1);
}

const errors = [];
for (const cmd of devCommands) {
  const guarded = new RegExp(`Commands::${cmd}\\(args\\)\\s+if\\s+development_enabled\\(\\)`).test(src);
  const rejected = new RegExp(`Commands::${cmd}\\(_\\)\\s*=>\\s*Err\\(development_disabled\\(`).test(src);
  if (!guarded) errors.push(`${cmd}: REACHABLE UN-FLAGGED — missing \`if development_enabled()\` dispatch guard`);
  if (!rejected) errors.push(`${cmd}: missing \`Commands::${cmd}(_) => Err(development_disabled(...))\` reject arm`);
}

if (errors.length) {
  console.error("check-development-gate: FAIL — in-development feature(s) not gated:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}

console.log(`check-development-gate: OK — ${devCommands.length} in-development command(s) gated (${devCommands.join(", ")})`);
