use anyhow::Result;
use clap::{Parser, Subcommand};
use colored::*;

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
}

pub async fn run(client: ApiClient, args: ProtectArgs) -> Result<()> {
    match args.command {
        ProtectCommands::List { json } => cmd_list(client, json).await,
        ProtectCommands::Check { path } => cmd_check(client, &path).await,
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
