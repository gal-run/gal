//! Shared types for GAL enforcement — port of `@gal/enforce-rules`.
//!
//! Canonical in-memory representation of an org's enforcement policy.
//! Downstream compilers (Level 1 hooks, Level 2 srt settings) consume
//! `RuleSet` without touching the source YAML again.

use serde::{Deserialize, Serialize};

// ---------------------------------------------------------------------------
// Rule mode
// ---------------------------------------------------------------------------

/// Whether a rule or rule-set issues a warning or blocks outright.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RuleMode {
    #[serde(rename = "warn")]
    Warn,
    #[serde(rename = "block")]
    Block,
}

// ---------------------------------------------------------------------------
// Command rules
// ---------------------------------------------------------------------------

/// A single command-match rule.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CommandRule {
    /// Literal substring match by default (case-sensitive) against the command
    /// text as seen by the hook (e.g. "git push origin main").
    #[serde(rename = "match")]
    pub match_: String,
    /// Per-rule mode override. Inherits `RuleSet.mode` if absent.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mode: Option<RuleMode>,
    /// Human-readable reason surfaced when the rule fires.
    pub reason: String,
    /// Which enforcement layer this rule targets: `agent`, `sandbox`, or
    /// `both` (default).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub scope: Option<String>,
}

// ---------------------------------------------------------------------------
// Filesystem rules
// ---------------------------------------------------------------------------

/// Filesystem action type.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum FilesystemAction {
    #[serde(rename = "deny-read")]
    DenyRead,
    #[serde(rename = "allow-read")]
    AllowRead,
    #[serde(rename = "deny-write")]
    DenyWrite,
    #[serde(rename = "allow-write")]
    AllowWrite,
}

/// A single filesystem rule.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FilesystemRule {
    pub action: FilesystemAction,
    /// Glob on macOS (sandbox-exec), literal on Linux (bubblewrap).
    pub path: String,
    pub reason: String,
}

// ---------------------------------------------------------------------------
// Network rules
// ---------------------------------------------------------------------------

/// Network action type.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum NetworkAction {
    #[serde(rename = "allow-domain")]
    AllowDomain,
    #[serde(rename = "deny-domain")]
    DenyDomain,
}

/// A single network rule.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetworkRule {
    pub action: NetworkAction,
    /// Domain or wildcard (e.g. `"*.anthropic.com"`).
    pub pattern: String,
    pub reason: String,
}

// ---------------------------------------------------------------------------
// SDLC phase rules
// ---------------------------------------------------------------------------

/// A single SDLC phase gate rule.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SdlcPhaseRule {
    /// SDLC phase name, e.g. "3-test", "5-deploy".
    pub phase: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allow_commands: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deny_commands: Option<Vec<String>>,
}

// ---------------------------------------------------------------------------
// RuleSet
// ---------------------------------------------------------------------------

/// A complete set of enforcement rules.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RuleSet {
    pub mode: RuleMode,
    pub commands: Vec<CommandRule>,
    pub filesystem: Vec<FilesystemRule>,
    pub network: Vec<NetworkRule>,
    pub sdlc: Vec<SdlcPhaseRule>,
}

impl RuleSet {
    /// Create an empty rule set (all fields empty, mode = `warn`).
    pub fn empty() -> Self {
        Self {
            mode: RuleMode::Warn,
            commands: Vec::new(),
            filesystem: Vec::new(),
            network: Vec::new(),
            sdlc: Vec::new(),
        }
    }

    /// Load a `RuleSet` from a JSON file.
    pub fn from_json_file(path: impl AsRef<std::path::Path>) -> anyhow::Result<Self> {
        let content =
            std::fs::read_to_string(path.as_ref()).map_err(|e| anyhow::anyhow!("{}", e))?;
        let rules: RuleSet =
            serde_json::from_str(&content).map_err(|e| anyhow::anyhow!("{}", e))?;
        Ok(rules)
    }

    /// Serialize this rule set to pretty-printed JSON.
    pub fn to_json_pretty(&self) -> serde_json::Result<String> {
        serde_json::to_string_pretty(self)
    }
}

// ---------------------------------------------------------------------------
// ScopedRuleSet
// ---------------------------------------------------------------------------

/// Which scope a rule set was loaded from.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum RuleScope {
    #[serde(rename = "org")]
    Org,
    #[serde(rename = "project")]
    Project,
    #[serde(rename = "user")]
    User,
}

/// A rule set tagged with its source scope.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ScopedRuleSet {
    pub scope: RuleScope,
    pub rules: RuleSet,
}
