// gal-cli entrypoint (skeleton). Published to crates.io + Homebrew tap.
//
// Commercial subcommands live in the `ee` module, compiled only with the
// `ee` feature. OSS builds (`cargo build --no-default-features`) drop it
// entirely so the published OSS crate contains zero commercial code.
//
// License: Apache-2.0 (outside any ee/ directory).

#[cfg(feature = "ee")]
mod ee;

fn main() {
    println!("gal - open governance platform; kernel at head; self-host today");
    #[cfg(feature = "ee")]
    {
        // ee subcommands self-disable without a valid license key.
        let _ = ee::licensed_features_enabled();
    }
}
