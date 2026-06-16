use anyhow::Result;
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct SetupArgs {
    #[command(subcommand)]
    pub command: SetupCommands,
}

#[derive(Subcommand)]
pub enum SetupCommands {
    /// Run initial setup wizard
    Wizard {
        /// Organization name
        #[arg(long)]
        org: Option<String>,
    },
}

pub async fn run(client: ApiClient, args: SetupArgs) -> Result<()> {
    match args.command {
        SetupCommands::Wizard { org } => cmd_wizard(client, org).await,
    }
}

async fn cmd_wizard(client: ApiClient, org: Option<String>) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .unwrap_or_else(|| "default".to_string());

    println!();
    println!("{}", "════════════════════════════════════════════".green());
    println!("  {} {}", "GAL Setup Wizard".bold(), "v".to_string() + env!("CARGO_PKG_VERSION"));
    println!("{}", "════════════════════════════════════════════".green());
    println!();

    // Step 1: Check auth
    println!("{} Step 1: Authentication", "▶".cyan().bold());
    if client.has_token() {
        match client.get_current_user().await {
            Ok(user) => {
                println!("  {} Authenticated as {}", "✓".green(), user.login.bold());
            }
            Err(_) => {
                println!("  {} Token exists but is invalid", "✗".red());
                println!("  {} Run 'gal auth login' to re-authenticate", "(Hint)".dimmed());
            }
        }
    } else {
        println!("  {} Not authenticated", "○".yellow());
        println!("  {} Run 'gal auth login' to authenticate", "(Hint)".dimmed());
    }
    println!();

    // Step 2: Organization
    println!("{} Step 2: Organization", "▶".cyan().bold());
    println!("  Default org: {}", org.bold());
    if client.has_token() {
        match client.get_organizations().await {
            Ok(orgs) => {
                println!("  {} Available organizations:", "Available:".dimmed());
                for o in &orgs {
                    if let Some(name) = o.get("name").and_then(|v| v.as_str()) {
                        let is_default = if name == org { " (default)" } else { "" };
                        println!("    {} {}{}", "•".cyan(), name, is_default);
                    }
                }
            }
            Err(_) => {
                println!("  {} Could not fetch organizations", "!".yellow());
            }
        }
    }
    println!();

    // Step 3: API connection
    println!("{} Step 3: API Connection", "▶".cyan().bold());
    println!("  API URL: {}", config.api_url.as_deref().unwrap_or("https://api.gal.run"));
    match client.test_connection().await {
        Ok(true) => println!("  {} API is reachable", "✓".green()),
        _ => println!("  {} API is not reachable", "✗".red()),
    }
    println!();

    // Step 4: Local config
    println!("{} Step 4: Local Configuration", "▶".cyan().bold());
    let home = dirs::home_dir().unwrap_or_else(|| std::path::PathBuf::from("~"));
    let gal_dir = home.join(".gal");
    let config_path = gal_dir.join("config.json");

    if config_path.exists() {
        println!("  {} Config file exists at {}", "✓".green(), config_path.display().to_string().cyan());
    } else {
        println!("  {} Config file not yet created", "○".yellow());
    }
    println!();

    // Summary
    println!("{}", "════════════════════════════════════════════".green());
    println!("  {}", "Setup check complete!".green().bold());
    println!("{}", "════════════════════════════════════════════".green());
    println!();
    println!("  {} Next steps:", "What next?".bold());
    println!("    {} Run 'gal --help' to see all commands", "•".cyan());
    println!("    {} Run 'gal sync --pull' to sync org config", "•".cyan());
    println!("    {} Run 'gal init' to init a project", "•".cyan());
    println!();

    Ok(())
}
