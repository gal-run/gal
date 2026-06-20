use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct PolicyArgs {
    #[command(subcommand)]
    pub command: PolicyCommands,
}

#[derive(Subcommand)]
pub enum PolicyCommands {
    /// List policies
    List {
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// Create a new policy
    Create {
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Policy name
        name: String,
        /// Policy content (JSON string)
        content: String,
    },
    /// Update a policy
    Update {
        /// Policy ID
        id: String,
        /// New policy content (JSON string)
        content: String,
    },
    /// Delete a policy
    Delete {
        /// Policy ID
        id: String,
    },
}

pub async fn run(client: ApiClient, args: PolicyArgs) -> Result<()> {
    match args.command {
        PolicyCommands::List { org, json } => cmd_list(client, org, json).await,
        PolicyCommands::Create {
            org,
            name,
            content,
        } => cmd_create(client, org, &name, &content).await,
        PolicyCommands::Update { id, content } => cmd_update(client, &id, &content).await,
        PolicyCommands::Delete { id } => cmd_delete(client, &id).await,
    }
}

async fn cmd_list(client: ApiClient, org: Option<String>, json: bool) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Fetching policies for {}...", org));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client
        .get::<serde_json::Value>(&format!("/policies?org={}", org))
        .await
    {
        Ok(policies) => {
            spinner.finish_and_clear();

            if json {
                println!("{}", serde_json::to_string_pretty(&policies)?);
                return Ok(());
            }

            let empty = Vec::new();
            // governance-svc returns an envelope: {"policies": [...], "total": N}
            let items = policies
                .get("policies")
                .and_then(|v| v.as_array())
                .unwrap_or(&empty);
            println!(
                "\n{} Policies for {} ({})",
                "Policies:".blue().bold(),
                org.bold(),
                items.len()
            );
            println!("{}", "─".repeat(60).dimmed());

            for policy in items {
                let id = policy.get("id").and_then(|v| v.as_str()).unwrap_or("—");
                let name = policy.get("name").and_then(|v| v.as_str()).unwrap_or("unknown");
                let enabled = policy.get("isActive").and_then(|v| v.as_bool()).unwrap_or(false);
                let icon = if enabled { "✓".green() } else { "✗".red() };
                println!("  {} {} [{}] {}", icon, name.white(), id.dimmed(), if enabled { "enabled" } else { "disabled" });
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to list policies: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_create(
    client: ApiClient,
    org: Option<String>,
    name: &str,
    content: &str,
) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let parsed_content: serde_json::Value = serde_json::from_str(content)
        .map_err(|e| anyhow!("Invalid JSON content: {}", e))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Creating policy '{}'...", name));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    // governance-svc expects {name, rules:<string>}; it reads org from the JWT.
    // `rules` is stored as a JSON string, so serialize the parsed content object.
    let body = serde_json::json!({
        "org": org,
        "name": name,
        "rules": parsed_content.to_string(),
    });

    match client
        .post::<serde_json::Value>("/policies", Some(&body))
        .await
    {
        Ok(result) => {
            spinner.finish_with_message(format!("{} Policy created!", "✓".green()));
            if let Some(id) = result.get("id").and_then(|v| v.as_str()) {
                println!("  ID:   {}", id.cyan());
            }
            println!("  Name: {}", name);
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to create policy: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_update(client: ApiClient, id: &str, content: &str) -> Result<()> {
    let parsed_content: serde_json::Value = serde_json::from_str(content)
        .map_err(|e| anyhow!("Invalid JSON content: {}", e))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Updating policy {}...", id));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    // governance-svc routes PATCH /policies/{id} and expects {rules:<string>}.
    let body = serde_json::json!({
        "rules": parsed_content.to_string(),
    });

    match client
        .patch::<serde_json::Value>(&format!("/policies/{}", id), Some(&body))
        .await
    {
        Ok(result) => {
            spinner.finish_with_message(format!("{} Policy {} updated!", "✓".green(), id));
            if let Some(name) = result.get("name").and_then(|v| v.as_str()) {
                println!("  Name: {}", name);
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to update policy: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_delete(client: ApiClient, id: &str) -> Result<()> {
    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Deleting policy {}...", id));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client.delete(&format!("/policies/{}", id)).await {
        Ok(()) => {
            spinner.finish_with_message(format!("{} Policy {} deleted", "✓".green(), id));
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to delete policy: {}", "✗".red(), e);
        }
    }

    Ok(())
}
