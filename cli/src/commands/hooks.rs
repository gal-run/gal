use std::path::PathBuf;
use std::process::Command;
use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use colored::*;
use serde::Serialize;

use crate::client::ApiClient;

// =============================================================================
// Constants
// =============================================================================

const HOOK_VERSION: &str = "4.3.0";

/// settings.json command keyword for the Stop-hook transcript capture command
/// (`gal capture-session`). Registered alongside the usage-report Stop hook.
const CAPTURE_HOOK_KEYWORD: &str = "gal-capture-session";
const PRE_COMMIT_MARKER: &str = "# GAL SDLC pre-commit hook";

const PRE_COMMIT_CONTENT: &str = r#"#!/bin/sh
# GAL SDLC pre-commit hook
# Installed by: gal hooks pre-commit --install
# Checks that implementation files have corresponding test files.
# To skip this check, use: git commit --no-verify

STAGED_FILES=$(git diff --cached --name-only --diff-filter=ACM)
IMPL_FILES=$(echo "$STAGED_FILES" | grep -E '\.(ts|tsx|js|jsx)$' | grep -vE '\.(test|spec|e2e)\.(ts|tsx|js|jsx)$' | grep -vE '(test|__tests__|e2e|spec)/')
WARNINGS=""

if [ -n "$IMPL_FILES" ]; then
  while IFS= read -r impl_file; do
    [ -z "$impl_file" ] && continue
    base_name=$(basename "$impl_file" | sed -E 's/\.(ts|tsx|js|jsx)$//')
    dir_name=$(dirname "$impl_file")

    # Check for test file in same directory or __tests__ subdirectory
    found_test=false
    for ext in test.ts test.tsx spec.ts spec.tsx; do
      if [ -f "$dir_name/$base_name.$ext" ] || [ -f "$dir_name/__tests__/$base_name.$ext" ]; then
        found_test=true
        break
      fi
    done

    if [ "$found_test" = false ]; then
      WARNINGS="$WARNINGS\n  - $impl_file (missing test file)"
    fi
  done <<< "$IMPL_FILES"
fi

if [ -n "$WARNINGS" ]; then
  echo ""
  echo "\033[33m[GAL SDLC] Warning: Implementation files without corresponding tests:\033[0m"
  echo -e "$WARNINGS"
  echo ""
  echo "\033[33mConsider adding test files (SDLC Phase 3: TDD).\033[0m"
  echo "\033[2mTo skip this check: git commit --no-verify\033[0m"
  echo ""
fi
"#;

// =============================================================================
// Path helpers
// =============================================================================

fn home_dir() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("~"))
}

fn claude_settings_path() -> PathBuf {
    home_dir().join(".claude").join("settings.json")
}

fn gal_sync_hook_path() -> PathBuf {
    home_dir()
        .join(".claude")
        .join("hooks")
        .join("gal-sync-reminder.js")
}

fn gal_report_hook_path() -> PathBuf {
    home_dir()
        .join(".claude")
        .join("hooks")
        .join("gal-usage-report.js")
}

fn gal_rules_path() -> PathBuf {
    home_dir()
        .join(".claude")
        .join("rules")
        .join("gal-cli.md")
}

fn cursor_hooks_config_path() -> PathBuf {
    home_dir().join(".cursor").join("hooks.json")
}

fn cursor_hooks_script_path() -> PathBuf {
    home_dir().join(".cursor").join("hooks").join("gal-hooks.sh")
}

fn windsurf_hooks_config_path() -> PathBuf {
    home_dir().join(".windsurf").join("hooks.json")
}

fn windsurf_hooks_script_path() -> PathBuf {
    home_dir()
        .join(".windsurf")
        .join("hooks")
        .join("gal-hooks.sh")
}

fn gemini_extension_dir() -> PathBuf {
    home_dir().join(".gal").join("gemini-extension")
}

fn gemini_enablement_path() -> PathBuf {
    home_dir()
        .join(".gemini")
        .join("extensions")
        .join("extension-enablement.json")
}

fn gemini_extension_install_path() -> PathBuf {
    home_dir()
        .join(".gemini")
        .join("extensions")
        .join("gal-sync")
}

fn gemini_legacy_hook_path() -> PathBuf {
    home_dir()
        .join(".gemini")
        .join("hooks")
        .join("gal-sync.sh")
}

// =============================================================================
// Utility helpers
// =============================================================================

fn is_binary_in_path(name: &str) -> bool {
    Command::new("which")
        .arg(name)
        .stdout(std::process::Stdio::null())
        .stderr(std::process::Stdio::null())
        .status()
        .map(|s| s.success())
        .unwrap_or(false)
}

fn read_settings() -> serde_json::Value {
    let path = claude_settings_path();
    if !path.exists() {
        return serde_json::json!({});
    }
    std::fs::read_to_string(&path)
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or(serde_json::json!({}))
}

