use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct QualityArgs {
    #[command(subcommand)]
    pub command: QualityCommands,
}

#[derive(Subcommand)]
pub enum QualityCommands {
    /// Run quality checks
    Check {
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
}

pub async fn run(client: ApiClient, args: QualityArgs) -> Result<()> {
    match args.command {
        QualityCommands::Check { org, json } => cmd_check(client, org, json).await,
    }
}

async fn cmd_check(client: ApiClient, org: Option<String>, json: bool) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Running quality checks for {}...", org));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client
        .get::<serde_json::Value>(&format!("/compliance-status?org={}", org))
        .await
    {
        Ok(status) => {
            spinner.finish_and_clear();

            if json {
                println!("{}", serde_json::to_string_pretty(&status)?);
                return Ok(());
            }

            let compliant = status
                .get("compliant")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);

            println!("\n{} Quality Report for {}", "Quality:".blue().bold(), org.bold());
            println!("{}", "─".repeat(50).dimmed());

            if compliant {
                println!("  {} All quality checks passed", "✓".green());
            } else {
                println!("  {} Quality issues detected", "!".yellow());
            }

            if let Some(checks) = status.get("checks").and_then(|v| v.as_array()) {
                for check in checks {
                    let name = check.get("name").and_then(|v| v.as_str()).unwrap_or("unknown");
                    let passed = check.get("passed").and_then(|v| v.as_bool()).unwrap_or(false);
                    let icon = if passed { "✓".green() } else { "✗".red() };
                    let msg = check.get("message").and_then(|v| v.as_str()).unwrap_or("");
                    println!("  {} {}: {}", icon, name, msg);
                }
            }

            if let Some(score) = status.get("quality_score").and_then(|v| v.as_f64()) {
                let color = if score >= 0.8 {
                    format!("{:.1}%", score * 100.0).green()
                } else if score >= 0.5 {
                    format!("{:.1}%", score * 100.0).yellow()
                } else {
                    format!("{:.1}%", score * 100.0).red()
                };
                println!("\n  Quality Score: {}", color);
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Quality check failed: {}", "✗".red(), e);
        }
    }

    Ok(())
}
