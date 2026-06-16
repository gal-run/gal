use anyhow::Result;
use clap::Parser;
use colored::*;

use crate::client::{ApiClient, LocalConfig};

#[derive(Parser)]
pub struct StatusArgs {
    /// Output as JSON
    #[arg(long)]
    pub json: bool,
}

pub async fn run(client: ApiClient, args: StatusArgs) -> Result<()> {
    let config = LocalConfig::load()?;
    let is_authed = config.auth_token.is_some();
    let auth_token = config.auth_token.clone();

    if args.json {
        let mut status = serde_json::json!({
            "cli": {
                "installed": true,
                "version": env!("CARGO_PKG_VERSION"),
            },
            "auth": {
                "authenticated": false,
                "user": null,
                "organizations": [],
            },
            "api": {
                "healthy": false,
            },
        });

        if let Some(token) = &auth_token {
            let mut authed = client.clone();
            authed.set_token(token.clone());

            match authed.get_current_user().await {
                Ok(user) => {
                    status["auth"] = serde_json::json!({
                        "authenticated": true,
                        "user": user.login,
                        "email": user.email,
                        "name": user.name,
                        "organizations": user.organizations,
                    });
                }
                Err(_) => {
                    status["auth"] = serde_json::json!({
                        "authenticated": false,
                        "expired": true,
                        "user": null,
                        "organizations": [],
                    });
                }
            }

            match authed.test_connection().await {
                Ok(true) => {
                    status["api"]["healthy"] = serde_json::Value::Bool(true);
                }
                _ => {}
            }
        } else {
            // Test API health without auth
            match client.test_connection().await {
                Ok(true) => {
                    status["api"]["healthy"] = serde_json::Value::Bool(true);
                }
                _ => {}
            }
        }

        println!("{}", serde_json::to_string_pretty(&status)?);
        return Ok(());
    }

    // Human-readable output
    println!("\n{}", "GAL Status".bold());
    println!("{}", "══════════════════════════════════════════".dimmed());
    println!();

    // CLI info
    println!(
        "{}  CLI {} v{}",
        "✓".green(),
        "installed".dimmed(),
        env!("CARGO_PKG_VERSION")
    );

    // Auth state
    if let Some(token) = &auth_token {
        let mut authed = client.clone();
        authed.set_token(token.clone());

        print!("  {} Checking authentication...", "•".dimmed());
        match authed.get_current_user().await {
            Ok(user) => {
                println!("\r  {} Authenticated as {}", "✓".green(), user.login.bold());
                if let Some(email) = &user.email {
                    println!("     Email: {}", email);
                }
                if let Some(orgs) = &user.organizations {
                    if !orgs.is_empty() {
                        println!("     Organizations: {}", orgs.join(", "));
                    }
                }
            }
            Err(_) => {
                println!("\r  {} Token invalid or expired", "✗".red());
                println!("     {} Run: gal auth login", "(Hint)".dimmed());
            }
        }
    } else {
        println!("  {} Not authenticated", "✗".red());
        println!("     {} Run: gal auth login", "(Hint)".dimmed());
    }

    println!();

    // Default org
    if let Some(org) = &config.default_org {
        println!("  Default org: {}", org.bold());
    }

    // API URL
    println!(
        "  API URL: {}",
        config.api_url.as_deref().unwrap_or("https://api.gal.run")
    );

    // Health check
    if is_authed {
        let mut health_client = client.clone();
        if let Some(token) = &auth_token {
            health_client.set_token(token.clone());
        }
        print!("  {} Checking API health...", "•".dimmed());
        match health_client.test_connection().await {
            Ok(true) => {
                println!("\r  {} API is reachable", "✓".green());
            }
            _ => {
                println!("\r  {} API is not reachable", "✗".red());
            }
        }
    } else {
        print!("  {} Checking API health...", "•".dimmed());
        match client.test_connection().await {
            Ok(true) => {
                println!("\r  {} API is reachable", "✓".green());
            }
            _ => {
                println!("\r  {} API is not reachable", "✗".red());
            }
        }
    }

    println!();

    Ok(())
}