fn write_settings(settings: &serde_json::Value) -> Result<()> {
    let path = claude_settings_path();
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let content = serde_json::to_string_pretty(settings)?;
    std::fs::write(&path, content)
        .with_context(|| format!("Failed to write {}", path.display()))?;
    Ok(())
}

fn read_json_file(path: &PathBuf) -> Result<serde_json::Value> {
    let content = std::fs::read_to_string(path)
        .with_context(|| format!("Failed to read {}", path.display()))?;
    let value = serde_json::from_str(&content)
        .with_context(|| format!("Failed to parse {}", path.display()))?;
    Ok(value)
}

fn write_json_file(path: &PathBuf, value: &serde_json::Value) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let content = serde_json::to_string_pretty(value)?;
    std::fs::write(path, content)
        .with_context(|| format!("Failed to write {}", path.display()))?;
    Ok(())
}

/// Check if a hook entry's command contains GAL-related keywords.
fn is_gal_hook_command(val: &serde_json::Value) -> bool {
    val.get("command")
        .and_then(|c| c.as_str())
        .map(|cmd| cmd.contains("gal-") || cmd.contains("/gal/"))
        .unwrap_or(false)
}

/// Extract GAL_HOOK_VERSION from a hook script file.
fn extract_hook_version(file_path: &PathBuf) -> Option<String> {
    let content = std::fs::read_to_string(file_path).ok()?;
    for line in content.lines() {
        if let Some(idx) = line.find("GAL_HOOK_VERSION = \"") {
            let rest = &line[idx + "GAL_HOOK_VERSION = \"".len()..];
            if let Some(end) = rest.find('"') {
                return Some(rest[..end].to_string());
            }
        }
    }
    None
}

/// Check if a hook is registered for a given settings.json event.
fn is_hook_registered(event: &str, keyword: &str) -> bool {
    let settings = read_settings();
    if let Some(entries) = settings
        .pointer(&format!("/hooks/{}", event))
        .and_then(|v| v.as_array())
    {
        for entry in entries {
            if let Some(inner_hooks) = entry.get("hooks").and_then(|v| v.as_array()) {
                for h in inner_hooks {
                    if let Some(cmd) = h.get("command").and_then(|v| v.as_str()) {
                        if cmd.contains(keyword) {
                            return true;
                        }
                    }
                }
            }
        }
    }
    false
}

/// Check if GAL rules file exists.
fn is_rules_installed() -> bool {
    gal_rules_path().exists()
}

// =============================================================================
// Structs
// =============================================================================

#[derive(Parser)]
pub struct HooksArgs {
    #[command(subcommand)]
    pub command: HooksCommands,
}

#[derive(Subcommand)]
pub enum HooksCommands {
    /// Install git hooks for GAL compliance checks
    Install {
        /// Repository path
        #[arg(default_value = ".")]
        repo_path: String,
        /// Force reinstall
        #[arg(long)]
        force: bool,
    },
    /// Remove GAL hooks from all AI agents
    Uninstall,
    /// Show current hook installation status across platforms
    Status {
        /// Output status as JSON
        #[arg(long)]
        json: bool,
    },
    /// Diagnose hook contract and local GAL binary drift
    Doctor {
        /// Project path to inspect
        #[arg(long, default_value = ".")]
        path: String,
        /// Output report as JSON
        #[arg(long)]
        json: bool,
    },
    /// Install/uninstall a git pre-commit hook that checks for test files
    #[command(name = "pre-commit")]
    PreCommit {
        /// Install the pre-commit hook
        #[arg(long)]
        install: bool,
        /// Remove the pre-commit hook
        #[arg(long)]
        uninstall: bool,
        /// Path to the git repository
        #[arg(long, default_value = ".")]
        path: String,
    },
}

// --- JSON output structs ---

#[derive(Serialize)]
struct StatusJson {
    claude: ClaudeStatusJson,
    multi_platform: Vec<PlatformStatusJson>,
}

#[derive(Serialize)]
struct ClaudeStatusJson {
    sync_hook: HookFileStatusJson,
    report_hook: HookFileStatusJson,
    capture_hook: CaptureHookStatusJson,
    rules: FileStatusJson,
}

/// Status of the `gal capture-session` Stop-hook registration. Unlike the
/// usage-report/sync hooks there is no JS file — the gal binary reads stdin
/// itself, so we only track whether the command is registered in settings.json.
#[derive(Serialize)]
struct CaptureHookStatusJson {
    registered_in_settings: bool,
    keyword: String,
}

#[derive(Serialize)]
struct HookFileStatusJson {
    file_exists: bool,
    registered_in_settings: bool,
    path: String,
}

#[derive(Serialize)]
struct FileStatusJson {
    exists: bool,
    path: String,
}

#[derive(Serialize)]
struct PlatformStatusJson {
    agent: String,
    detected: bool,
    installed: bool,
}

