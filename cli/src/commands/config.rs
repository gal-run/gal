use anyhow::Result;
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct ConfigArgs {
    #[command(subcommand)]
    pub command: ConfigSubcommand,
}

#[derive(Subcommand)]
pub enum ConfigSubcommand {
    /// Show the current approved configuration
    Show {
        /// Organization name
        #[arg(long)]
        org: Option<String>,

        /// Platform (default: claude)
        #[arg(long, default_value = "claude")]
        platform: String,

        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// Validate config integrity
    Validate {
        /// Organization name
        #[arg(long)]
        org: Option<String>,

        /// Platform (default: claude)
        #[arg(long, default_value = "claude")]
        platform: String,
    },
}

pub async fn run(client: ApiClient, args: ConfigArgs) -> Result<()> {
    match args.command {
        ConfigSubcommand::Show { org, platform, json } => {
            cmd_show(client, org, &platform, json).await
        }
        ConfigSubcommand::Validate { org, platform } => {
            cmd_validate(client, org, &platform).await
        }
    }
}

async fn cmd_show(
    client: ApiClient,
    org: Option<String>,
    platform: &str,
    json: bool,
) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow::anyhow!("No organization specified. Use --org <name>"))?;

    if json {
        let spinner = indicatif::ProgressBar::new_spinner();
        spinner.set_message("Fetching approved config...");
        spinner.enable_steady_tick(std::time::Duration::from_millis(100));

        match client.get_approved_config(&org, platform).await {
            Ok(approved) => {
                spinner.finish_and_clear();
                println!(
                    "{}",
                    serde_json::to_string_pretty(&serde_json::json!({
                        "organization": org,
                        "platform": platform,
                        "approved": approved,
                    }))?
                );
            }
            Err(e) => {
                spinner.finish_and_clear();
                eprintln!("{} Error: {}", "✗".red(), e);
            }
        }

        return Ok(());
    }

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Fetching approved config for {}...", org));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client.get_approved_config(&org, platform).await {
        Ok(approved) => {
            spinner.finish_and_clear();

            println!();
            println!(
                "{} Approved config for \"{}\" ({})",
                "✓".green(),
                org.bold(),
                platform.cyan()
            );

            if let Some(version) = approved.get("version").and_then(|v| v.as_str()) {
                println!("{} Version: {}", "  ".dimmed(), version);
            }
            if let Some(approved_at) = approved.get("approvedAt").and_then(|v| v.as_str()) {
                println!("{} Approved at: {}", "  ".dimmed(), approved_at);
            }
            if let Some(approved_by) = approved.get("approvedBy").and_then(|v| v.as_str()) {
                println!("{} Approved by: {}", "  ".dimmed(), approved_by);
            }
            if let Some(hash) = approved.get("hash").and_then(|v| v.as_str()) {
                println!("{} Hash: {}", "  ".dimmed(), hash.dimmed());
            }
            println!();

            // Contents
            let commands = approved
                .get("commands")
                .and_then(|v| v.as_array())
                .map(|a| a.len())
                .unwrap_or(0);
            let agents = approved
                .get("subagents")
                .and_then(|v| v.as_array())
                .map(|a| a.len())
                .unwrap_or(0);
            let skills = approved
                .get("skills")
                .and_then(|v| v.as_array())
                .map(|a| a.len())
                .unwrap_or(0);
            let rules = approved
                .get("rules")
                .and_then(|v| v.as_array())
                .map(|a| a.len())
                .unwrap_or(0);

            println!("{}", "  Contents:".bold());
            println!("    Commands:  {}", commands);
            println!("    Agents:    {}", agents);
            println!("    Skills:    {}", skills);
            println!("    Rules:     {}", rules);
            println!(
                "    Instructions: {}",
                if approved.get("instructions").is_some() {
                    "✓".green()
                } else {
                    "—".dimmed()
                }
            );
            println!(
                "    Settings:     {}",
                if approved.get("settings").is_some() {
                    "✓".green()
                } else {
                    "—".dimmed()
                }
            );

            // List commands
            if commands > 0 {
                println!();
                println!("{}", "  Commands:".bold());
                if let Some(cmd_list) = approved.get("commands").and_then(|v| v.as_array()) {
                    for cmd in cmd_list {
                        if let Some(name) = cmd.get("name").and_then(|v| v.as_str()) {
                            println!("    /{}", name);
                        }
                    }
                }
            }

            // List agents
            if agents > 0 {
                println!();
                println!("{}", "  Agents:".bold());
                if let Some(agent_list) = approved.get("subagents").and_then(|v| v.as_array()) {
                    for agent in agent_list {
                        if let Some(name) = agent.get("name").and_then(|v| v.as_str()) {
                            println!("    {}", name);
                        }
                    }
                }
            }

            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Error: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_validate(
    client: ApiClient,
    org: Option<String>,
    platform: &str,
) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow::anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Validating config for {}...", org));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client.get_approved_config(&org, platform).await {
        Ok(approved) => {
            spinner.finish_and_clear();

            let mut valid = true;

            // Check required fields
            if approved.get("version").is_none() {
                println!("  {} Missing version field", "✗".red());
                valid = false;
            }
            if approved.get("hash").is_none() {
                println!("  {} Missing hash field", "✗".red());
                valid = false;
            }

            if valid {
                println!(
                    "\n{} Config for \"{}\" ({}) is valid",
                    "✓".green(),
                    org.bold(),
                    platform.cyan()
                );
                if let Some(hash) = approved.get("hash").and_then(|v| v.as_str()) {
                    println!("{} Hash: {}", "  ".dimmed(), hash.dimmed());
                }
            } else {
                println!(
                    "\n{} Config validation failed",
                    "✗".red()
                );
            }

            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Validation error: {}", "✗".red(), e);
        }
    }

    Ok(())
}
