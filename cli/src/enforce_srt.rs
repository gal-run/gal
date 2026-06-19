//! Level 2 compiler: RuleSet -> `~/.srt-settings.json`.
//!
//! Port of `@gal/enforce-compile-srt` — the compiler maps the unified rule
//! model onto Anthropic sandbox-runtime's filesystem/network configuration
//! surface. Commands and SDLC rules are intentionally omitted because srt
//! enforces file/network boundaries rather than exec-time policy.
//!
//! See docs/architecture/enforcement.md — "Level 2 — OS sandbox" and
//! "Rule mapping (Level 0 -> srt)".

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::enforcement::{FilesystemAction, NetworkAction, RuleSet};

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/// Options for [`compile_to_srt_settings`].
pub struct CompileSrtOptions {
    /// Absolute path where the generated settings file should be written.
    /// Typically `~/.srt-settings.json`.
    pub output_path: std::path::PathBuf,
}

// ---------------------------------------------------------------------------
// SRT settings file shape
// ---------------------------------------------------------------------------

/// Filesystem settings for sandbox-runtime.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SrtFilesystemSettings {
    #[serde(rename = "denyRead")]
    pub deny_read: Vec<String>,
    #[serde(rename = "allowRead")]
    pub allow_read: Vec<String>,
    #[serde(rename = "allowWrite")]
    pub allow_write: Vec<String>,
    #[serde(rename = "denyWrite")]
    pub deny_write: Vec<String>,
}

/// Network settings for sandbox-runtime.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SrtNetworkSettings {
    #[serde(rename = "allowedDomains")]
    pub allowed_domains: Vec<String>,
    #[serde(rename = "deniedDomains")]
    pub denied_domains: Vec<String>,
}

/// Top-level sandbox-runtime settings file.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SrtSettingsFile {
    pub filesystem: SrtFilesystemSettings,
    pub network: SrtNetworkSettings,
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Compile a `RuleSet` into a deterministic sandbox-runtime settings object.
///
/// Preserves first-seen order and deduplicates exact duplicates so merged rule
/// sets remain stable across repeated compiles while still reflecting
/// org > project > user precedence from Level 0.
pub fn build_srt_settings(rule_set: &RuleSet) -> SrtSettingsFile {
    SrtSettingsFile {
        filesystem: SrtFilesystemSettings {
            deny_read: stable_unique(
                rule_set
                    .filesystem
                    .iter()
                    .filter(|r| r.action == FilesystemAction::DenyRead)
                    .map(|r| r.path.clone()),
            ),
            allow_read: stable_unique(
                rule_set
                    .filesystem
                    .iter()
                    .filter(|r| r.action == FilesystemAction::AllowRead)
                    .map(|r| r.path.clone()),
            ),
            allow_write: stable_unique(
                rule_set
                    .filesystem
                    .iter()
                    .filter(|r| r.action == FilesystemAction::AllowWrite)
                    .map(|r| r.path.clone()),
            ),
            deny_write: stable_unique(
                rule_set
                    .filesystem
                    .iter()
                    .filter(|r| r.action == FilesystemAction::DenyWrite)
                    .map(|r| r.path.clone()),
            ),
        },
        network: SrtNetworkSettings {
            allowed_domains: stable_unique(
                rule_set
                    .network
                    .iter()
                    .filter(|r| r.action == NetworkAction::AllowDomain)
                    .map(|r| r.pattern.clone()),
            ),
            denied_domains: stable_unique(
                rule_set
                    .network
                    .iter()
                    .filter(|r| r.action == NetworkAction::DenyDomain)
                    .map(|r| r.pattern.clone()),
            ),
        },
    }
}