#[derive(Serialize)]
struct DoctorReportJson {
    binary_found: bool,
    binary_path: String,
    binary_version: String,
    claude_sync_hook_ok: bool,
    claude_report_hook_ok: bool,
    claude_rules_ok: bool,
    issues: Vec<String>,
}

// =============================================================================
// Entry point
// =============================================================================

pub async fn run(_client: ApiClient, args: HooksArgs) -> Result<()> {
    match args.command {
        HooksCommands::Install { repo_path, force } => cmd_install(&repo_path, force).await,
        HooksCommands::Uninstall => cmd_uninstall().await,
        HooksCommands::Status { json } => cmd_status(json).await,
        HooksCommands::Doctor { path, json } => cmd_doctor(&path, json).await,
        HooksCommands::PreCommit {
            install,
            uninstall,
            path,
        } => cmd_pre_commit(install, uninstall, &path).await,
    }
}

// =============================================================================
// Install — installs git pre-commit and post-commit hooks for GAL compliance
// =============================================================================

async fn cmd_install(repo_path: &str, force: bool) -> Result<()> {
    let git_dir = std::path::Path::new(repo_path).join(".git");
    if !git_dir.exists() {
        if !git_dir.is_file() {
            println!(
                "\n{} Not a git repository: {}",
                "!".yellow(),
                repo_path
            );
            println!("  {}", "Run this command from within a git repository.".dimmed());
            println!();
            return Ok(());
        }
    }

    let hooks_dir = std::path::Path::new(repo_path).join(".git").join("hooks");
    std::fs::create_dir_all(&hooks_dir)
        .map_err(|e| anyhow::anyhow!("Failed to create hooks directory: {}", e))?;

    // Install pre-commit hook
    let pre_commit_path = hooks_dir.join("pre-commit");
    let pre_commit_script = r#"#!/bin/bash
# GAL CLI - Pre-commit hook
# Runs GAL compliance checks before commits

echo "[GAL] Running pre-commit checks..."

# Check for AI config changes
if git diff --cached --name-only | grep -qE '\.gal/|CLAUDE\.md|\.cursorrules'; then
  echo "[GAL] AI configuration files detected in commit."
  echo "[GAL] Ensure these are compliant with your organization's policies."
fi

exit 0
"#;

    if pre_commit_path.exists() && !force {
        println!(
            "\n{} Pre-commit hook already exists at {}",
            "!".yellow(),
            pre_commit_path.display()
        );
        println!("  {} Use --force to overwrite", "(Hint)".dimmed());
    } else {
        std::fs::write(&pre_commit_path, pre_commit_script)
            .map_err(|e| anyhow::anyhow!("Failed to write pre-commit hook: {}", e))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(
                &pre_commit_path,
                std::fs::Permissions::from_mode(0o755),
            )
            .map_err(|e| anyhow::anyhow!("Failed to set permissions: {}", e))?;
        }
        println!("  {} Pre-commit hook installed", "\u{2713}".green());
    }

    // Install post-commit hook
    let post_commit_path = hooks_dir.join("post-commit");
    let post_commit_script = r#"#!/bin/bash
# GAL CLI - Post-commit hook
# Reports commit information to GAL

echo "[GAL] Commit recorded."
"#;

    if post_commit_path.exists() && !force {
        println!("  {} Post-commit hook already exists, skipping", "\u{2022}".dimmed());
    } else {
        std::fs::write(&post_commit_path, post_commit_script)
            .map_err(|e| anyhow::anyhow!("Failed to write post-commit hook: {}", e))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(
                &post_commit_path,
                std::fs::Permissions::from_mode(0o755),
            )
            .map_err(|e| anyhow::anyhow!("Failed to set permissions: {}", e))?;
        }
        println!("  {} Post-commit hook installed", "\u{2713}".green());
    }

    println!(
        "\n{} Git hooks installed in {}",
        "\u{2713}".green(),
        repo_path
    );
    println!("  {}", "Hooks run automatically on git operations.".dimmed());
    println!();

    Ok(())
}

// =============================================================================
// Uninstall — remove GAL hooks from all AI agents
// =============================================================================

