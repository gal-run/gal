use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct AuditArgs {
    #[command(subcommand)]
    pub command: AuditCommands,
}

#[derive(Subcommand)]
pub enum AuditCommands {
    /// Query the audit log
    Log {
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Filter by event type
        #[arg(long)]
        event: Option<String>,
        /// Filter by actor
        #[arg(long)]
        actor: Option<String>,
        /// Limit results
        #[arg(long, default_value = "50")]
        limit: u64,
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
}

pub async fn run(client: ApiClient, args: AuditArgs) -> Result<()> {
    match args.command {
        AuditCommands::Log {
            org,
            event,
            actor,
            limit,
            json,
        } => cmd_log(client, org, event, actor, limit, json).await,
    }
}

async fn cmd_log(
    client: ApiClient,
    org: Option<String>,
    event: Option<String>,
    actor: Option<String>,
    limit: u64,
    json: bool,
) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Querying audit log...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    let mut query = serde_json::json!({
        "org": org,
        "limit": limit,
    });
    if let Some(e) = event {
        query["event"] = serde_json::json!(e);
    }
    if let Some(a) = actor {
        query["actor"] = serde_json::json!(a);
    }

    match client
        .post::<serde_json::Value>("/audit-log/query", Some(&query))
        .await
    {
        Ok(result) => {
            spinner.finish_and_clear();

            if json {
                println!("{}", serde_json::to_string_pretty(&result)?);
                return Ok(());
            }

            let empty = Vec::new();
            let entries = result.as_array().unwrap_or(&empty);
            println!(
                "\n{} Audit log for {} ({})",
                "Audit Log:".blue().bold(),
                org.bold(),
                entries.len()
            );
            println!("{}", "─".repeat(80).dimmed());

            for entry in entries {
                let ts = entry
                    .get("timestamp")
                    .and_then(|v| v.as_str())
                    .unwrap_or("—");
                let ev = entry
                    .get("event")
                    .and_then(|v| v.as_str())
                    .unwrap_or("—");
                let act = entry
                    .get("actor")
                    .and_then(|v| v.as_str())
                    .unwrap_or("—");
                let details = entry
                    .get("details")
                    .and_then(|v| v.as_str())
                    .unwrap_or("");

                println!("  {} {} {} {} {}", "•".cyan(), ts.dimmed(), ev.yellow(), act, details);
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Audit log query failed: {}", "✗".red(), e);
        }
    }

    Ok(())
}
