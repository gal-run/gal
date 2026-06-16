use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct FetchArgs {
    #[command(subcommand)]
    pub command: FetchCommands,
}

#[derive(Subcommand)]
pub enum FetchCommands {
    /// Fetch approved config
    Config {
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Platform (default: claude)
        #[arg(long, default_value = "claude")]
        platform: String,
        /// Output as JSON
        #[arg(long)]
        json: bool,
        /// Output file
        #[arg(long)]
        output: Option<String>,
    },
    /// Fetch logs
    Logs {
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Session ID (optional)
        #[arg(long)]
        session: Option<String>,
        /// Limit results
        #[arg(long, default_value = "100")]
        limit: u64,
    },
}

pub async fn run(client: ApiClient, args: FetchArgs) -> Result<()> {
    match args.command {
        FetchCommands::Config {
            org,
            platform,
            json,
            output,
        } => cmd_config(client, org, &platform, json, output).await,
        FetchCommands::Logs {
            org,
            session,
            limit,
        } => cmd_logs(client, org, session, limit).await,
    }
}

async fn cmd_config(
    client: ApiClient,
    org: Option<String>,
    platform: &str,
    json: bool,
    output: Option<String>,
) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Fetching config for {}...", org));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client.get_approved_config(&org, platform).await {
        Ok(approved) => {
            spinner.finish_and_clear();

            if let Some(path) = output {
                let content = serde_json::to_string_pretty(&approved)?;
                std::fs::write(&path, &content)
                    .map_err(|e| anyhow!("Failed to write output: {}", e))?;
                println!("{} Config written to {}", "✓".green(), path.cyan());
                println!();
                return Ok(());
            }

            if json {
                println!("{}", serde_json::to_string_pretty(&approved)?);
                return Ok(());
            }

            println!("\n{} Config for {} ({})", "Config:".blue().bold(), org.bold(), platform.cyan());
            println!("{}", "─".repeat(50).dimmed());
            println!("{}", serde_json::to_string_pretty(&approved)?);
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Fetch failed: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_logs(
    client: ApiClient,
    org: Option<String>,
    session: Option<String>,
    limit: u64,
) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Fetching logs for {}...", org));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    let mut body = serde_json::json!({
        "org": org,
        "limit": limit,
    });
    if let Some(s) = session {
        body["session_id"] = serde_json::json!(s);
    }

    match client
        .post::<serde_json::Value>("/audit-log/query", Some(&body))
        .await
    {
        Ok(logs) => {
            spinner.finish_and_clear();

            let empty = Vec::new();
            let entries = logs.as_array().unwrap_or(&empty);
            println!("\n{} Logs for {} ({})", "Logs:".blue().bold(), org.bold(), entries.len());
            println!("{}", "─".repeat(80).dimmed());

            for entry in entries {
                let ts = entry.get("timestamp").and_then(|v| v.as_str()).unwrap_or("—");
                let level = entry.get("level").and_then(|v| v.as_str()).unwrap_or("INFO");
                let msg = entry.get("message").and_then(|v| v.as_str()).unwrap_or("");

                let level_color = match level {
                    "ERROR" => level.red(),
                    "WARN" => level.yellow(),
                    "INFO" => level.green(),
                    _ => level.dimmed(),
                };

                println!("  {} [{}] {}", ts.dimmed(), level_color, msg);
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Fetch logs failed: {}", "✗".red(), e);
        }
    }

    Ok(())
}
