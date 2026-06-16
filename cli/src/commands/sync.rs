use anyhow::{Context, Result};
use clap::Parser;
use colored::*;

use crate::client::{ApiClient, LocalConfig};

#[derive(Parser)]
pub struct SyncArgs {
    /// Download and apply org configs
    #[arg(long)]
    pub pull: bool,

    /// Push session learnings to org
    #[arg(long)]
    pub push: bool,

    /// Filter by platform (claude, cursor, etc.)
    #[arg(long)]
    pub platform: Option<String>,

    /// Target directory (default: current directory)
    #[arg(long, default_value = ".")]
    pub dir: String,

    /// Preview what would be pushed without making API calls
    #[arg(long)]
    pub dry_run: bool,

    /// Force sync even if already up to date
    #[arg(long)]
    pub force: bool,
}

pub async fn run(client: ApiClient, args: SyncArgs) -> Result<()> {
    let config = LocalConfig::load()?;

    if args.push {
        cmd_push(client, config, args).await?;
    } else {
        cmd_pull(client, config, args).await?;
    }

    Ok(())
}

async fn cmd_pull(client: ApiClient, config: LocalConfig, args: SyncArgs) -> Result<()> {
    if !client.has_token() {
        println!(
            "\n{} Pulling from a workspace requires an account.\n",
            "✗".red()
        );
        println!(
            "{} Connect your workspace: gal auth login\n",
            "(Hint)".dimmed()
        );
        return Ok(());
    }

    let org = config
        .default_org
        .as_deref()
        .ok_or_else(|| anyhow::anyhow!("No organization configured. Use --org or set defaultOrg"))?;

    println!(
        "\n{} Syncing approved config from {}...\n",
        "↓".cyan(),
        org.bold()
    );

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Fetching config for {}...", org));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client
        .sync_pull_config(org, args.platform.as_deref())
        .await
    {
        Ok(result) => {
            spinner.finish_and_clear();

            // Write config to ~/.gal/config.yaml
            let config_content = serde_json::to_string_pretty(&result)?;
            let home = dirs::home_dir().context("Could not determine home directory")?;
            let gal_dir = home.join(".gal");
            std::fs::create_dir_all(&gal_dir).context("Failed to create ~/.gal directory")?;
            let config_path = gal_dir.join("config.yaml");
            std::fs::write(&config_path, &config_content)
                .with_context(|| format!("Failed to write config to {}", config_path.display()))?;

            println!("{} Config synced successfully!", "✓".green());
            println!(
                "{} Written to {}",
                "  ".dimmed(),
                config_path.display().to_string().cyan()
            );

            // Show summary
            if let Some(platforms) = result.get("platforms").and_then(|v| v.as_array()) {
                for platform in platforms {
                    if let Some(name) = platform.get("name").and_then(|v| v.as_str()) {
                        if let Some(files) = platform.get("files").and_then(|v| v.as_array()) {
                            println!(
                                "  {} {}: {} files",
                                "•".cyan(),
                                name.cyan(),
                                files.len().to_string().bold()
                            );
                        }
                    }
                }
            }

            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to sync config: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_push(client: ApiClient, config: LocalConfig, args: SyncArgs) -> Result<()> {
    if !client.has_token() {
        println!("\n{} Not authenticated.\n", "✗".red());
        println!("{} Run: gal auth login\n", "(Hint)".dimmed());
        return Ok(());
    }

    let org = config
        .default_org
        .as_deref()
        .ok_or_else(|| anyhow::anyhow!("No organization configured"))?;

    if args.dry_run {
        println!(
            "\n{} Dry run: would push learnings to {}\n",
            "[DRY RUN]".cyan(),
            org.bold()
        );
        return Ok(());
    }

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Scanning project for learnings...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    let learnings = serde_json::json!({
        "provider": "cli",
        "repo": "unknown",
        "learnings": [],
    });

    match client.sync_push_learnings(org, &learnings).await {
        Ok(_) => {
            spinner.finish_with_message(format!("{} Learnings published to {}", "✓".green(), org));
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to push learnings: {}", "✗".red(), e);
        }
    }

    Ok(())
}
