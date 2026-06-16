use anyhow::Result;
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct DocsArgs {
    #[command(subcommand)]
    pub command: DocsCommands,
}

#[derive(Subcommand)]
pub enum DocsCommands {
    /// Generate markdown documentation from config
    Generate {
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Output directory
        #[arg(long, default_value = "./docs")]
        output: String,
        /// Platform (default: claude)
        #[arg(long, default_value = "claude")]
        platform: String,
    },
}

pub async fn run(client: ApiClient, args: DocsArgs) -> Result<()> {
    match args.command {
        DocsCommands::Generate {
            org,
            output,
            platform,
        } => cmd_generate(client, org, &output, &platform).await,
    }
}

async fn cmd_generate(
    client: ApiClient,
    org: Option<String>,
    output: &str,
    platform: &str,
) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow::anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Fetching approved config...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client.get_approved_config(&org, platform).await {
        Ok(approved) => {
            spinner.finish_and_clear();

            // Create output directory
            std::fs::create_dir_all(output)
                .map_err(|e| anyhow::anyhow!("Failed to create output directory: {}", e))?;

            let mut doc = String::new();
            doc.push_str(&format!("# GAL Config - {} ({})\n\n", org, platform));
            doc.push_str("> Auto-generated documentation\n\n");

            // Version info
            if let Some(version) = approved.get("version").and_then(|v| v.as_str()) {
                doc.push_str(&format!("**Version:** {}\n\n", version));
            }
            if let Some(approved_at) = approved.get("approvedAt").and_then(|v| v.as_str()) {
                doc.push_str(&format!("**Approved At:** {}\n\n", approved_at));
            }
            if let Some(approved_by) = approved.get("approvedBy").and_then(|v| v.as_str()) {
                doc.push_str(&format!("**Approved By:** {}\n\n", approved_by));
            }

            // Commands
            if let Some(commands) = approved.get("commands").and_then(|v| v.as_array()) {
                if !commands.is_empty() {
                    doc.push_str("## Commands\n\n");
                    doc.push_str("| Name | Description |\n|------|-------------|\n");
                    for cmd in commands {
                        let name = cmd.get("name").and_then(|v| v.as_str()).unwrap_or("");
                        let desc = cmd.get("description").and_then(|v| v.as_str()).unwrap_or("");
                        doc.push_str(&format!("| `{}` | {} |\n", name, desc));
                    }
                    doc.push('\n');
                }
            }

            // Agents
            if let Some(agents) = approved.get("subagents").and_then(|v| v.as_array()) {
                if !agents.is_empty() {
                    doc.push_str("## Agents\n\n");
                    doc.push_str("| Name | Model | Description |\n|------|-------|-------------|\n");
                    for agent in agents {
                        let name = agent.get("name").and_then(|v| v.as_str()).unwrap_or("");
                        let model = agent.get("model").and_then(|v| v.as_str()).unwrap_or("");
                        let desc = agent.get("description").and_then(|v| v.as_str()).unwrap_or("");
                        doc.push_str(&format!("| `{}` | {} | {} |\n", name, model, desc));
                    }
                    doc.push('\n');
                }
            }

            // Skills
            if let Some(skills) = approved.get("skills").and_then(|v| v.as_array()) {
                if !skills.is_empty() {
                    doc.push_str("## Skills\n\n");
                    doc.push_str("| Name | Description |\n|------|-------------|\n");
                    for skill in skills {
                        let name = skill.get("name").and_then(|v| v.as_str()).unwrap_or("");
                        let desc = skill.get("description").and_then(|v| v.as_str()).unwrap_or("");
                        doc.push_str(&format!("| `{}` | {} |\n", name, desc));
                    }
                    doc.push('\n');
                }
            }

            // Rules
            if let Some(rules) = approved.get("rules").and_then(|v| v.as_array()) {
                if !rules.is_empty() {
                    doc.push_str("## Rules\n\n");
                    for rule in rules {
                        let content = rule.get("content").and_then(|v| v.as_str()).unwrap_or("");
                        doc.push_str(&format!("- {}\n", content));
                    }
                    doc.push('\n');
                }
            }

            // Instructions
            if let Some(instructions) = approved.get("instructions").and_then(|v| v.as_str()) {
                doc.push_str("## Instructions\n\n");
                doc.push_str(&format!("{}\n\n", instructions));
            }

            // Write file
            let filepath = format!("{}/gal-{}-config.md", output, org);
            std::fs::write(&filepath, &doc)
                .map_err(|e| anyhow::anyhow!("Failed to write docs: {}", e))?;

            println!(
                "\n{} Documentation generated for \"{}\" ({})",
                "✓".green(),
                org.bold(),
                platform.cyan()
            );
            println!("  Output: {}", filepath.cyan());
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Docs generation failed: {}", "✗".red(), e);
        }
    }

    Ok(())
}
