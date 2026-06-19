//! Level 1 compiler: RuleSet -> `.claude/hooks/pre-tool-use.json` + `compiled.json`.
//!
//! Port of `@gal/enforce-compile-hooks` — the compiler is pure I/O: it
//! serializes the rule set to a cache file and writes a Claude Code hook-config
//! pointing at the handler binary. Matching logic runs at handler time and is
//! not included here.
//!
//! See docs/architecture/enforcement.md — "Level 1 — Agent-level hooks".

use std::path::{Path, PathBuf};

use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};

use crate::enforcement::RuleSet;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

/// Options for [`compile_to_hook_config`].
pub struct CompileHooksOptions {
    /// Absolute path to the installed handler binary. The caller is responsible
    /// for resolving this.
    pub handler_path: PathBuf,

    /// Directory where `pre-tool-use.json` should be written. Typically
    /// `<project>/.claude/hooks` or `~/.claude/hooks`.
    pub output_dir: PathBuf,

    /// Absolute path for the pre-compiled RuleSet JSON. The handler reads this
    /// on every invocation. Typically `~/.gal/rules/compiled.json`.
    pub compiled_rules_path: PathBuf,

    /// Optional Node.js executable override. Defaults to `"node"`.
    pub node_bin: Option<String>,
}

// ---------------------------------------------------------------------------
// Hook config file shape
// ---------------------------------------------------------------------------

/// A single hook entry inside a pre-tool-use group.
#[derive(Debug, Serialize, Deserialize)]
pub struct HookEntry {
    #[serde(rename = "type")]
    pub type_: String,
    pub command: String,
}

/// A pre-tool-use group with zero or more hooks.
#[derive(Debug, Serialize, Deserialize)]
pub struct PreToolUseGroup {
    pub hooks: Vec<HookEntry>,
}