/// Write `~/.srt-settings.json` with parent-dir creation. The output format is
/// intentionally fixed (`serde_json::to_string_pretty` + `"\n"`) so golden-file
/// tests can catch any accidental drift.
pub fn compile_to_srt_settings(
    rule_set: &RuleSet,
    options: &CompileSrtOptions,
) -> Result<()> {
    let settings = build_srt_settings(rule_set);

    // Ensure parent directory exists
    if let Some(parent) = options.output_path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("Failed to create parent dir: {}", parent.display()))?;
    }

    let json = serde_json::to_string_pretty(&settings)
        .context("Failed to serialize SRT settings")?
        + "\n";

    std::fs::write(&options.output_path, &json)
        .with_context(|| format!("Failed to write SRT settings: {}", options.output_path.display()))?;

    Ok(())
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Deduplicate strings while preserving insertion order (first-seen wins).
fn stable_unique(values: impl IntoIterator<Item = String>) -> Vec<String> {
    let mut seen = std::collections::HashSet::new();
    let mut result = Vec::new();

    for value in values {
        if seen.insert(value.clone()) {
            result.push(value);
        }
    }

    result
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::enforcement::{
        FilesystemAction, FilesystemRule, NetworkAction, NetworkRule, RuleMode,
    };

    fn sample_rules() -> RuleSet {
        RuleSet {
            mode: RuleMode::Block,
            commands: vec![],
            filesystem: vec![
                FilesystemRule {
                    action: FilesystemAction::DenyRead,
                    path: "/etc/passwd".to_string(),
                    reason: "Sensitive file".to_string(),
                },
                FilesystemRule {
                    action: FilesystemAction::DenyRead,
                    path: "/etc/shadow".to_string(),
                    reason: "Sensitive file".to_string(),
                },
                FilesystemRule {
                    action: FilesystemAction::AllowRead,
                    path: "/usr".to_string(),
                    reason: "System binaries".to_string(),
                },
                FilesystemRule {
                    action: FilesystemAction::AllowWrite,
                    path: "/tmp".to_string(),
                    reason: "Temp files".to_string(),
                },
                FilesystemRule {
                    action: FilesystemAction::DenyWrite,
                    path: "/etc".to_string(),
                    reason: "System config".to_string(),
                },
            ],
            network: vec![
                NetworkRule {
                    action: NetworkAction::AllowDomain,
                    pattern: "*.github.com".to_string(),
                    reason: "GitHub".to_string(),
                },
                NetworkRule {
                    action: NetworkAction::DenyDomain,
                    pattern: "*.malicious.com".to_string(),
                    reason: "Blocked".to_string(),
                },
            ],
            sdlc: vec![],
        }
    }

    #[test]
    fn test_build_srt_settings() {
        let settings = build_srt_settings(&sample_rules());

        // Filesystem
        assert_eq!(settings.filesystem.deny_read, vec!["/etc/passwd", "/etc/shadow"]);
        assert_eq!(settings.filesystem.allow_read, vec!["/usr"]);
        assert_eq!(settings.filesystem.allow_write, vec!["/tmp"]);
        assert_eq!(settings.filesystem.deny_write, vec!["/etc"]);

        // Network
        assert_eq!(settings.network.allowed_domains, vec!["*.github.com"]);
        assert_eq!(settings.network.denied_domains, vec!["*.malicious.com"]);
    }

    #[test]
    fn test_stable_unique_deduplicates() {
        let result = stable_unique(vec![
            "a".to_string(),
            "b".to_string(),
            "a".to_string(),
            "c".to_string(),
            "b".to_string(),
        ]);
        assert_eq!(result, vec!["a", "b", "c"]);
    }

    #[test]
    fn test_stable_unique_empty() {
        let result = stable_unique(Vec::<String>::new());
        assert!(result.is_empty());
    }

    #[test]
    fn test_compile_to_srt_settings() {
        use tempfile::TempDir;

        let tmp = TempDir::new().unwrap();
        let output_path = tmp.path().join(".srt-settings.json");

        let opts = CompileSrtOptions {
            output_path: output_path.clone(),
        };

        compile_to_srt_settings(&sample_rules(), &opts).unwrap();

        let content = std::fs::read_to_string(&output_path).unwrap();
        let parsed: SrtSettingsFile = serde_json::from_str(&content).unwrap();

        assert_eq!(parsed.filesystem.deny_read.len(), 2);
        assert_eq!(parsed.network.allowed_domains.len(), 1);
        assert!(content.ends_with('\n'));
    }
}
