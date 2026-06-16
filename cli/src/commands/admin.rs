use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct AdminArgs {
    #[command(subcommand)]
    pub command: AdminSubcommand,
}

#[derive(Subcommand)]
pub enum AdminSubcommand {
    /// Grant a plan to an organization
    GrantPlan {
        /// Organization name
        org: String,

        /// Plan tier: free, convenience, enforcement, enterprise
        plan: String,
    },
    /// List all organizations
    ListOrgs {
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
}

pub async fn run(client: ApiClient, args: AdminArgs) -> Result<()> {
    match args.command {
        AdminSubcommand::GrantPlan { org, plan } => cmd_grant_plan(client, &org, &plan).await,
        AdminSubcommand::ListOrgs { json } => cmd_list_orgs(client, json).await,
    }
}

async fn cmd_grant_plan(client: ApiClient, org: &str, plan: &str) -> Result<()> {
    let valid_plans = ["free", "convenience", "enforcement", "enterprise"];
    if !valid_plans.contains(&plan) {
        return Err(anyhow!(
            "Invalid plan '{}'. Valid plans: {}",
            plan,
            valid_plans.join(", ")
        ));
    }

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Granting {} plan to {}...", plan.cyan(), org.cyan()));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client.grant_plan(org, plan, "Admin grant").await {
        Ok(result) => {
            spinner.finish_with_message(format!(
                "{} Plan granted successfully!",
                "✓".green()
            ));

            println!("\n{}", "Grant Details:".blue());
            println!("  Organization: {}", result.organization.white());
            println!("  Plan: {}", result.plan_tier.cyan());
            println!(
                "  Seat Limit: {}",
                if result.seat_limit == -1 {
                    "Unlimited".green()
                } else {
                    result.seat_limit.to_string().white()
                }
            );
            println!("  Granted By: {}", result.granted_by.dimmed());
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to grant plan: {}", "✗".red(), e);
        }
    }

    Ok(())
}

async fn cmd_list_orgs(client: ApiClient, json: bool) -> Result<()> {
    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Fetching organizations...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client.list_organizations_admin().await {
        Ok(result) => {
            spinner.finish_and_clear();

            if json {
                println!("{}", serde_json::to_string_pretty(&result)?);
                return Ok(());
            }

            println!(
                "\n{} Organizations ({})\n",
                "Organizations:".blue().bold(),
                result.total.to_string().bold()
            );
            println!("{}", "─".repeat(70).dimmed());

            for org in &result.organizations {
                let plan_color = match org.plan_tier.as_str() {
                    "enterprise" => org.plan_tier.magenta(),
                    "enforcement" => org.plan_tier.yellow(),
                    "convenience" => org.plan_tier.cyan(),
                    _ => org.plan_tier.dimmed(),
                };

                println!(
                    "{}",
                    org.name.white()
                );
                println!(
                    "  Plan: {} | Seats: {} | Configs: {}",
                    plan_color,
                    if org.seat_limit == -1 {
                        "Unlimited".green()
                    } else {
                        org.seat_limit.to_string().white()
                    },
                    org.total_configs
                );

                if let Some(grant) = &org.manual_grant {
                    if let Some(granted_by) = grant.get("grantedBy").and_then(|v| v.as_str()) {
                        if let Some(granted_at) = grant.get("grantedAt").and_then(|v| v.as_str()) {
                            println!(
                                "  {} [Legacy] Manual grant by {} on {}",
                                "  ".dimmed(),
                                granted_by,
                                granted_at
                            );
                        }
                    }
                }

                println!();
            }

            println!("{}", "─".repeat(70).dimmed());

            // Summary by plan
            let mut by_plan: std::collections::HashMap<String, i64> =
                std::collections::HashMap::new();
            for org in &result.organizations {
                *by_plan.entry(org.plan_tier.clone()).or_insert(0) += 1;
            }

            println!("\n{}", "Summary:".blue());
            println!(
                "  Free: {} | Convenience: {} | Enforcement: {} | Enterprise: {}",
                by_plan.get("free").unwrap_or(&0),
                by_plan.get("convenience").unwrap_or(&0),
                by_plan.get("enforcement").unwrap_or(&0),
                by_plan.get("enterprise").unwrap_or(&0),
            );
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Failed to list organizations: {}", "✗".red(), e);
        }
    }

    Ok(())
}