async fn cmd_uninstall() -> Result<()> {
    println!();
    println!("{}", "Removing GAL hooks from AI agents...".cyan());
    println!();

    let mut hook_removed = false;
    let mut rules_removed = false;

    // ---- 1. Remove Claude Code hook script files ----
    for (path, label) in &[
        (gal_sync_hook_path(), "SessionStart hook script"),
        (gal_report_hook_path(), "Stop hook script"),
    ] {
        if path.exists() {
            std::fs::remove_file(path)
                .with_context(|| format!("Failed to remove {}", path.display()))?;
            println!("  {} Removed {}", "\u{2713}".green(), label);
            hook_removed = true;
        }
    }

    // ---- 2. Remove Claude Code rules file ----
    if gal_rules_path().exists() {
        std::fs::remove_file(&gal_rules_path())
            .with_context(|| format!("Failed to remove {}", gal_rules_path().display()))?;
        println!("  {} Removed GAL CLI rules", "\u{2713}".green());
        rules_removed = true;
    }

    // ---- 3. Remove GAL hook entries from settings.json ----
    if claude_settings_path().exists() {
        let content = std::fs::read_to_string(&claude_settings_path())?;
        let mut settings: serde_json::Value = serde_json::from_str(&content)?;
        let mut settings_changed = false;

        if let Some(hooks_obj) = settings.get_mut("hooks").and_then(|h| h.as_object_mut()) {
            let events = [
                "SessionStart",
                "Stop",
                "UserPromptSubmit",
                "PreToolUse",
            ];

            for event_name in &events {
                if let Some(entries) = hooks_obj
                    .get_mut(*event_name)
                    .and_then(|e| e.as_array_mut())
                {
                    // Filter inner hooks for each entry
                    for entry in entries.iter_mut() {
                        if let Some(inner) = entry.get_mut("hooks").and_then(|h| h.as_array_mut())
                        {
                            inner.retain(|h| !is_gal_hook_command(h));
                        }
                    }

                    // Remove entries with empty inner hooks
                    entries.retain(|e| {
                        e.get("hooks")
                            .and_then(|h| h.as_array())
                            .map(|a| !a.is_empty())
                            .unwrap_or(true)
                    });
                }
            }

            // Remove empty event categories
            let keys: Vec<String> = hooks_obj.keys().cloned().collect();
            for key in &keys {
                if let Some(arr) = hooks_obj.get(key).and_then(|v| v.as_array()) {
                    if arr.is_empty() {
                        hooks_obj.remove(key);
                        settings_changed = true;
                    }
                }
            }

            // Remove hooks entirely if empty
            if hooks_obj.is_empty() {
                if let Some(obj) = settings.as_object_mut() {
                    obj.remove("hooks");
                    settings_changed = true;
                }
            }
        }

        if settings_changed {
            write_settings(&settings)?;
            println!("  {} Removed GAL hooks from settings.json", "\u{2713}".green());
            hook_removed = true;
        }
    }

    // ---- 4. Remove Cursor hooks ----
    if cursor_hooks_config_path().exists() {
        let content = std::fs::read_to_string(&cursor_hooks_config_path())?;
        let mut hooks: serde_json::Value = serde_json::from_str(&content)?;
        let mut cursor_changed = false;

        if let Some(startup) = hooks
            .pointer_mut("/hooks/startup")
            .and_then(|s| s.as_array_mut())
        {
            let before = startup.len();
            startup.retain(|entry| {
                entry.get("installed_by").and_then(|v| v.as_str()) != Some("gal-cli")
            });
            if startup.len() != before {
                cursor_changed = true;
            }
        }

        if cursor_changed {
            write_json_file(&cursor_hooks_config_path(), &hooks)?;
            println!("  {} Removed GAL hooks from Cursor", "\u{2713}".green());
            hook_removed = true;
        }
    }
    if cursor_hooks_script_path().exists() {
        std::fs::remove_file(&cursor_hooks_script_path())?;
        println!("  {} Removed Cursor hook script", "\u{2713}".green());
        hook_removed = true;
    }

    // ---- 5. Remove Windsurf hooks ----
    if windsurf_hooks_config_path().exists() {
        let content = std::fs::read_to_string(&windsurf_hooks_config_path())?;
        let mut hooks: serde_json::Value = serde_json::from_str(&content)?;
        let mut windsurf_changed = false;

        if let Some(startup) = hooks
            .pointer_mut("/hooks/startup")
            .and_then(|s| s.as_array_mut())
        {
            let before = startup.len();
            startup.retain(|entry| {
                entry.get("installed_by").and_then(|v| v.as_str()) != Some("gal-cli")
            });
            if startup.len() != before {
                windsurf_changed = true;
            }
        }

        if windsurf_changed {
            write_json_file(&windsurf_hooks_config_path(), &hooks)?;
            println!("  {} Removed GAL hooks from Windsurf", "\u{2713}".green());
            hook_removed = true;
        }
    }
    if windsurf_hooks_script_path().exists() {
        std::fs::remove_file(&windsurf_hooks_script_path())?;
        println!("  {} Removed Windsurf hook script", "\u{2713}".green());
        hook_removed = true;
    }

    // ---- 6. Remove Gemini hooks ----
    if gemini_extension_install_path().exists() {
        std::fs::remove_dir_all(&gemini_extension_install_path())?;
        println!("  {} Removed Gemini extension install", "\u{2713}".green());
        hook_removed = true;
    }

    // Remove from Gemini enablement file
    if gemini_enablement_path().exists() {
        let content = std::fs::read_to_string(&gemini_enablement_path())?;
        let mut enablement: serde_json::Value = serde_json::from_str(&content)?;
        if let Some(obj) = enablement.as_object_mut() {
            if obj.remove("gal-sync").is_some() {
                write_json_file(&gemini_enablement_path(), &enablement)?;
                println!("  {} Removed Gemini extension enablement", "\u{2713}".green());
                hook_removed = true;
            }
        }
    }

    // Remove Gemini extension source directory
    if gemini_extension_dir().exists() {
        std::fs::remove_dir_all(&gemini_extension_dir())?;
        println!("  {} Removed Gemini extension source", "\u{2713}".green());
        hook_removed = true;
    }

    // Legacy Gemini hook
    if gemini_legacy_hook_path().exists() {
        std::fs::remove_file(&gemini_legacy_hook_path())?;
        println!("  {} Removed legacy Gemini hook script", "\u{2713}".green());
        hook_removed = true;
    }

    // ---- Summary ----
    println!();
    if hook_removed {
        println!("  {} SessionStart/Stop hooks removed", "\u{2713}".green());
    } else {
        println!("  {} No GAL hooks found", "\u{25CB}".dimmed());
    }
    if rules_removed {
        println!("  {} GAL CLI rules removed", "\u{2713}".green());
    } else {
        println!("  {} No GAL CLI rules found", "\u{25CB}".dimmed());
    }

    if hook_removed || rules_removed {
        println!();
        println!("  {}", "Restart AI agents for changes to take effect.".yellow());
    }
    println!();

    Ok(())
}

