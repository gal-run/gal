// GAL Enterprise Edition - Commercial License (./LICENSE / LICENSE.ee).
// Copyright 2026 Scheduler Systems Ltd. All rights reserved.
// NOT Apache-2.0. See docs/EE.md. Inert without a valid signed license key.
//
// Commercial CLI subcommands. Compiled only with the `ee` feature; the OSS
// crate (cargo build --no-default-features) excludes this module entirely.
// At runtime these read GAL_LICENSE_KEY and self-disable when absent.

pub fn licensed_features_enabled() -> bool {
    false
}
