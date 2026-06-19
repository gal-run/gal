use anyhow::Result;
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct CheckArgs {
    #[command(subcommand)]
    pub command: CheckCommands,
}

#[derive(Subcommand)]
pub enum CheckCommands {
    /// Validate configuration
    Validate {
        /// Organization name
        #[arg(long)]
        org: Option<String>,
    },
    /// Check API health
    Health,
}

pub async fn run(client: ApiClient, args: CheckArgs) -> Result<()> {
    match args.command {
        CheckCommands::Validate { org } => cmd_validate(client, org).await,
        CheckCommands::Health => cmd_health(client).await,
    }
}

async fn cmd_validate(client: ApiClient, org: Option<String>) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow::anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Validating compliance for {}...", org));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client
        .get::<serde_json::Value>(&format!("/compliance-status?org={}", org))
        .await
    {
        Ok(status) => {
            spinner.finish_and_clear();

            let compliant = status
                .get("compliant")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            println!();
            if compliant {
                println!("{} Organization {} is compliant", "✓".green(), org.bold());
            } else {
                println!("{} Organization {} has compliance issues", "✗".red(), org.bold());
            }

            if let Some(checks) = status.get("checks").and_then(|v| v.as_array()) {
                println!("\n{}", "Checks:".bold());
                for check in checks {
                    let name = check.get("name").and_then(|v| v.as_str()).unwrap_or("unknown");
                    let passed = check.get("passed").and_then(|v| v.as_bool()).unwrap_or(false);
                    let icon = if passed { "✓".green() } else { "✗".red() };
                    println!("  {} {}", icon, name);
                }
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Validation failed: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_health(client: ApiClient) -> Result<()> {
    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Checking API health...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client.test_connection().await {
        Ok(true) => {
            spinner.finish_with_message(format!("{} API is healthy!", "✓".green()));
            println!("  API URL: {}", client.base_url);
            println!();
        }
        _ => {
            spinner.finish_with_message(format!("{} API is not reachable", "✗".red()));
            println!("  API URL: {}", client.base_url);
            println!("  {}", "Check your connection or API URL.".dimmed());
            println!();
        }
    }

    Ok(())
}
