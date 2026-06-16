use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct GovernanceArgs {
    #[command(subcommand)]
    pub command: GovernanceCommands,
}

#[derive(Subcommand)]
pub enum GovernanceCommands {
    /// List governance policies
    Policy {
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// Override governance rules
    Override {
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Policy name to override
        #[arg(long)]
        policy: String,
        /// Reason for override
        #[arg(long)]
        reason: String,
    },
}

pub async fn run(client: ApiClient, args: GovernanceArgs) -> Result<()> {
    match args.command {
        GovernanceCommands::Policy { org, json } => cmd_policy(client, org, json).await,
        GovernanceCommands::Override {
            org,
            policy,
            reason,
        } => cmd_override(client, org, &policy, &reason).await,
    }
}

async fn cmd_policy(client: ApiClient, org: Option<String>, json: bool) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Fetching governance policies for {}...", org));
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
            let items = policies.as_array().unwrap_or(&empty);
            println!(
                "\n{} Governance Policies for {} ({})",
                "Policies:".blue().bold(),
                org.bold(),
                items.len()
            );
            println!("{}", "─".repeat(60).dimmed());

            for policy in items {
                let name = policy.get("name").and_then(|v| v.as_str()).unwrap_or("unknown");
                let enabled = policy.get("enabled").and_then(|v| v.as_bool()).unwrap_or(false);
                let desc = policy.get("description").and_then(|v| v.as_str()).unwrap_or("");

                let icon = if enabled { "✓".green() } else { "✗".red() };
                println!("  {} {}: {}", icon, name.white(), desc);
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to fetch policies: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_override(
    client: ApiClient,
    org: Option<String>,
    policy: &str,
    reason: &str,
) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Overriding policy {} for {}...", policy, org));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    let body = serde_json::json!({
        "org": org,
        "policy": policy,
        "reason": reason,
    });

    match client
        .post::<serde_json::Value>("/enforcement/override", Some(&body))
        .await
    {
        Ok(result) => {
            spinner.finish_with_message(format!("{} Policy override applied!", "✓".green()));

            let status = result.get("status").and_then(|v| v.as_str()).unwrap_or("applied");
            println!("  Policy:    {}", policy);
            println!("  Reason:    {}", reason);
            println!("  Status:    {}", status);
            if let Some(expires) = result.get("expires_at").and_then(|v| v.as_str()) {
                println!("  Expires:   {}", expires);
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Override failed: {}", "✗".red(), e);
        }
    }

    Ok(())
}
