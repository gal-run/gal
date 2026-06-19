use anyhow::{anyhow, Context, Result};
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct InitArgs {
    #[command(subcommand)]
    pub command: InitCommands,
}

#[derive(Subcommand)]
pub enum InitCommands {
    /// Initialize gal in current project
    Init {
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Project directory
        #[arg(default_value = ".")]
        dir: String,
        /// Force reinitialize
        #[arg(long)]
        force: bool,
    },
}

pub async fn run(client: ApiClient, args: InitArgs) -> Result<()> {
    match args.command {
        InitCommands::Init { org, dir, force } => cmd_init(client, org, &dir, force).await,
    }
}

async fn cmd_init(
    client: ApiClient,
    org: Option<String>,
    dir: &str,
    force: bool,
) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let project_dir = std::path::Path::new(dir);

    // Create .gal directory
    let gal_dir = project_dir.join(".gal");
    if gal_dir.exists() && !force {
        println!(
            "\n{} .gal directory already exists in {}",
            "!".yellow(),
            dir
        );
        println!("  {} Use --force to reinitialize", "(Hint)".dimmed());
        println!();
        return Ok(());
    }

    std::fs::create_dir_all(&gal_dir)
        .context("Failed to create .gal directory")?;

    // Fetch config if authenticated
    if client.has_token() {
        let spinner = indicatif::ProgressBar::new_spinner();
        spinner.set_message("Fetching organization configuration...");
        spinner.enable_steady_tick(std::time::Duration::from_millis(100));

        match client.sync_pull_config(&org, Some("claude")).await {
            Ok(approved) => {
                let config_path = gal_dir.join("config.yaml");
                let content = serde_json::to_string_pretty(&approved)?;
                std::fs::write(&config_path, &content)
                    .context("Failed to write config.yaml")?;
                spinner.finish_with_message(format!("{} Config synced!", "✓".green()));
            }
            Err(_) => {
                spinner.finish_and_clear();
                // Continue without config
            }
        }
    }

    // Create .gal/config.yaml template if not fetched
    let config_path = gal_dir.join("config.yaml");
    if !config_path.exists() {
        let template = format!(
            r#"# GAL Configuration for {}
# Managed by GAL CLI. Do not edit manually.
version: 1
organization: {}
"#,
            dir, org
        );
        std::fs::write(&config_path, &template)
            .context("Failed to write config.yaml")?;
    }

    // Create .galignore
    let ignore_path = gal_dir.join(".galignore");
    if !ignore_path.exists() {
        std::fs::write(
            &ignore_path,
            "# Files and directories to ignore during scanning\nnode_modules\ntarget\n.git\n.venv\n",
        )
        .context("Failed to write .galignore")?;
    }

    println!("\n{}", "════════════════════════════════════════════".green());
    println!(
        "  {} {}",
        "✓".green(),
        "GAL initialized!".bold()
    );
    println!("{}", "════════════════════════════════════════════".green());
    println!();
    println!("  Organization: {}", org.bold());
    println!("  Directory:    {}", project_dir.canonicalize().unwrap_or_else(|_| project_dir.to_path_buf()).display().to_string().cyan());
    println!("  Config:       {}", config_path.display().to_string().cyan());
    println!();
    println!("  {} Next steps:", "What's next?".bold());
    println!("    - Run {} to see available commands", "gal --help".cyan());
    println!("    - Run {} to check auth status", "gal auth status".cyan());
    println!("    - Run {} to sync latest org config", "gal sync --pull".cyan());
    println!();

    Ok(())
}
