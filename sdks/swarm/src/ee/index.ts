// GAL Enterprise Edition - Commercial License (./LICENSE / LICENSE.ee).
// Copyright 2026 Scheduler Systems Ltd. All rights reserved.
// NOT Apache-2.0. See docs/EE.md. Inert without a valid signed license key.
//
// Commercial swarm capabilities. Excluded from OSS builds: the package's
// "files" field drops dist/**/ee/**, so the published @gal-run/swarm tarball
// contains zero commercial code. No non-ee/ source imports this module in the
// OSS build (enforced by fence.yml).

export function advancedSwarmEnabled(): boolean {
  // Wired to the kernel license capability check at runtime; inert by default.
  return false;
}
