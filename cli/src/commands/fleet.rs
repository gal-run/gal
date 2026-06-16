use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct FleetArgs {
    #[command(subcommand)]
    pub command: FleetCommands,
}

#[derive(Subcommand)]
pub enum FleetCommands {
    /// Register this machine in the fleet
    Register {
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Machine name
        #[arg(long)]
        name: Option<String>,
        /// Machine type (runner, agent, gateway)
        #[arg(long, default_value = "runner")]
        kind: String,
    },
    /// Unregister a fleet member
    Unregister {
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Fleet member ID
        id: String,
    },
}

pub async fn run(client: ApiClient, args: FleetArgs) -> Result<()> {
    match args.command {
        FleetCommands::Register { org, name, kind } => cmd_register(client, org, name, &kind).await,
        FleetCommands::Unregister { org, id } => cmd_unregister(client, org, &id).await,
    }
}

async fn cmd_register(
    client: ApiClient,
    org: Option<String>,
    name: Option<String>,
    kind: &str,
) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let hostname = name.unwrap_or_else(|| {
        std::env::var("HOSTNAME").unwrap_or_else(|_| "unknown".to_string())
    });

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Registering {} in {}...", hostname, org));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    let body = serde_json::json!({
        "name": hostname,
        "kind": kind,
        "hostname": hostname,
    });

    match client
        .post::<serde_json::Value>(
            "/dispatch/fleet",
            Some(&body),
        )
        .await
    {
        Ok(result) => {
            spinner.finish_with_message(format!("{} Fleet member registered!", "✓".green()));

            if let Some(id) = result.get("id").and_then(|v| v.as_str()) {
                println!("  Fleet ID: {}", id.cyan());
            }
            println!("  Name:     {}", hostname);
            println!("  Kind:     {}", kind);
            println!("  Org:      {}", org.bold());
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Registration failed: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_unregister(
    client: ApiClient,
    org: Option<String>,
    id: &str,
) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Unregistering {} from {}...", id, org));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client
        .delete(&format!("/dispatch/fleet/{}", id))
        .await
    {
        Ok(()) => {
            spinner.finish_with_message(format!("{} Fleet member {} removed", "✓".green(), id));
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Unregister failed: {}", "✗".red(), e);
        }
    }

    Ok(())
}