// =============================================================================
// Status — show hook installation status across platforms
// =============================================================================

async fn cmd_status(json_output: bool) -> Result<()> {
    // ---- Gather status data ----

    // Claude Code
    let sync_hook_file_exists = gal_sync_hook_path().exists();
    let sync_hook_registered = is_hook_registered("SessionStart", "gal-sync-reminder");
    let report_hook_file_exists = gal_report_hook_path().exists();
    let report_hook_registered = is_hook_registered("Stop", "gal-usage-report");
    let capture_hook_registered = is_hook_registered("Stop", CAPTURE_HOOK_KEYWORD);
    let rules_installed = is_rules_installed();

    // Multi-platform detection
    let mut multi_platform: Vec<PlatformStatusJson> = Vec::new();

    // Cursor
    let cursor_detected = is_binary_in_path("cursor") || home_dir().join(".cursor").exists();
    if cursor_detected {
        let cursor_installed = cursor_hooks_config_path().exists()
            && read_json_file(&cursor_hooks_config_path())
                .ok()
                .and_then(|v| {
                    v.pointer("/hooks/startup")
                        .and_then(|s| s.as_array())
                        .map(|arr| {
                            arr.iter()
                                .any(|e| e.get("installed_by").and_then(|v| v.as_str()) == Some("gal-cli"))
                        })
                })
                .unwrap_or(false);
        multi_platform.push(PlatformStatusJson {
            agent: "Cursor".to_string(),
            detected: true,
            installed: cursor_installed,
        });
    }

    // Windsurf
    let windsurf_detected =
        is_binary_in_path("windsurf") || home_dir().join(".windsurf").exists();
    if windsurf_detected {
        let windsurf_installed = windsurf_hooks_config_path().exists()
            && read_json_file(&windsurf_hooks_config_path())
                .ok()
                .and_then(|v| {
                    v.pointer("/hooks/startup")
                        .and_then(|s| s.as_array())
                        .map(|arr| {
                            arr.iter()
                                .any(|e| e.get("installed_by").and_then(|v| v.as_str()) == Some("gal-cli"))
                        })
                })
                .unwrap_or(false);
        multi_platform.push(PlatformStatusJson {
            agent: "Windsurf".to_string(),
            detected: true,
            installed: windsurf_installed,
        });
    }

    // Gemini
    let gemini_detected =
        is_binary_in_path("gemini") || home_dir().join(".gemini").exists();
    if gemini_detected {
        let gemini_installed = gemini_extension_dir().join("gemini-extension.json").exists();
        multi_platform.push(PlatformStatusJson {
            agent: "Gemini".to_string(),
            detected: true,
            installed: gemini_installed,
        });
    }

    // Amp (detected but hooks not yet supported)
    if is_binary_in_path("amp") {
        multi_platform.push(PlatformStatusJson {
            agent: "Amp".to_string(),
            detected: true,
            installed: false,
        });
    }

    // Antigravity
    if is_binary_in_path("antigravity") || home_dir().join(".antigravity").exists() {
        multi_platform.push(PlatformStatusJson {
            agent: "Antigravity".to_string(),
            detected: true,
            installed: false,
        });
    }

    // ---- Output ----
    if json_output {
        let report = StatusJson {
            claude: ClaudeStatusJson {
                sync_hook: HookFileStatusJson {
                    file_exists: sync_hook_file_exists,
                    registered_in_settings: sync_hook_registered,
                    path: gal_sync_hook_path().display().to_string(),
                },
                report_hook: HookFileStatusJson {
                    file_exists: report_hook_file_exists,
                    registered_in_settings: report_hook_registered,
                    path: gal_report_hook_path().display().to_string(),
                },
                capture_hook: CaptureHookStatusJson {
                    registered_in_settings: capture_hook_registered,
                    keyword: CAPTURE_HOOK_KEYWORD.to_string(),
                },
                rules: FileStatusJson {
                    exists: rules_installed,
                    path: gal_rules_path().display().to_string(),
                },
            },
            multi_platform,
        };
        println!("{}", serde_json::to_string_pretty(&report)?);
        return Ok(());
    }

    // Human-readable output
    println!();
    println!("{}", "GAL Hooks Status".cyan().bold());
    println!();

    println!("{}", "Claude Code:".bold());

    let hook_icon = |good: bool| -> colored::ColoredString {
        if good {
            "\u{2713}".green()
        } else {
            "x".red()
        }
    };

    println!(
        "  {} SessionStart hook: {}",
        hook_icon(sync_hook_file_exists && sync_hook_registered),
        if sync_hook_file_exists && sync_hook_registered {
            "Installed".green()
        } else {
            "Not installed".red()
        }
    );
    if sync_hook_file_exists {
        let version = extract_hook_version(&gal_sync_hook_path())
            .unwrap_or_else(|| "unknown".to_string());
        let version_status = if version == HOOK_VERSION {
            format!("{} (current)", version).dimmed()
        } else {
            format!("{} (update available)", version).yellow()
        };
        println!("    {} {}", "Version:".dimmed(), version_status);
        println!("    {} {}", "Path:".dimmed(), gal_sync_hook_path().display());
        if !sync_hook_registered {
            println!(
                "    {}",
                "Warning: Hook file exists but not registered in settings.json".yellow()
            );
        }
    }

    println!(
        "  {} Stop usage hook: {}",
        hook_icon(report_hook_file_exists && report_hook_registered),
        if report_hook_file_exists && report_hook_registered {
            "Installed".green()
        } else {
            "Not installed".red()
        }
    );
    if report_hook_file_exists {
        let version = extract_hook_version(&gal_report_hook_path())
            .unwrap_or_else(|| "unknown".to_string());
        let version_status = if version == HOOK_VERSION {
            format!("{} (current)", version).dimmed()
        } else {
            format!("{} (update available)", version).yellow()
        };
        println!("    {} {}", "Version:".dimmed(), version_status);
        println!("    {} {}", "Path:".dimmed(), gal_report_hook_path().display());
        if !report_hook_registered {
            println!(
                "    {}",
                "Warning: Hook file exists but not registered in settings.json".yellow()
            );
        }
    }

    println!(
        "  {} Stop capture hook: {}",
        hook_icon(capture_hook_registered),
        if capture_hook_registered {
            "Installed".green()
        } else {
            "Not installed".red()
        }
    );
    println!(
        "    {} {} ({})",
        "Command:".dimmed(),
        "gal capture-session".dimmed(),
        CAPTURE_HOOK_KEYWORD.dimmed()
    );

    println!(
        "  {} GAL CLI rules: {}",
        hook_icon(rules_installed),
        if rules_installed {
            "Installed".green()
        } else {
            "Not installed".red()
        }
    );
    if rules_installed {
        println!("    {} {}", "Path:".dimmed(), gal_rules_path().display());
    }

    // Multi-platform status
    if !multi_platform.is_empty() {
        println!();
        println!("{}", "Other AI Agents:".bold());
        println!();

        for mp in &multi_platform {
            let agent_icon = if mp.installed {
                "\u{2713}".green()
            } else {
                "x".red()
            };
            let status_text = if mp.installed {
                "GAL sync hook installed".to_string()
            } else {
                "detected, not installed (run gal hooks install)".to_string()
            };
            println!("  {} {} — {}", agent_icon, mp.agent, status_text);
        }
    }

    println!();

    // Overall status
    let all_installed = sync_hook_file_exists
        && sync_hook_registered
        && report_hook_file_exists
        && report_hook_registered
        && rules_installed;

    if !all_installed {
        println!(
            "  {}",
            "Run `gal hooks install` to set up AI agent integration.".yellow()
        );
    } else {
        println!(
            "  {}",
            "All hooks are installed and up to date.".green()
        );
    }
    println!();

    Ok(())
}

