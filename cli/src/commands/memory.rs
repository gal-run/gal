use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct MemoryArgs {
    #[command(subcommand)]
    pub command: MemoryCommands,
}

#[derive(Subcommand)]
pub enum MemoryCommands {
    /// List shared memory entries
    List {
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// Create a memory entry
    Set {
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Memory key
        key: String,
        /// Memory value
        value: String,
    },
    /// Get a specific memory entry
    Get {
        /// Memory entry ID
        id: String,
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
}

pub async fn run(client: ApiClient, args: MemoryArgs) -> Result<()> {
    match args.command {
        MemoryCommands::List { org, json } => cmd_list(client, org, json).await,
        MemoryCommands::Set { org, key, value } => cmd_set(client, org, &key, &value).await,
        MemoryCommands::Get { id, json } => cmd_get(client, &id, json).await,
    }
}

async fn cmd_list(client: ApiClient, org: Option<String>, json: bool) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Fetching shared memory...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client
        .get::<serde_json::Value>(&format!("/memory?org={}", org))
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
                .get("memory")
                .and_then(|v| v.as_array())
                .unwrap_or(&empty);
            println!("\n{} Shared memory for {} ({})", "Memory:".blue().bold(), org.bold(), items.len());
            println!("{}", "─".repeat(60).dimmed());

            for entry in items {
                let id = entry.get("id").and_then(|v| v.as_str()).unwrap_or("—");
                let key = entry.get("key").and_then(|v| v.as_str()).unwrap_or("—");
                let value = entry.get("value").and_then(|v| v.as_str()).unwrap_or("");
                let updated = entry.get("updated_at").and_then(|v| v.as_str()).unwrap_or("");

                println!("  {} [{}] {} = {}", "•".cyan(), id.dimmed(), key.bold(), value);
                if !updated.is_empty() {
                    println!("    Updated: {}", updated.dimmed());
                }
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to list memory: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_set(
    client: ApiClient,
    org: Option<String>,
    key: &str,
    value: &str,
) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Setting memory {}...", key));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    let body = serde_json::json!({
        "org": org,
        "key": key,
        "value": value,
    });

    match client
        .post::<serde_json::Value>(
            "/memory",
            Some(&body),
        )
        .await
    {
        Ok(result) => {
            spinner.finish_with_message(format!("{} Memory saved!", "✓".green()));

            if let Some(id) = result.get("id").and_then(|v| v.as_str()) {
                println!("  ID:    {}", id.cyan());
            }
            println!("  Key:   {}", key.bold());
            println!("  Value: {}", value);
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to set memory: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_get(client: ApiClient, id: &str, json: bool) -> Result<()> {
    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Fetching memory {}...", id));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client
        .get::<serde_json::Value>(&format!("/memory/{}", id))
        .await
    {
        Ok(entry) => {
            spinner.finish_and_clear();

            if json {
                println!("{}", serde_json::to_string_pretty(&entry)?);
                return Ok(());
            }

            let key = entry.get("key").and_then(|v| v.as_str()).unwrap_or("—");
            let value = entry.get("value").and_then(|v| v.as_str()).unwrap_or("");

            println!("\n{} Memory entry {}", "Memory:".blue().bold(), id);
            println!("{}", "─".repeat(50).dimmed());
            println!("  Key:   {}", key.bold());
            println!("  Value: {}", value);
            if let Some(created) = entry.get("created_at").and_then(|v| v.as_str()) {
                println!("  Created: {}", created);
            }
            if let Some(updated) = entry.get("updated_at").and_then(|v| v.as_str()) {
                println!("  Updated: {}", updated);
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to get memory: {}", "✗".red(), e);
        }
    }

    Ok(())
}
