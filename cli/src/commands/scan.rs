use anyhow::Result;
use clap::Parser;
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct ScanArgs {
    /// Organization name
    #[arg(long)]
    pub org: Option<String>,

    /// Repository to scan (optional)
    #[arg(long)]
    pub repo: Option<String>,

    /// Directory to scan locally
    #[arg(long)]
    pub dir: Option<String>,
}

pub async fn run(client: ApiClient, args: ScanArgs) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;

    if !client.has_token() {
        println!("\n{} Not authenticated. Run: gal auth login\n", "✗".red());
        return Ok(());
    }

    let org = args
        .org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow::anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    if let Some(repo) = &args.repo {
        spinner.set_message(format!("Scanning {} in {}...", repo.cyan(), org.cyan()));
    } else {
        spinner.set_message(format!("Scanning for AI configs in {}...", org.cyan()));
    }
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    let mut body = serde_json::json!({});
    if let Some(repo) = &args.repo {
        body["repo"] = serde_json::json!(repo);
    }
    if let Some(dir) = &args.dir {
        body["dir"] = serde_json::json!(dir);
    }

    // Add org to the body for the /discovery endpoint
    body["org"] = serde_json::json!(org);
    match client
        .post::<serde_json::Value>(
            "/discovery",
            Some(&body),
        )
        .await
    {
        Ok(result) => {
            spinner.finish_with_message(format!("{} Scan complete!", "✓".green()));

            let found = result.get("found").and_then(|v| v.as_u64()).unwrap_or(0);
            let new = result.get("new").and_then(|v| v.as_u64()).unwrap_or(0);

            println!("  Organization: {}", org.bold());
            if let Some(repo) = &args.repo {
                println!("  Repo: {}", repo);
            }
            println!("  Total configs found: {}", found);
            println!("  Newly discovered: {}", new);

            if let Some(configs) = result.get("configs").and_then(|v| v.as_array()) {
                if !configs.is_empty() {
                    println!();
                    println!("{}", "Discovered configs:".bold());
                    for cfg in configs {
                        let name = cfg.get("name").and_then(|v| v.as_str()).unwrap_or("unknown");
                        let path = cfg.get("path").and_then(|v| v.as_str()).unwrap_or("");
                        println!("  {} {} ({})", "•".cyan(), name, path.dimmed());
                    }
                }
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Scan failed: {}", "✗".red(), e);
        }
    }

    Ok(())
}