// =============================================================================
// Doctor — diagnose hook contract and local GAL binary drift
// =============================================================================

async fn cmd_doctor(_project_path: &str, json_output: bool) -> Result<()> {
    let mut issues: Vec<String> = Vec::new();

    // ---- Check 1: gal binary ----
    let binary_found = is_binary_in_path("gal");
    let binary_path = if binary_found {
        Command::new("which")
            .arg("gal")
            .output()
            .ok()
            .and_then(|o| {
                String::from_utf8(o.stdout)
                    .ok()
                    .map(|s| s.trim().to_string())
            })
            .unwrap_or_else(|| "gal".to_string())
    } else {
        String::new()
    };

    let binary_version = if binary_found {
        Command::new("gal")
            .arg("--version")
            .output()
            .ok()
            .and_then(|o| String::from_utf8(o.stdout).ok())
            .map(|s| s.trim().to_string())
            .unwrap_or_else(|| "unknown".to_string())
    } else {
        String::new()
    };

    if !binary_found {
        issues.push("gal binary not found in PATH".to_string());
    }

    // ---- Check 2: Claude Code settings.json ----
    let settings_exists = claude_settings_path().exists();
    let sync_registered = is_hook_registered("SessionStart", "gal-sync-reminder");
    let report_registered = is_hook_registered("Stop", "gal-usage-report");
    let capture_registered = is_hook_registered("Stop", CAPTURE_HOOK_KEYWORD);

    if !settings_exists {
        // Not necessarily an issue — settings may not exist yet
        issues.push("~/.claude/settings.json not found".to_string());
    } else {
        let sync_file_ok = gal_sync_hook_path().exists();
        let report_file_ok = gal_report_hook_path().exists();

        if sync_registered && !sync_file_ok {
            issues.push(format!(
                "SessionStart hook registered in settings but hook script missing at {}",
                gal_sync_hook_path().display()
            ));
        }
        if !sync_registered && sync_file_ok {
            issues.push(format!(
                "SessionStart hook file exists but not registered in settings.json"
            ));
        }
        if report_registered && !report_file_ok {
            issues.push(format!(
                "Stop hook registered in settings but hook script missing at {}",
                gal_report_hook_path().display()
            ));
        }
        if !report_registered && report_file_ok {
            issues.push(format!(
                "Stop hook file exists but not registered in settings.json"
            ));
        }

        // Check version drift
        if sync_file_ok {
            if let Some(version) = extract_hook_version(&gal_sync_hook_path()) {
                if version != HOOK_VERSION {
                    issues.push(format!(
                        "SessionStart hook version mismatch: expected {}, found {}",
                        HOOK_VERSION, version
                    ));
                }
            } else {
                issues.push("SessionStart hook file missing version marker".to_string());
            }
        }
        if report_file_ok {
            if let Some(version) = extract_hook_version(&gal_report_hook_path()) {
                if version != HOOK_VERSION {
                    issues.push(format!(
                        "Stop hook version mismatch: expected {}, found {}",
                        HOOK_VERSION, version
                    ));
                }
            } else {
                issues.push("Stop hook file missing version marker".to_string());
            }
        }
    }

    // ---- Check 2b: capture-session Stop hook ----
    if settings_exists && !capture_registered {
        issues.push(format!(
            "Stop capture hook (`{}` / gal capture-session) not registered in settings.json",
            CAPTURE_HOOK_KEYWORD
        ));
    }

    // ---- Check 3: Rules file ----
    let rules_ok = gal_rules_path().exists();
    if !rules_ok {
        issues.push("GAL CLI rules file not installed".to_string());
    }

    // ---- Output ----
    let claude_sync_ok = sync_registered && gal_sync_hook_path().exists();
    let claude_report_ok = report_registered && gal_report_hook_path().exists();

    if json_output {
        let report = DoctorReportJson {
            binary_found,
            binary_path,
            binary_version,
            claude_sync_hook_ok: claude_sync_ok,
            claude_report_hook_ok: claude_report_ok,
            claude_rules_ok: rules_ok,
            issues,
        };
        println!("{}", serde_json::to_string_pretty(&report)?);
        return Ok(());
    }

    println!();
    println!("{}", "GAL Hooks Doctor".cyan().bold());
    println!();

    // Binary status
    println!("{}", "Binary:".bold());
    if binary_found {
        println!(
            "  {} gal found at {} ({})",
            "\u{2713}".green(),
            binary_path,
            binary_version
        );
    } else {
        println!("  {} gal not found in PATH", "x".red());
        issues.push("gal binary not found".to_string());
    }
    println!();

    // Claude Code status
    println!("{}", "Claude Code:".bold());
    println!(
        "  {} SessionStart hook: {}",
        if claude_sync_ok {
            "\u{2713}".green()
        } else {
            "x".red()
        },
        if sync_registered && gal_sync_hook_path().exists() {
            let v = extract_hook_version(&gal_sync_hook_path())
                .unwrap_or_else(|| "unknown".to_string());
            format!("registered + file present (v{})", v)
        } else if sync_registered {
            "registered but file missing".yellow().to_string()
        } else if gal_sync_hook_path().exists() {
            "file present but not registered".yellow().to_string()
        } else {
            "not installed".dimmed().to_string()
        }
    );
    println!(
        "  {} Stop usage hook: {}",
        if claude_report_ok {
            "\u{2713}".green()
        } else {
            "x".red()
        },
        if report_registered && gal_report_hook_path().exists() {
            let v = extract_hook_version(&gal_report_hook_path())
                .unwrap_or_else(|| "unknown".to_string());
            format!("registered + file present (v{})", v)
        } else if report_registered {
            "registered but file missing".yellow().to_string()
        } else if gal_report_hook_path().exists() {
            "file present but not registered".yellow().to_string()
        } else {
            "not installed".dimmed().to_string()
        }
    );
    println!(
        "  {} Stop capture hook: {}",
        if capture_registered {
            "\u{2713}".green()
        } else {
            "x".red()
        },
        if capture_registered {
            format!("registered ({} -> gal capture-session)", CAPTURE_HOOK_KEYWORD)
        } else {
            "not installed".dimmed().to_string()
        }
    );
    println!(
        "  {} GAL CLI rules: {}",
        if rules_ok { "\u{2713}".green() } else { "x".red() },
        if rules_ok {
            "installed".green().to_string()
        } else {
            "not installed".dimmed().to_string()
        }
    );
    println!();

    // Issues
    if issues.is_empty() {
        println!("  {}", "No issues found. All hooks OK.".green());
    } else {
        println!("{}", "Issues found:".yellow().bold());
        for issue in &issues {
            println!("  {} {}", "x".red(), issue);
        }
    }

    if !issues.is_empty() {
        println!();
        println!("  {}", "Run `gal hooks install` to fix issues.".yellow());
    }
    println!();

    Ok(())
}

