use anyhow::Result;
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct DiscoverArgs {
    #[command(subcommand)]
    pub command: DiscoverCommands,
}

#[derive(Subcommand)]
pub enum DiscoverCommands {
    /// Scan repos for AI configs
    Scan {
        /// Organization name
        #[arg(long)]
        org: Option<String>,
    },
    /// List discovered configs
    List {
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
}

pub async fn run(client: ApiClient, args: DiscoverArgs) -> Result<()> {
    match args.command {
        DiscoverCommands::Scan { org } => cmd_scan(client, org).await,
        DiscoverCommands::List { org, json } => cmd_list(client, org, json).await,
    }
}

async fn cmd_scan(client: ApiClient, org: Option<String>) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow::anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Scanning repos for AI configs in {}...", org));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client
        .post::<serde_json::Value>(
            "/discovery",
            Some(&serde_json::json!({"org": org})),
        )
        .await
    {
        Ok(result) => {
            spinner.finish_with_message(format!("{} Scan complete!", "✓".green()));
            let found = result.get("found").and_then(|v| v.as_u64()).unwrap_or(0);
            let new = result.get("new").and_then(|v| v.as_u64()).unwrap_or(0);
            println!("  Repos scanned: {}", found);
            println!("  New configs discovered: {}", new);
            if let Some(configs) = result.get("configs").and_then(|v| v.as_array()) {
                for cfg in configs {
                    if let Some(repo) = cfg.get("repo").and_then(|v| v.as_str()) {
                        println!("  {} {}", "•".cyan(), repo);
                    }
                }
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Scan failed: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_list(client: ApiClient, org: Option<String>, json: bool) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow::anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Fetching repos...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client
        .get::<serde_json::Value>(&format!("/repos?org={}", org))
        .await
    {
        Ok(response) => {
            spinner.finish_and_clear();

            if json {
                println!("{}", serde_json::to_string_pretty(&response)?);
                return Ok(());
            }

            let empty = Vec::new();
            let items = response
                .get("repos")
                .and_then(|v| v.as_array())
                .unwrap_or(&empty);
            println!("\n{} discovered repos for {}", "Repos:".blue().bold(), org.bold());
            println!("{}", "─".repeat(60).dimmed());

            for repo in items {
                let name = repo.get("name").and_then(|v| v.as_str()).unwrap_or("unknown");
                let config_count = repo.get("config_count").and_then(|v| v.as_u64()).unwrap_or(0);
                let status = repo
                    .get("scan_status")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                let status_color = match status {
                    "scanned" => status.green(),
                    "pending" => status.yellow(),
                    "error" => status.red(),
                    _ => status.dimmed(),
                };
                println!(
                    "  {} {} ({} configs) [{}]",
                    "•".cyan(),
                    name.white(),
                    config_count,
                    status_color,
                );
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to list repos: {}", "✗".red(), e);
        }
    }

    Ok(())
}
