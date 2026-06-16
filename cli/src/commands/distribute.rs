use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct DistributeArgs {
    #[command(subcommand)]
    pub command: DistributeCommands,
}

#[derive(Subcommand)]
pub enum DistributeCommands {
    /// Distribute configs across the organization
    Push {
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Platform (claude, cursor, etc.)
        #[arg(long, default_value = "claude")]
        platform: String,
        /// Force redistribution
        #[arg(long)]
        force: bool,
    },
}

pub async fn run(client: ApiClient, args: DistributeArgs) -> Result<()> {
    match args.command {
        DistributeCommands::Push {
            org,
            platform,
            force,
        } => cmd_push(client, org, &platform, force).await,
    }
}

async fn cmd_push(
    client: ApiClient,
    org: Option<String>,
    platform: &str,
    force: bool,
) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Distributing {} configs across {}...", platform, org));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    let body = serde_json::json!({
        "org": org,
        "platform": platform,
        "force": force,
    });

    match client
        .post::<serde_json::Value>(
            "/config-repo/sync/pull",
            Some(&body),
        )
        .await
    {
        Ok(result) => {
            spinner.finish_with_message(format!("{} Distribution complete!", "✓".green()));

            let repos = result
                .get("repos")
                .and_then(|v| v.as_array())
                .map(|a| a.len())
                .unwrap_or(0);
            let updated = result
                .get("updated")
                .and_then(|v| v.as_u64())
                .unwrap_or(0);

            println!("  Organization: {}", org.bold());
            println!("  Platform:     {}", platform);
            println!("  Repos:        {}", repos);
            println!("  Updated:      {}", updated);

            if let Some(details) = result.get("details").and_then(|v| v.as_array()) {
                for detail in details {
                    let repo = detail.get("repo").and_then(|v| v.as_str()).unwrap_or("unknown");
                    let status = detail.get("status").and_then(|v| v.as_str()).unwrap_or("?");
                    println!("  {} {} -> {}", "•".cyan(), repo, status);
                }
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Distribution failed: {}", "✗".red(), e);
        }
    }

    Ok(())
}
