use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use colored::*;
use std::io::Read;
use std::path::{Path, PathBuf};

use crate::client::ApiClient;

#[derive(Parser)]
pub struct ProtectArgs {
    #[command(subcommand)]
    pub command: ProtectCommands,
}

#[derive(Subcommand)]
pub enum ProtectCommands {
    /// List protection/guard rules
    List {
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// Check if a path is protected
    Check {
        /// Path to check
        path: String,
    },
    /// Add a deny rule that blocks a command pattern at AI-agent tool-call time
    ///
    /// Compiles the rule into a Claude Code PreToolUse hook so the agent is
    /// stopped *before* the command runs — unlike a git hook, which an agent
    /// can bypass with `--no-verify`.
    Add {
        /// Command substring to deny (e.g. "--no-verify", "git push origin main")
        #[arg(long)]
        deny: String,
        /// Human-readable reason surfaced to the agent when the rule fires
        #[arg(long)]
        reason: Option<String>,
    },
    /// PreToolUse hook handler: evaluate a Claude Code tool call from stdin (internal)
    #[command(hide = true)]
    Handle {
        /// Path to the compiled rule set JSON
        #[arg(long)]
        rules: PathBuf,
    },
}

pub async fn run(client: ApiClient, args: ProtectArgs) -> Result<()> {
    match args.command {
        ProtectCommands::List { json } => cmd_list(client, json).await,
        ProtectCommands::Check { path } => cmd_check(client, &path).await,
        ProtectCommands::Add { deny, reason } => cmd_add(&deny, reason.as_deref()),
        ProtectCommands::Handle { rules } => cmd_handle(&rules),
    }
}

async fn cmd_list(client: ApiClient, json: bool) -> Result<()> {
    // List from enforce_rules module constants
    let blocked_tools: Vec<&str> = crate::enforce_rules::BLOCKED_TOOLS.to_vec();
    let blocked_bash: Vec<&str> = crate::enforce_rules::BLOCKED_BASH_PATTERNS.to_vec();
    let always_allowed: Vec<&str> = crate::enforce_rules::ALWAYS_ALLOWED_TOOLS.to_vec();

    if json {
        let data = serde_json::json!({
            "blocked_tools": blocked_tools,
            "blocked_bash_patterns": blocked_bash,
            "always_allowed_tools": always_allowed,
        });
        println!("{}", serde_json::to_string_pretty(&data)?);
        return Ok(());
    }

    println!("\n{}", "Protection Rules:".blue().bold());
    println!("{}", "─".repeat(50).dimmed());
    println!("\n  {} Blocked tools:", "Blocked Tools:".bold());
    for tool in &blocked_tools {
        println!("    {} {}", "•".cyan(), tool);
    }
    println!("\n  {} Blocked bash patterns:", "Blocked Bash:".bold());
    for pattern in &blocked_bash {
        println!("    {} {}", "•".cyan(), pattern);
    }
    println!("\n  {} Always allowed:", "Always Allowed:".bold());
    for tool in &always_allowed {
        println!("    {} {}", "•".cyan(), tool);
    }
    println!();

    // Also fetch server-side if available
    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Fetching server protection rules...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client
        .get::<serde_json::Value>("/compliance-status")
        .await
    {
        Ok(compliance) => {
            spinner.finish_and_clear();
            if let Some(guards) = compliance.get("guards").and_then(|v| v.as_array()) {
                println!("{}", "Server-side Guards:".bold());
                for guard in guards {
                    let name = guard.get("name").and_then(|v| v.as_str()).unwrap_or("unknown");
                    let active = guard.get("active").and_then(|v| v.as_bool()).unwrap_or(false);
                    let icon = if active { "✓".green() } else { "✗".red() };
                    println!("  {} {}", icon, name);
                }
                println!();
            }
        }
        Err(_) => {
            spinner.finish_and_clear();
        }
    }

    Ok(())
}

async fn cmd_check(client: ApiClient, path: &str) -> Result<()> {
    // Check against blocked bash patterns
    let blocked_patterns: Vec<&str> = crate::enforce_rules::BLOCKED_BASH_PATTERNS.to_vec();
    let mut violations = Vec::new();

    for pattern in &blocked_patterns {
        if path.contains(pattern) {
            violations.push(pattern.to_string());
        }
    }

    println!("\n{} Protected path check:", "Check:".blue().bold());
    println!("  Path: {}", path.cyan());

    if violations.is_empty() {
        println!("  {} Path is clear", "✓".green());
    } else {
        println!("  {} Matched protection patterns:", "!".yellow());
        for v in &violations {
            println!("    - {}", v);
        }
    }
    println!();

    // Check server-side compliance
    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Checking server-side compliance...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client
        .get::<serde_json::Value>("/compliance-status")
        .await
    {
        Ok(compliance) => {
            spinner.finish_and_clear();
            let compliant = compliance
                .get("compliant")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            if compliant {
                println!("  {} Server: Compliant", "✓".green());
            } else {
                println!("  {} Server: Non-compliant", "✗".red());
            }
            println!();
        }
        Err(_) => {
            spinner.finish_and_clear();
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// `gal protect add --deny` — install a tool-call deny rule
// ---------------------------------------------------------------------------

fn gal_home() -> Result<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| anyhow::anyhow!("HOME environment variable is not set"))
}

fn cmd_add(deny: &str, reason: Option<&str>) -> Result<()> {
    use crate::enforcement::{CommandRule, RuleMode, RuleSet};

    if deny.trim().is_empty() {
        anyhow::bail!("--deny pattern cannot be empty");
    }

    let home = gal_home()?;
    let rules_dir = home.join(".gal").join("rules");
    let compiled_path = rules_dir.join("compiled.json");
    let settings_path = home.join(".claude").join("settings.json");

    // 1. Load the existing compiled rule set, or start from an empty one.
    let mut rule_set = if compiled_path.exists() {
        RuleSet::from_json_file(&compiled_path).unwrap_or_else(|_| RuleSet::empty())
    } else {
        RuleSet::empty()
    };

    // 2. Append the deny rule (idempotent on the match text).
    let reason = reason
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("Blocked by GAL: '{deny}' is denied for AI agents"));
    let already = rule_set.commands.iter().any(|c| c.match_ == deny);
    if !already {
        rule_set.commands.push(CommandRule {
            match_: deny.to_string(),
            mode: Some(RuleMode::Block),
            reason: reason.clone(),
            scope: Some("agent".to_string()),
        });
    }

    // 3. Persist the compiled rules (read by the handler on every tool call).
    std::fs::create_dir_all(&rules_dir)
        .with_context(|| format!("creating {}", rules_dir.display()))?;
    std::fs::write(&compiled_path, rule_set.to_json_pretty()? + "\n")
        .with_context(|| format!("writing {}", compiled_path.display()))?;

    // 4. Register the PreToolUse hook in Claude Code settings.json so the rule
    //    is enforced *before* the agent's command runs.
    let gal_bin = std::env::current_exe().context("cannot resolve the gal binary path")?;
    let cfg = crate::enforce_hooks::build_gal_hook_config(&gal_bin, &compiled_path);
    let hook_cmd = cfg.pre_tool_use[0].hooks[0].command.clone();
    register_pretooluse_hook(&settings_path, &hook_cmd)?;

    if already {
        println!("\n{} Deny rule already present — refreshed", "✓".green());
    } else {
        println!("\n{} Deny rule added", "✓".green());
    }
    println!("  Pattern : {}", deny.cyan());
    println!("  Reason  : {}", reason.dimmed());
    println!("  Scope   : AI-agent tool calls (Claude Code PreToolUse)");
    println!("  Rules   : {}", compiled_path.display().to_string().dimmed());
    println!(
        "\n  {} GAL now blocks this at tool-call time — before the command runs.",
        "→".cyan()
    );
    println!();
    Ok(())
}

/// Merge a single `gal protect handle` PreToolUse entry into Claude Code's
/// `settings.json`, replacing any prior gal-protect entry (idempotent).
fn register_pretooluse_hook(settings_path: &Path, command: &str) -> Result<()> {
    use serde_json::{json, Value};

    let mut settings: Value = if settings_path.exists() {
        serde_json::from_str(&std::fs::read_to_string(settings_path)?).unwrap_or_else(|_| json!({}))
    } else {
        json!({})
    };
    if !settings.is_object() {
        settings = json!({});
    }

    let hooks = settings
        .as_object_mut()
        .unwrap()
        .entry("hooks")
        .or_insert_with(|| json!({}));
    if !hooks.is_object() {
        *hooks = json!({});
    }
    let pre = hooks
        .as_object_mut()
        .unwrap()
        .entry("PreToolUse")
        .or_insert_with(|| json!([]));
    if !pre.is_array() {
        *pre = json!([]);
    }
    let arr = pre.as_array_mut().unwrap();

    // Drop any existing gal-protect-handle group so re-adding stays idempotent.
    arr.retain(|group| {
        group
            .get("hooks")
            .and_then(|h| h.as_array())
            .map(|inner| {
                !inner.iter().any(|h| {
                    h.get("command")
                        .and_then(|c| c.as_str())
                        .map(|s| s.contains("protect handle"))
                        .unwrap_or(false)
                })
            })
            .unwrap_or(true)
    });

    arr.push(json!({
        "matcher": "Bash",
        "hooks": [ { "type": "command", "command": command } ]
    }));

    if let Some(parent) = settings_path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("creating {}", parent.display()))?;
    }
    std::fs::write(settings_path, serde_json::to_string_pretty(&settings)? + "\n")
        .with_context(|| format!("writing {}", settings_path.display()))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// `gal protect handle` — PreToolUse hook handler (allow/deny a tool call)