/// Shape of the Claude Code hook config file. We emit a single group with no
/// `matcher` field so it fires for every tool; the handler internally
/// dispatches by `tool_name`.
#[derive(Debug, Serialize, Deserialize)]
pub struct HookConfigFile {
    #[serde(rename = "PreToolUse")]
    pub pre_tool_use: Vec<PreToolUseGroup>,
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/// Compile a `RuleSet` into the two on-disk artifacts Claude Code needs:
///
/// 1. `<output_dir>/pre-tool-use.json` — hook config pointing at the handler
/// 2. `<compiled_rules_path>` — serialized RuleSet, read by the handler
///
/// Both are written atomically (the filesystem's `write` is used; no
/// partial-file risk on crash).
pub fn compile_to_hook_config(rule_set: &RuleSet, options: &CompileHooksOptions) -> Result<()> {
    let node_bin = options.node_bin.as_deref().unwrap_or("node");

    let config = build_hook_config(&options.handler_path, &options.compiled_rules_path, node_bin);
    let config_path = options.output_dir.join("pre-tool-use.json");

    // Ensure parent directories exist
    std::fs::create_dir_all(&options.output_dir)
        .with_context(|| format!("Failed to create output dir: {}", options.output_dir.display()))?;
    if let Some(parent) = options.compiled_rules_path.parent() {
        std::fs::create_dir_all(parent).with_context(|| {
            format!(
                "Failed to create compiled rules dir: {}",
                parent.display()
            )
        })?;
    }

    // Write hook config
    let config_json = serde_json::to_string_pretty(&config)
        .context("Failed to serialize hook config")?
        + "\n";
    std::fs::write(&config_path, &config_json)
        .with_context(|| format!("Failed to write hook config: {}", config_path.display()))?;

    // Write compiled rules
    let rules_json = serde_json::to_string_pretty(rule_set)
        .context("Failed to serialize rule set")?
        + "\n";
    std::fs::write(&options.compiled_rules_path, &rules_json).with_context(|| {
        format!(
            "Failed to write compiled rules: {}",
            options.compiled_rules_path.display()
        )
    })?;

    Ok(())
}

/// Build a `HookConfigFile` from the handler path and compiled rules path.
///
/// The `--rules` flag tells the handler binary where to read its compiled rule
/// set from, so the handler stays stateless.
pub fn build_hook_config(
    handler_path: &Path,
    compiled_rules_path: &Path,
    node_bin: &str,
) -> HookConfigFile {
    let command = format!(
        "{} {} --rules {}",
        quote_if_needed(node_bin),
        quote_if_needed(&handler_path.to_string_lossy()),
        quote_if_needed(&compiled_rules_path.to_string_lossy()),
    );

    HookConfigFile {
        pre_tool_use: vec![PreToolUseGroup {
            hooks: vec![HookEntry {
                type_: "command".to_string(),
                command,
            }],
        }],
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Quote a path with spaces for inclusion in the shell-command string Claude
/// Code runs. Paths without spaces or quotes are left alone so the generated
/// JSON stays readable on the common case.
fn quote_if_needed(value: &str) -> String {
    if value.contains('"') {
        // Don't silently corrupt a path with a literal double quote —
        // extremely unusual on macOS/Linux, but fail loudly if it happens.
        panic!(
            "enforce-compile-hooks: path cannot contain double quotes: {}",
            value
        );
    }
    if value.contains(char::is_whitespace) {
        format!("\"{}\"", value)
    } else {
        value.to_string()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::enforcement::{FilesystemAction, FilesystemRule, RuleMode};

    #[test]
    fn test_quote_if_needed_no_spaces() {
        assert_eq!(quote_if_needed("node"), "node");
        assert_eq!(quote_if_needed("/usr/local/bin/node"), "/usr/local/bin/node");
    }

    #[test]
    fn test_quote_if_needed_with_spaces() {
        assert_eq!(
            quote_if_needed("/path/with spaces/node"),
            "\"/path/with spaces/node\""
        );
    }

    #[test]
    #[should_panic(expected = "double quotes")]
    fn test_quote_if_needed_with_quotes() {
        quote_if_needed("/path/with\"quote/node");
    }

    #[test]
    fn test_build_hook_config() {
        let handler = Path::new("/opt/gal/bin/handler");
        let rules = Path::new("/home/user/.gal/rules/compiled.json");
        let config = build_hook_config(handler, rules, "node");

        assert_eq!(config.pre_tool_use.len(), 1);
        assert_eq!(config.pre_tool_use[0].hooks.len(), 1);
        assert_eq!(
            config.pre_tool_use[0].hooks[0].command,
            "node /opt/gal/bin/handler --rules /home/user/.gal/rules/compiled.json"
        );
    }

    #[test]
    fn test_compile_to_hook_config() {
        use std::fs;
        use tempfile::TempDir;

        let tmp = TempDir::new().unwrap();
        let output_dir = tmp.path().join("hooks");
        let compiled_path = tmp.path().join("rules/compiled.json");

        let rule_set = RuleSet {
            mode: RuleMode::Block,
            commands: vec![],
            filesystem: vec![FilesystemRule {
                action: FilesystemAction::DenyWrite,
                path: "/etc".to_string(),
                reason: "test".to_string(),
            }],
            network: vec![],
            sdlc: vec![],
        };

        let opts = CompileHooksOptions {
            handler_path: PathBuf::from("/opt/gal/bin/handler"),
            output_dir: output_dir.clone(),
            compiled_rules_path: compiled_path.clone(),
            node_bin: None,
        };

        compile_to_hook_config(&rule_set, &opts).unwrap();

        // Check pre-tool-use.json exists and is valid JSON
        let config_content = fs::read_to_string(output_dir.join("pre-tool-use.json")).unwrap();
        let config: HookConfigFile = serde_json::from_str(&config_content).unwrap();
        assert_eq!(config.pre_tool_use.len(), 1);

        // Check compiled.json exists and matches
        let rules_content = fs::read_to_string(&compiled_path).unwrap();
        let loaded: RuleSet = serde_json::from_str(&rules_content).unwrap();
        assert_eq!(loaded.filesystem.len(), 1);
        assert_eq!(loaded.filesystem[0].path, "/etc");
    }
}
