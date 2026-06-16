use anyhow::Result;
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct SecurityArgs {
    #[command(subcommand)]
    pub command: SecurityCommands,
}

#[derive(Subcommand)]
pub enum SecurityCommands {
    /// Run security scan on a repository
    Scan {
        /// Repository owner
        owner: String,
        /// Repository name
        repo: String,
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
}

pub async fn run(client: ApiClient, args: SecurityArgs) -> Result<()> {
    match args.command {
        SecurityCommands::Scan {
            owner,
            repo,
            json,
        } => cmd_scan(client, &owner, &repo, json).await,
    }
}

async fn cmd_scan(
    client: ApiClient,
    owner: &str,
    repo: &str,
    json: bool,
) -> Result<()> {
    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Scanning {}/{} for security issues...", owner, repo));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client
        .get::<serde_json::Value>(&format!(
            "/repos/{}/{}/security",
            owner, repo
        ))
        .await
    {
        Ok(result) => {
            spinner.finish_and_clear();

            if json {
                println!("{}", serde_json::to_string_pretty(&result)?);
                return Ok(());
            }

            let issues = result.get("issues").and_then(|v| v.as_array()).map(|a| a.len()).unwrap_or(0);
            let critical = result.get("critical").and_then(|v| v.as_u64()).unwrap_or(0);
            let high = result.get("high").and_then(|v| v.as_u64()).unwrap_or(0);
            let medium = result.get("medium").and_then(|v| v.as_u64()).unwrap_or(0);
            let low = result.get("low").and_then(|v| v.as_u64()).unwrap_or(0);

            println!(
                "\n{} Security scan for {}/{}",
                "Security:".blue().bold(),
                owner,
                repo
            );
            println!("{}", "─".repeat(50).dimmed());

            if issues == 0 {
                println!("  {} No security issues found", "✓".green());
            } else {
                println!("  {} Found {} issues", "!".yellow(), issues);
                if critical > 0 {
                    println!("    {} Critical: {}", "🔴".red(), critical);
                }
                if high > 0 {
                    println!("    {} High:     {}", "🟠".yellow(), high);
                }
                if medium > 0 {
                    println!("    {} Medium:   {}", "🟡".yellow(), medium);
                }
                if low > 0 {
                    println!("    {} Low:      {}", "🟢".dimmed(), low);
                }
            }

            if let Some(findings) = result.get("findings").and_then(|v| v.as_array()) {
                for finding in findings {
                    let severity = finding.get("severity").and_then(|v| v.as_str()).unwrap_or("info");
                    let msg = finding.get("message").and_then(|v| v.as_str()).unwrap_or("");
                    let sev_color = match severity {
                        "critical" => format!("[{}]", severity).red(),
                        "high" => format!("[{}]", severity).yellow(),
                        "medium" => format!("[{}]", severity).yellow(),
                        "low" => format!("[{}]", severity).dimmed(),
                        _ => format!("[{}]", severity).dimmed(),
                    };
                    println!("  {} {} {}", sev_color, msg, &finding.get("file").and_then(|v| v.as_str()).unwrap_or("").dimmed());
                }
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Security scan failed: {}", "✗".red(), e);
        }
    }

    Ok(())
}
