use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct BrowserArgs {
    #[command(subcommand)]
    pub command: BrowserCommands,
}

#[derive(Subcommand)]
pub enum BrowserCommands {
    /// List browser profiles
    Profiles {
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// Start GAL Browser MCP server over stdio (internal - invoked by MCP host)
    Server {
        /// Project root directory
        #[arg(long, default_value = ".")]
        project_path: String,
        /// Named browser profile to load from the shared browser cache
        #[arg(long)]
        profile: Option<String>,
        /// Run browser headlessly (default: true)
        #[arg(long, default_value_t = true)]
        headless: bool,
        /// Run browser in headed mode (shortcut for --headless false)
        #[arg(long)]
        headed: bool,
    },
}

pub async fn run(client: ApiClient, args: BrowserArgs) -> Result<()> {
    match args.command {
        BrowserCommands::Profiles { json } => cmd_profiles(client, json).await,
        BrowserCommands::Server {
            project_path,
            profile,
            headless,
            headed,
        } => cmd_server(project_path, profile, headless, headed).await,
    }
}

async fn cmd_server(
    project_path: String,
    profile: Option<String>,
    headless: bool,
    headed: bool,
) -> Result<()> {
    let is_headless = if headed { false } else { headless };

    eprintln!("[gal browser] Starting GAL Browser MCP server");
    eprintln!("[gal browser] Project path: {}", project_path);
    eprintln!("[gal browser] Headless: {}", is_headless);
    if let Some(ref p) = profile {
        eprintln!("[gal browser] Profile: {}", p);
    }

    // Emit a JSON startup message to stdout for machine consumption
    let profile_json = profile
        .as_deref()
        .map(|p| format!("\"{}\"", p))
        .unwrap_or_else(|| "null".to_string());
    println!(
        r#"{{"server":"browser","status":"starting","project_path":"{}","headless":{},"profile":{}}}"#,
        project_path, is_headless, profile_json
    );

    // Start the browser MCP server over stdio
    let server = crate::mcp::browser::BrowserMcpServer::new();
    crate::mcp::run_stdio_server(server).await;

    Ok(())
}

async fn cmd_profiles(client: ApiClient, json: bool) -> Result<()> {
    // Try API first, fall back to local browser detection
    let result = client
        .get::<serde_json::Value>("/agent-cards/profiles")
        .await;

    match result {
        Ok(profiles) => {
            if json {
                println!("{}", serde_json::to_string_pretty(&profiles)?);
                return Ok(());
            }

            println!("\n{}", "Browser Profiles:".blue().bold());
            println!("{}", "─".repeat(50).dimmed());

            let empty = Vec::new();
            let items = profiles.as_array().unwrap_or(&empty);
            if items.is_empty() {
                println!("  No browser profiles found.");
            } else {
                for profile in items {
                    let name = profile.get("name").and_then(|v| v.as_str()).unwrap_or("unknown");
                    let browser = profile.get("browser").and_then(|v| v.as_str()).unwrap_or("");
                    let path = profile.get("path").and_then(|v| v.as_str()).unwrap_or("");
                    println!("  {} {} ({})", "•".cyan(), name, browser);
                    println!("    Path: {}", path.dimmed());
                }
            }
            println!();
        }
        Err(_) => {
            // Fallback: list local Chrome profiles
            let home = dirs::home_dir().ok_or_else(|| anyhow!("Cannot find home directory"))?;
            let chrome_dir = home.join("Library").join("Application Support").join("Google").join("Chrome");

            println!("\n{}", "Local Browser Profiles:".blue().bold());
            println!("{}", "─".repeat(50).dimmed());

            if chrome_dir.exists() {
                if let Ok(entries) = std::fs::read_dir(chrome_dir.join("Profile Data")) {
                    for entry in entries.flatten() {
                        let name = entry.file_name();
                        println!("  {} {} (Chrome)", "•".cyan(), name.to_string_lossy());
                    }
                } else {
                    println!("  No local Chrome profiles found.");
                }
            } else {
                println!("  No local browser profiles found.");
                println!("  {}", "(Browser profile API is not available)".dimmed());
            }
            println!();
        }
    }

    Ok(())
}
