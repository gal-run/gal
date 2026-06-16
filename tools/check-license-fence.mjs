#!/usr/bin/env node
// tools/check-license-fence.mjs
//
// License-by-LOCATION fence. Runs always (fence.yml) and fast. Enforces:
//   1. Every `ee/` directory carries its own commercial LICENSE file.
//   2. No source file INSIDE an `ee/` dir carries an Apache-2.0 header.
//   3. No source file OUTSIDE any `ee/` dir imports/links an `ee/` symbol
//      in the OSS build (so published OSS artifacts contain zero commercial
//      code). EXCEPTION: a DEPLOYED app (never published to a registry) that
//      declares `"gal": { "eeFence": "runtime" }` AND `"private": true`
//      enforces the boundary at RUNTIME (license-key gate / isEeEnabled), the
//      Langfuse model — exempt from rule 3 (rules 1 & 2 still apply). docs/EE.md
//
// Exit non-zero on any violation. No external deps (Node stdlib only).
//
// License: Apache-2.0 (this tool is outside any ee/ directory).

import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, sep } from "node:path";

const ROOT = process.cwd();
const SKIP_DIRS = new Set([
  ".git", "node_modules", "dist", ".next", "target", ".turbo", ".changeset",
]);
const SRC_EXT = new Set([
  ".go", ".ts", ".tsx", ".js", ".mjs", ".cjs", ".rs", ".c", ".h",
]);

const violations = [];
const runtimeFencedRoots = [];

function isEeDir(name) {
  return name === "ee";
}

/** Walk the tree, tracking whether we're inside an ee/ subtree. */
function walk(dir, insideEe) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      const nowInsideEe = insideEe || isEeDir(entry);
      if (isEeDir(entry) && !insideEe) checkEeHasLicense(full);
      walk(full, nowInsideEe);
    } else if (st.isFile()) {
      checkFile(full, insideEe);
    }
  }
}

function checkEeHasLicense(eeDir) {
  if (!existsSync(join(eeDir, "LICENSE"))) {
    violations.push(`ee/ dir missing commercial LICENSE: ${rel(eeDir)}`);
  }
}

function checkFile(file, insideEe) {
  const dot = file.lastIndexOf(".");
  const ext = dot >= 0 ? file.slice(dot) : "";
  if (!SRC_EXT.has(ext)) return;
  const text = readFileSync(file, "utf8");

  if (insideEe) {
    // Rule 2: ee/ files must NOT carry an Apache-2.0 license GRANT header.
    // Match the actual grant phrasing / SPDX tag, not a mere mention (ee/
    // headers legitimately say "NOT Apache-2.0").
    if (
      /Licensed under the Apache License/.test(text) ||
      /SPDX-License-Identifier:\s*Apache-2\.0/.test(text) ||
      /License:\s*Apache-2\.0/.test(text)
    ) {
      violations.push(`Apache header inside ee/: ${rel(file)}`);
    }
  } else {
    // The fence tool itself necessarily contains ee/ path patterns in its
    // detection regexes; exempt it from rule 3 (it imports no ee/ symbol).
    if (rel(file) === join("tools", "check-license-fence.mjs")) return;
    // Rule 3: non-ee/ files must not reference an ee/ path in the OSS build.
    //   - JS/TS:  import ... from "...ee..."  /  require("...ee...")
    //   - Go:     import "..../ee"
    //   - Rust:   mod ee / use crate::ee (allowed ONLY when cfg(feature="ee"))
    const importsEe =
      /from\s+["'][^"']*\/ee(\/|["'])/.test(text) ||
      /require\(\s*["'][^"']*\/ee(\/|["'])/.test(text) ||
      /import\s+["'][^"']*\/ee["']/.test(text);
    // Deployed apps (never published) enforce the ee/ boundary at RUNTIME
    // (license-key gate / isEeEnabled), so they may statically link ee/ — the
    // Langfuse model. Published packages stay strict. See docs/EE.md.
    if (importsEe && !isRuntimeFenced(file)) {
      violations.push(`non-ee/ file imports ee/ symbol: ${rel(file)}`);
    }
    // Rust: a bare `mod ee;` / `use ...ee` is only legal behind cfg(feature="ee").
    if (ext === ".rs") {
      const lines = text.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const l = lines[i];
        if (/^\s*(pub\s+)?mod\s+ee\s*;/.test(l) || /use\s+crate::ee/.test(l)) {
          const prev = lines[i - 1] || "";
          const same = l;
          if (!/cfg\(feature\s*=\s*"ee"\)/.test(prev) && !/cfg\(feature\s*=\s*"ee"\)/.test(same)) {
            violations.push(`non-ee/ Rust references ee without cfg(feature="ee"): ${rel(file)}:${i + 1}`);
          }
        }
      }
    }
  }
}

function rel(p) {
  return p.startsWith(ROOT) ? p.slice(ROOT.length + 1) : p;
}

// Collect DEPLOYED-app roots that opt into RUNTIME ee/ enforcement. Such a
// package declares `"gal": { "eeFence": "runtime" }` and MUST be `"private":
// true` (never published — else it would ship commercial code in its artifact).
function collectFenced(dir) {
  let entries;
  try { entries = readdirSync(dir); } catch { return; }
  const pj = join(dir, "package.json");
  if (existsSync(pj)) {
    let obj = null;
    try { obj = JSON.parse(readFileSync(pj, "utf8")); } catch { obj = null; }
    if (obj && obj.gal && obj.gal.eeFence === "runtime") {
      runtimeFencedRoots.push(dir);
      if (obj.private !== true) {
        violations.push(
          `package gal.eeFence="runtime" requires "private": true (a published ` +
          `package must build-drop ee/, not runtime-gate it): ${rel(pj)}`
        );
      }
    }
  }
  for (const entry of entries) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = join(dir, entry);
    let st;
    try { st = statSync(full); } catch { continue; }
    if (st.isDirectory()) collectFenced(full);
  }
}

function isRuntimeFenced(file) {
  for (const r of runtimeFencedRoots) {
    if (file === r || file.startsWith(r + sep)) return true;
  }
  return false;
}

collectFenced(ROOT);
walk(ROOT, false);

if (violations.length > 0) {
  console.error("License fence FAILED:");
  for (const v of violations) console.error("  - " + v);
  process.exit(1);
}
console.log("License fence OK: ee/ isolation intact.");