// ---------------------------------------------------------------------------

fn cmd_handle(rules_path: &Path) -> Result<()> {
    use crate::enforcement::{RuleMode, RuleSet};

    // 1. Read the Claude Code PreToolUse event from stdin.
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).ok();
    let event: serde_json::Value = serde_json::from_str(&input).unwrap_or(serde_json::json!({}));

    // Command text for Bash; fall back to the whole tool_input for other tools.
    let command_text = event
        .get("tool_input")
        .and_then(|ti| ti.get("command"))
        .and_then(|c| c.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            event
                .get("tool_input")
                .map(|ti| ti.to_string())
                .unwrap_or_default()
        });

    // 2. Load rules; fail OPEN (allow silently) if the file is missing or
    //    unreadable, so a broken rules file never bricks the agent.
    let rule_set = match RuleSet::from_json_file(rules_path) {
        Ok(rs) => rs,
        Err(_) => return Ok(()),
    };

    // 3. Evaluate Block-mode command rules against the command text.
    for rule in &rule_set.commands {
        let blocks = matches!(rule.mode, Some(RuleMode::Block))
            || (rule.mode.is_none() && rule_set.mode == RuleMode::Block);
        if blocks && !rule.match_.is_empty() && command_text.contains(&rule.match_) {
            let payload = serde_json::json!({
                "hookSpecificOutput": {
                    "hookEventName": "PreToolUse",
                    "permissionDecision": "deny",
                    "permissionDecisionReason": rule.reason,
                }
            });
            println!("{}", serde_json::to_string(&payload)?);
            return Ok(());
        }
    }

    // 4. No deny matched → allow silently.
    Ok(())
}
