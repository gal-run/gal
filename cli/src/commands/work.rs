use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct WorkArgs {
    #[command(subcommand)]
    pub command: WorkCommands,
}

#[derive(Subcommand)]
pub enum WorkCommands {
    /// List work items
    List {
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Filter by status
        #[arg(long)]
        status: Option<String>,
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// Create a work item
    Create {
        /// Title/command
        command: String,
        /// Priority (1-5)
        #[arg(long, default_value = "3")]
        priority: i64,
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Context
        #[arg(long)]
        context: Option<String>,
    },
    /// Update a work item
    Update {
        /// Work item ID
        id: String,
        /// New status
        #[arg(long)]
        status: Option<String>,
        /// New priority
        #[arg(long)]
        priority: Option<i64>,
    },
}

pub async fn run(client: ApiClient, args: WorkArgs) -> Result<()> {
    match args.command {
        WorkCommands::List { org, status, json } => cmd_list(client, org, status, json).await,
        WorkCommands::Create {
            command,
            priority,
            org,
            context,
        } => cmd_create(client, &command, priority, org, context).await,
        WorkCommands::Update { id, status, priority } => cmd_update(client, &id, status, priority).await,
    }
}

async fn cmd_list(
    client: ApiClient,
    org: Option<String>,
    status: Option<String>,
    json: bool,
) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Fetching work items...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    let mut path = format!("/work-items?org={}", org);
    if let Some(s) = status {
        path.push_str(&format!("&status={}", s));
    }

    match client.get::<serde_json::Value>(&path).await {
        Ok(response) => {
            spinner.finish_and_clear();

            if json {
                println!("{}", serde_json::to_string_pretty(&response)?);
                return Ok(());
            }

            let empty = Vec::new();
            let items = response
                .get("workItems")
                .and_then(|v| v.as_array())
                .unwrap_or(&empty);
            println!(
                "\n{} for {} ({})",
                "Work Items".blue().bold(),
                org.bold(),
                items.len()
            );
            println!("{}", "─".repeat(70).dimmed());

            for item in items {
                let id = item.get("id").and_then(|v| v.as_str()).unwrap_or("—");
                let cmd = item.get("command").and_then(|v| v.as_str()).unwrap_or("");
                let item_status = item.get("status").and_then(|v| v.as_str()).unwrap_or("unknown");
                let priority = item.get("priority").and_then(|v| v.as_i64()).unwrap_or(3);

                let status_color = match item_status {
                    "pending" => item_status.yellow(),
                    "running" => item_status.green(),
                    "completed" => item_status.dimmed(),
                    "failed" => item_status.red(),
                    "cancelled" => item_status.dimmed(),
                    _ => item_status.dimmed(),
                };

                let priority_str = match priority {
                    1 => "P1".red(),
                    2 => "P2".yellow(),
                    3 => "P3".white(),
                    4 => "P4".dimmed(),
                    _ => format!("P{}", priority).dimmed(),
                };

                println!(
                    "  {} {} [{}][{}] {}",
                    "•".cyan(),
                    id.dimmed(),
                    status_color,
                    priority_str,
                    cmd
                );
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to list work items: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_create(
    client: ApiClient,
    command: &str,
    priority: i64,
    org: Option<String>,
    context: Option<String>,
) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Creating work item...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    let body = serde_json::json!({
        "org": org,
        "command": command,
        "priority": priority,
        "context": context,
    });

    match client
        .post::<serde_json::Value>(
            "/work-items",
            Some(&body),
        )
        .await
    {
        Ok(result) => {
            spinner.finish_with_message(format!("{} Work item created!", "✓".green()));

            if let Some(id) = result.get("id").and_then(|v| v.as_str()) {
                println!("  ID:       {}", id.cyan());
            }
            println!("  Command:  {}", command);
            let priority_str = match priority {
                1 => "P1 (Critical)".red(),
                2 => "P2 (High)".yellow(),
                3 => "P3 (Normal)".white(),
                _ => format!("P{}", priority).dimmed(),
            };
            println!("  Priority: {}", priority_str);
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to create work item: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_update(
    client: ApiClient,
    id: &str,
    status: Option<String>,
    priority: Option<i64>,
) -> Result<()> {
    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Updating work item {}...", id));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    let mut body = serde_json::json!({});
    if let Some(s) = status {
        body["status"] = serde_json::json!(s);
    }
    if let Some(p) = priority {
        body["priority"] = serde_json::json!(p);
    }

    match client
        .patch::<serde_json::Value>(&format!("/work-items/{}", id), Some(&body))
        .await
    {
        Ok(result) => {
            spinner.finish_with_message(format!("{} Work item {} updated!", "✓".green(), id));

            if let Some(new_status) = result.get("status").and_then(|v| v.as_str()) {
                println!("  Status:   {}", new_status);
            }
            if let Some(new_priority) = result.get("priority").and_then(|v| v.as_i64()) {
                println!("  Priority: {}", new_priority);
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to update work item: {}", "✗".red(), e);
        }
    }

    Ok(())
}
