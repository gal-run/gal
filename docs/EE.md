# Enterprise Edition (ee/) — License-by-Location + License-Key Gate

gal is open core. This document is the authoritative convention for what is
Apache-2.0 vs commercial, and how commercial code stays inert without a key.

## License by LOCATION

There is no top-level `ee/` directory. Instead, each component co-locates its
commercial code in a **per-component `ee/` directory** next to the code it
gates:

- `services/governance/ee/`
- `sdks/swarm/src/ee/`
- `cli/src/ee/`
- `apps/dashboard/src/ee/`

The rule is purely positional:

- **Outside any `ee/` directory** → Apache-2.0 (root `LICENSE`).
- **Inside any `ee/` directory** → commercial (`LICENSE.ee`). Each `ee/` dir
  carries its own commercial `LICENSE` file and every source file inside it
  carries a commercial header.

Per-component (not top-level) keeps the fence right next to its code and lets
path-filtered CI reason about which surface changed.

## The fence (CI-enforced, always-on)

`tools/check-license-fence.mjs` runs in the always-on `fence` CI job and fails
the build on any of:

1. An `ee/` directory missing a commercial `LICENSE`.
2. An Apache-2.0 header appearing **inside** an `ee/` directory.
3. A file **outside** any `ee/` directory importing/linking an `ee/` symbol in
   the OSS build (Go `import ".../ee"`, TS `from ".../ee"`, Rust `mod ee` /
   `use crate::ee` without `cfg(feature = "ee")`).

This guarantees OSS artifacts never link commercial code.

## Runtime gate: license key

`ee/` code **compiles** but is **inert** without a valid signed license key.
The gal kernel performs the capability check
(`gal_license_allows(ctx, GAL_CAP_EE_FEATURE)` in
a future additive extension of the kernel ABI, `kernel/include/gal_decide.h`).
Services, CLI, and dashboard read the key
from environment/secret (`GAL_LICENSE_KEY`) and self-disable EE features when
the key is absent or invalid.

## OSS builds DROP ee/ entirely

OSS builds exclude `ee/` from the artifact so published OSS packages contain
zero commercial code:

| Surface  | OSS build flag                         | Mechanism                                  |
|----------|----------------------------------------|--------------------------------------------|
| Go       | `-tags oss` (`GAL_OSS=1` in compose)   | `//go:build !oss` on `ee/` files           |
| TS (npm) | package `files` excludes `dist/**/ee/**` | `ee/` never enters the published tarball |
| Rust     | `cargo build --no-default-features`    | `ee` is a default feature; `#[cfg(feature = "ee")] mod ee` |

The `just all-oss` target builds every surface with these flags.
