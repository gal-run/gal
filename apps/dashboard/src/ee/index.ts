// GAL Enterprise Edition - Commercial License (./LICENSE / LICENSE.ee).
// Copyright 2026 Scheduler Systems Ltd. All rights reserved.
// NOT Apache-2.0. See docs/EE.md. Inert without a valid signed license key.
//
// Commercial dashboard features. The dashboard reads GAL_LICENSE_KEY from
// env/secret and self-disables these when the key is absent or invalid.

export function eeFeaturesEnabled(): boolean {
  return false;
}
