use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct OpsArgs {
    #[command(subcommand)]
    pub command: OpsCommands,
}

#[derive(Subcommand)]
pub enum OpsCommands {
    /// List organizations
    Orgs {
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// List sessions
    Sessions {
        /// Filter by status
        #[arg(long)]
        status: Option<String>,
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
}

pub async fn run(client: ApiClient, args: OpsArgs) -> Result<()> {
    match args.command {
        OpsCommands::Orgs { json } => cmd_orgs(client, json).await,
        OpsCommands::Sessions {
            status,
            org,
            json,
        } => cmd_sessions(client, status, org, json).await,
    }
}

async fn cmd_orgs(client: ApiClient, json: bool) -> Result<()> {
    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Fetching organizations...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client.get_organizations().await {
        Ok(orgs) => {
            spinner.finish_and_clear();

            if json {
                println!("{}", serde_json::to_string_pretty(&orgs)?);
                return Ok(());
            }

            println!("\n{} Organizations ({})", "Organizations:".blue().bold(), orgs.len());
            println!("{}", "─".repeat(50).dimmed());

            for org in &orgs {
                let name = org.get("name").and_then(|v| v.as_str()).unwrap_or("unknown");
                let plan = org.get("plan_tier").and_then(|v| v.as_str()).unwrap_or("free");
                println!("  {} {} ({})", "•".cyan(), name.white(), plan);
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to list orgs: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_sessions(
    client: ApiClient,
    status: Option<String>,
    org: Option<String>,
    json: bool,
) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let _org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Fetching sessions...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client
        .list_sessions(status.as_deref(), Some(50), None)
        .await
    {
        Ok(response) => {
            spinner.finish_and_clear();

            if json {
                println!("{}", serde_json::to_string_pretty(&response)?);
                return Ok(());
            }

            println!("\n{} ({})", "Sessions:".blue().bold(), response.sessions.len());
            println!("{}", "─".repeat(70).dimmed());

            for session in &response.sessions {
                let status_display = match session.status.as_str() {
                    "running" => session.status.green(),
                    "completed" => session.status.dimmed(),
                    "failed" => session.status.red(),
                    "pending" => session.status.yellow(),
                    _ => session.status.dimmed(),
                };
                let name = session.name.as_deref().unwrap_or("(unnamed)");
                println!(
                    "  {} {} [{}] {}",
                    "•".cyan(),
                    session.id.dimmed(),
                    status_display,
                    name
                );
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to list sessions: {}", "✗".red(), e);
        }
    }

    Ok(())
}
