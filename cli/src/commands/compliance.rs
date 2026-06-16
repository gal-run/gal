use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct ComplianceArgs {
    #[command(subcommand)]
    pub command: ComplianceCommands,
}

#[derive(Subcommand)]
pub enum ComplianceCommands {
    /// Generate compliance report
    Report {
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// Run a compliance audit
    Audit {
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Developer email to audit
        #[arg(long)]
        developer: Option<String>,
    },
}

pub async fn run(client: ApiClient, args: ComplianceArgs) -> Result<()> {
    match args.command {
        ComplianceCommands::Report { org, json } => cmd_report(client, org, json).await,
        ComplianceCommands::Audit { org, developer } => cmd_audit(client, org, developer).await,
    }
}

async fn cmd_report(client: ApiClient, org: Option<String>, json: bool) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Generating compliance report for {}...", org));
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

            println!("\n{} Compliance Report for {}", "Compliance Report:".blue().bold(), org.bold());
            println!("{}", "─".repeat(60).dimmed());

            if compliant {
                println!("  {} All checks passed", "✓".green());
            } else {
                println!("  {} Issues found", "✗".red());
            }

            if let Some(checks) = status.get("checks").and_then(|v| v.as_array()) {
                println!("\n{}", "Check Results:".bold());
                for check in checks {
                    let name = check.get("name").and_then(|v| v.as_str()).unwrap_or("unknown");
                    let passed = check.get("passed").and_then(|v| v.as_bool()).unwrap_or(false);
                    let msg = check.get("message").and_then(|v| v.as_str()).unwrap_or("");
                    let icon = if passed { "✓".green() } else { "✗".red() };
                    println!("  {} {}: {}", icon, name, msg);
                }
            }

            if let Some(summary) = status.get("summary").and_then(|v| v.as_str()) {
                println!("\n  Summary: {}", summary);
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Compliance report failed: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_audit(client: ApiClient, org: Option<String>, developer: Option<String>) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Running compliance audit for {}...", org));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    let mut body = serde_json::json!({ "org": org });
    if let Some(ref dev) = developer {
        body["developer"] = serde_json::json!(dev);
    }

    match client
        .post::<serde_json::Value>("/compliance-status/developer/report", Some(&body))
        .await
    {
        Ok(report) => {
            spinner.finish_with_message(format!("{} Audit complete!", "✓".green()));

            println!("\n{}", "Compliance Audit Results:".bold());
            if let Some(dev) = &developer {
                println!("  Developer: {}", dev);
            }
            if let Some(score) = report.get("score").and_then(|v| v.as_u64()) {
                let color = if score >= 80 {
                    score.to_string().green()
                } else if score >= 50 {
                    score.to_string().yellow()
                } else {
                    score.to_string().red()
                };
                println!("  Score: {}/100", color);
            }
            if let Some(issues) = report.get("issues").and_then(|v| v.as_array()) {
                if !issues.is_empty() {
                    println!("\n  {} Issues found:", "Issues:".yellow());
                    for issue in issues {
                        let desc = issue.get("description").and_then(|v| v.as_str()).unwrap_or("");
                        println!("    {} {}", "•".yellow(), desc);
                    }
                } else {
                    println!("  {} No issues found", "✓".green());
                }
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Audit failed: {}", "✗".red(), e);
        }
    }

    Ok(())
}
