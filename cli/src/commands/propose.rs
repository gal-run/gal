use anyhow::Result;
use clap::Parser;
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct ProposeArgs {
    /// Description of the proposed changes
    pub description: Option<String>,

    /// Organization name
    #[arg(long)]
    pub org: Option<String>,
}

pub async fn run(client: ApiClient, args: ProposeArgs) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;

    if !client.has_token() {
        println!("\n{} Not authenticated. Run: gal auth login\n", "✗".red());
        return Ok(());
    }

    let org = args
        .org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow::anyhow!("No organization configured. Use --org or set defaultOrg"))?;

    let description = args.description.unwrap_or_default();

    println!(
        "\n{}",
        "═══════════════════════════════════════════════════".green()
    );
    println!("{}", "  GAL Config Proposal".green());
    println!(
        "{}\n",
        "═══════════════════════════════════════════════════".green()
    );

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Creating proposal...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    let content = serde_json::json!({
        "description": description,
        "source": "cli",
    });

    match client
        .create_proposal("org", &org, None, Some(&description), &content)
        .await
    {
        Ok(response) => {
            spinner.finish_and_clear();

            println!("{} Proposal created!", "✓".green());

            if let Some(id) = response.get("id").and_then(|v| v.as_str()) {
                println!("  Proposal ID: {}", id.cyan());
            }
            if let Some(status) = response.get("status").and_then(|v| v.as_str()) {
                println!("  Status: {}", status.yellow());
            }
            println!("  Scope: {}", "Organization".green());
            println!("  Organization: {}", org.bold());

            println!();
            println!("{}", "═══════════════════════════════════════════════════".green());
            println!("{}", "  ✓ Proposal submitted for admin review".green());
            println!("{}", "═══════════════════════════════════════════════════".green());
            println!(
                "\n{} Track status: gal status\n",
                "(Hint)".dimmed()
            );
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Error: {}", "✗".red(), e);
        }
    }

    Ok(())
}
