use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct ApproveArgs {
    #[command(subcommand)]
    pub command: ApproveCommands,
}

#[derive(Subcommand)]
pub enum ApproveCommands {
    /// List pending approval proposals
    List {
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// Get proposal details
    Get {
        /// Proposal ID
        id: String,
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// Approve a proposal
    Set {
        /// Proposal ID
        id: String,
        /// Organization name
        #[arg(long)]
        org: Option<String>,
    },
}

pub async fn run(client: ApiClient, args: ApproveArgs) -> Result<()> {
    match args.command {
        ApproveCommands::List { org, json } => cmd_list(client, org, json).await,
        ApproveCommands::Get { id, json } => cmd_get(client, &id, json).await,
        ApproveCommands::Set { id, org } => cmd_approve(client, &id, org).await,
    }
}

async fn cmd_list(client: ApiClient, org: Option<String>, json: bool) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Fetching proposals...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client
        .get::<serde_json::Value>(&format!("/proposals?org={}", org))
        .await
    {
        Ok(proposals) => {
            spinner.finish_and_clear();

            if json {
                println!("{}", serde_json::to_string_pretty(&proposals)?);
                return Ok(());
            }

            let empty = Vec::new();
            let items = proposals.as_array().unwrap_or(&empty);
            println!(
                "\n{} Proposals for {} ({})",
                "Proposals:".blue().bold(),
                org.bold(),
                items.len()
            );
            println!("{}", "─".repeat(70).dimmed());

            for proposal in items {
                let id = proposal.get("id").and_then(|v| v.as_str()).unwrap_or("—");
                let status = proposal
                    .get("status")
                    .and_then(|v| v.as_str())
                    .unwrap_or("unknown");
                let desc = proposal
                    .get("description")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

                let status_color = match status {
                    "pending" => status.yellow(),
                    "approved" => status.green(),
                    "rejected" => status.red(),
                    _ => status.dimmed(),
                };

                println!("  {} [{}] {}", id.dimmed(), status_color, desc);
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to list proposals: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_get(client: ApiClient, id: &str, json: bool) -> Result<()> {
    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Fetching proposal {}...", id));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client
        .get::<serde_json::Value>(&format!("/proposals/{}", id))
        .await
    {
        Ok(proposal) => {
            spinner.finish_and_clear();

            if json {
                println!("{}", serde_json::to_string_pretty(&proposal)?);
                return Ok(());
            }

            let prop_id = proposal.get("id").and_then(|v| v.as_str()).unwrap_or(id);
            let status = proposal
                .get("status")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            let desc = proposal
                .get("description")
                .and_then(|v| v.as_str())
                .unwrap_or("(no description)");

            println!("\n{} Proposal {}", "Proposal:".blue().bold(), prop_id);
            println!("{}", "─".repeat(50).dimmed());
            println!("  Status:      {}", status);
            println!("  Description: {}", desc);

            if let Some(content) = proposal.get("content") {
                println!("  Content:     {}", serde_json::to_string_pretty(content)?);
            }
            if let Some(created) = proposal.get("created_at").and_then(|v| v.as_str()) {
                println!("  Created:     {}", created);
            }
            if let Some(author) = proposal.get("author").and_then(|v| v.as_str()) {
                println!("  Author:      {}", author);
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to get proposal: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_approve(client: ApiClient, id: &str, org: Option<String>) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Approving proposal {}...", id));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client
        .post::<serde_json::Value>(
            &format!("/proposals/{}/approve", id),
            Some(&serde_json::json!({ "org": org })),
        )
        .await
    {
        Ok(result) => {
            spinner.finish_with_message(format!("{} Proposal {} approved!", "✓".green(), id));

            let status = result.get("status").and_then(|v| v.as_str()).unwrap_or("approved");
            println!("  Status: {}", status.green());
            if let Some(hash) = result.get("hash").and_then(|v| v.as_str()) {
                println!("  Hash:   {}", hash.dimmed());
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to approve proposal: {}", "✗".red(), e);
        }
    }

    Ok(())
}