// =============================================================================
// Pre-commit — install/uninstall git pre-commit hook for test file checking
// =============================================================================

async fn cmd_pre_commit(install: bool, uninstall: bool, repo_path: &str) -> Result<()> {
    if install && uninstall {
        anyhow::bail!("Cannot use both --install and --uninstall at the same time");
    }

    let git_dir = std::path::Path::new(repo_path).join(".git");
    if !git_dir.exists() && !git_dir.is_file() {
        anyhow::bail!(
            "Not a git repository: {}\nRun this from a git project root.",
            repo_path
        );
    }

    let hooks_dir = git_dir.join("hooks");
    let pre_commit_path = hooks_dir.join("pre-commit");

    if uninstall {
        if !pre_commit_path.exists() {
            println!();
            println!("  No pre-commit hook found.");
            println!();
            return Ok(());
        }

        let content = std::fs::read_to_string(&pre_commit_path)?;
        if !content.contains(PRE_COMMIT_MARKER) {
            println!();
            println!(
                "  {} Pre-commit hook exists but was not installed by GAL. Skipping.",
                "!".yellow()
            );
            println!();
            return Ok(());
        }

        std::fs::remove_file(&pre_commit_path)?;
        println!();
        println!("  {} Pre-commit hook removed.", "\u{2713}".green());
        println!();
        return Ok(());
    }

    if install {
        // Create hooks directory if needed
        std::fs::create_dir_all(&hooks_dir)?;

        // Check for existing hook
        let pre_commit_content = if pre_commit_path.exists() {
            let existing = std::fs::read_to_string(&pre_commit_path)?;
            if existing.contains(PRE_COMMIT_MARKER) {
                println!();
                println!("  {} Pre-commit hook already installed.", "\u{25CB}".dimmed());
                println!();
                return Ok(());
            }
            // Append to existing non-GAL hook
            println!();
            println!(
                "  {} Existing pre-commit hook found. Appending GAL SDLC check.",
                "!".yellow()
            );
            format!("{}\n\n{}", existing, PRE_COMMIT_CONTENT)
        } else {
            PRE_COMMIT_CONTENT.to_string()
        };

        std::fs::write(&pre_commit_path, pre_commit_content.as_bytes())?;

        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&pre_commit_path, std::fs::Permissions::from_mode(0o755))
                .map_err(|e| anyhow::anyhow!("Failed to set permissions: {}", e))?;
        }

        println!("  {} Pre-commit hook installed.", "\u{2713}".green());
        println!("    {}", pre_commit_path.display().to_string().dimmed());
        println!();
        println!("  {}", "Warns about missing test files on commit.".dimmed());
        println!("  {}", "Skip with: git commit --no-verify".dimmed());
        println!();
        return Ok(());
    }

    // No flag: show status
    println!();
    if pre_commit_path.exists() {
        let content = std::fs::read_to_string(&pre_commit_path)?;
        if content.contains(PRE_COMMIT_MARKER) {
            println!(
                "  {} GAL SDLC pre-commit hook is installed.",
                "\u{2713}".green()
            );
            println!("    {}", pre_commit_path.display().to_string().dimmed());
        } else {
            println!(
                "  {} A pre-commit hook exists but was not installed by GAL.",
                "!".yellow()
            );
        }
    } else {
        println!("  {} No pre-commit hook installed.", "\u{25CB}".dimmed());
        println!(
            "  {}",
            "Run `gal hooks pre-commit --install` to install.".dimmed()
        );
    }
    println!();

    Ok(())
}
