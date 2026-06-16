use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct WorkspaceArgs {
    #[command(subcommand)]
    pub command: WorkspaceCommands,
}

#[derive(Subcommand)]
pub enum WorkspaceCommands {
    /// List workspaces
    List {
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// Create a workspace
    Create {
        /// Workspace name
        name: String,
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Description
        #[arg(long)]
        description: Option<String>,
    },
}

pub async fn run(client: ApiClient, args: WorkspaceArgs) -> Result<()> {
    match args.command {
        WorkspaceCommands::List { org, json } => cmd_list(client, org, json).await,
        WorkspaceCommands::Create {
            name,
            org,
            description,
        } => cmd_create(client, &name, org, description).await,
    }
}

async fn cmd_list(client: ApiClient, org: Option<String>, json: bool) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Fetching workspaces...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client
        .get::<serde_json::Value>(&format!("/workspaces?org={}", org))
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
                .get("workspaces")
                .and_then(|v| v.as_array())
                .unwrap_or(&empty);
            println!(
                "\n{} Workspaces for {} ({})",
                "Workspaces:".blue().bold(),
                org.bold(),
                items.len()
            );
            println!("{}", "─".repeat(60).dimmed());

            for ws in items {
                let name = ws.get("name").and_then(|v| v.as_str()).unwrap_or("unknown");
                let id = ws.get("id").and_then(|v| v.as_str()).unwrap_or("—");
                let ws_status = ws.get("status").and_then(|v| v.as_str()).unwrap_or("active");
                let status_icon = if ws_status == "active" { "✓".green() } else { "○".dimmed() };
                println!("  {} {} [{}] ({})", status_icon, name.white(), id.dimmed(), ws_status);
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to list workspaces: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_create(
    client: ApiClient,
    name: &str,
    org: Option<String>,
    description: Option<String>,
) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Creating workspace '{}'...", name));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    let body = serde_json::json!({
        "org": org,
        "name": name,
        "description": description,
    });

    match client
        .post::<serde_json::Value>(
            "/workspaces",
            Some(&body),
        )
        .await
    {
        Ok(result) => {
            spinner.finish_with_message(format!("{} Workspace created!", "✓".green()));

            if let Some(id) = result.get("id").and_then(|v| v.as_str()) {
                println!("  ID:   {}", id.cyan());
            }
            println!("  Name: {}", name);
            if let Some(desc) = &description {
                println!("  Desc: {}", desc);
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to create workspace: {}", "✗".red(), e);
        }
    }

    Ok(())
}
