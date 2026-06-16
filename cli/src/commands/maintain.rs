use anyhow::Result;
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct MaintainArgs {
    #[command(subcommand)]
    pub command: MaintainCommands,
}

#[derive(Subcommand)]
pub enum MaintainCommands {
    /// Run maintenance operations
    Run {
        /// Maintenance type (cleanup, optimize, verify)
        #[arg(default_value = "cleanup")]
        operation: String,
        /// Organization name
        #[arg(long)]
        org: Option<String>,
    },
}

pub async fn run(client: ApiClient, args: MaintainArgs) -> Result<()> {
    match args.command {
        MaintainCommands::Run { operation, org } => cmd_run(client, &operation, org).await,
    }
}

async fn cmd_run(
    client: ApiClient,
    operation: &str,
    org: Option<String>,
) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow::anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Running {} maintenance for {}...", operation, org));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    let body = serde_json::json!({
        "org": org,
        "operation": operation,
    });

    match client
        .post::<serde_json::Value>("/mal/maintain", Some(&body))
        .await
    {
        Ok(result) => {
            spinner.finish_with_message(format!("{} Maintenance complete!", "✓".green()));

            if let Some(msg) = result.get("message").and_then(|v| v.as_str()) {
                println!("  Message: {}", msg);
            }
            if let Some(tasks) = result.get("tasks").and_then(|v| v.as_array()) {
                for task in tasks {
                    let name = task.get("name").and_then(|v| v.as_str()).unwrap_or("task");
                    let status = task.get("status").and_then(|v| v.as_str()).unwrap_or("?");
                    let status_color = match status {
                        "completed" => status.green(),
                        "failed" => status.red(),
                        "skipped" => status.yellow(),
                        _ => status.dimmed(),
                    };
                    println!("  {} {}: {}", "•".cyan(), name, status_color);
                }
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Maintenance failed: {}", "✗".red(), e);
        }
    }

    Ok(())
}
