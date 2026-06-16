use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct ResearchArgs {
    #[command(subcommand)]
    pub command: ResearchCommands,
}

#[derive(Subcommand)]
pub enum ResearchCommands {
    /// Run a research operation
    Run {
        /// Research query
        query: String,
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// List recent research results
    List {
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
}

pub async fn run(client: ApiClient, args: ResearchArgs) -> Result<()> {
    match args.command {
        ResearchCommands::Run { query, org, json } => cmd_run(client, &query, org, json).await,
        ResearchCommands::List { org, json } => cmd_list(client, org, json).await,
    }
}

async fn cmd_run(
    client: ApiClient,
    query: &str,
    org: Option<String>,
    json: bool,
) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Running research...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    let body = serde_json::json!({
        "org": org,
        "query": query,
    });

    match client
        .post::<serde_json::Value>("/learning/research/run", Some(&body))
        .await
    {
        Ok(result) => {
            spinner.finish_with_message(format!("{} Research complete!", "✓".green()));

            if json {
                println!("{}", serde_json::to_string_pretty(&result)?);
                return Ok(());
            }

            if let Some(answer) = result.get("answer").and_then(|v| v.as_str()) {
                println!("\n  {}", answer);
            }
            if let Some(sources) = result.get("sources").and_then(|v| v.as_array()) {
                if !sources.is_empty() {
                    println!("\n  {}", "Sources:".bold());
                    for source in sources {
                        let title = source.get("title").and_then(|v| v.as_str()).unwrap_or("");
                        let url = source.get("url").and_then(|v| v.as_str()).unwrap_or("");
                        println!("    {} {} ({})", "•".cyan(), title, url.dimmed());
                    }
                }
            }
            if let Some(id) = result.get("id").and_then(|v| v.as_str()) {
                println!("\n  Research ID: {}", id.dimmed());
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Research failed: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_list(client: ApiClient, org: Option<String>, json: bool) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Fetching research history...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client
        .get::<serde_json::Value>(&format!("/learning/research?org={}", org))
        .await
    {
        Ok(results) => {
            spinner.finish_and_clear();

            if json {
                println!("{}", serde_json::to_string_pretty(&results)?);
                return Ok(());
            }

            let empty = Vec::new();
            let items = results.as_array().unwrap_or(&empty);
            println!(
                "\n{} Research history for {} ({})",
                "Research:".blue().bold(),
                org.bold(),
                items.len()
            );
            println!("{}", "─".repeat(70).dimmed());

            for item in items {
                let id = item.get("id").and_then(|v| v.as_str()).unwrap_or("—");
                let query = item.get("query").and_then(|v| v.as_str()).unwrap_or("");
                let created = item.get("created_at").and_then(|v| v.as_str()).unwrap_or("");
                println!("  {} {} - {}", id.dimmed(), query, created.dimmed());
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to fetch research: {}", "✗".red(), e);
        }
    }

    Ok(())
}
