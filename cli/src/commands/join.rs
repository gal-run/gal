use anyhow::Result;
use clap::Parser;
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct JoinArgs {
    /// Invite code
    #[arg(long)]
    pub code: Option<String>,

    /// Developer email
    #[arg(long)]
    pub email: Option<String>,

    /// Validate invite without joining
    #[arg(long)]
    pub dry_run: bool,
}

pub async fn run(client: ApiClient, args: JoinArgs) -> Result<()> {
    let code = match &args.code {
        Some(c) => c.clone(),
        None => {
            println!("\nGAL Developer Onboarding\n");
            println!("To join your organization, you need an invite code from your CISO.");
            println!("{}", "\nUsage:".dimmed());
            println!("{}", "  gal join --code GAL-XXXX-XXXX".cyan());
            println!(
                "{}",
                "\nContact your security team if you haven't received one.\n".dimmed()
            );
            return Ok(());
        }
    };

    // Determine email
    let email = match &args.email {
        Some(e) => e.clone(),
        None => get_git_email().unwrap_or_default(),
    };

    if email.is_empty() {
        eprintln!("{} Error: Could not determine your email.", "✗".red());
        println!("{} Use --email <your-email> or configure git:", "(Hint)".dimmed());
        println!("{}   git config user.email your@email.com", "  ".dimmed());
        return Ok(());
    }

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message(format!("Validating invite code {}...", code.bold()));
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client.validate_invite(&code).await {
        Ok(validation) => {
            spinner.finish_and_clear();

            if !validation.get("valid").and_then(|v| v.as_bool()).unwrap_or(false) {
                eprintln!(
                    "{} Invalid invite code: {}",
                    "✗".red(),
                    validation
                        .get("error")
                        .and_then(|v| v.as_str())
                        .unwrap_or("Unknown error")
                );
                println!(
                    "{} Contact your organization administrator for a valid code.",
                    "(Hint)".dimmed()
                );
                return Ok(());
            }

            let org = validation
                .get("organization")
                .and_then(|v| v.as_object())
                .ok_or_else(|| anyhow::anyhow!("Missing organization info"))?;

            let org_name = org
                .get("name")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            let plan_tier = org
                .get("planTier")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown");
            let seats_used = org.get("seatsUsed").and_then(|v| v.as_i64()).unwrap_or(0);
            let seats_limit = org.get("seatsLimit").and_then(|v| v.as_i64()).unwrap_or(-1);

            println!("\n{}", "Organization Details:".blue());
            println!("  Name:  {}", org_name.bold());
            println!("  Plan:  {}", plan_tier.bold());
            println!(
                "  Seats: {}/{} used",
                seats_used,
                if seats_limit == -1 {
                    "∞".to_string()
                } else {
                    seats_limit.to_string()
                }
            );

            if args.dry_run {
                println!(
                    "\n{} [Dry run] Validation successful. No changes made.\n",
                    "[DRY RUN]".cyan()
                );
                return Ok(());
            }

            // Accept the invite
            let accept_spinner = indicatif::ProgressBar::new_spinner();
            accept_spinner.set_message(format!("Joining {}...", org_name));
            accept_spinner.enable_steady_tick(std::time::Duration::from_millis(100));

            let hostname = hostname();
            let machine_id = machine_id();

            match client
                .accept_invite(&code, &email, &machine_id, &hostname)
                .await
            {
                Ok(result) => {
                    accept_spinner.finish_with_message(format!(
                        "{} Joined {}",
                        "✓".green(),
                        org_name.bold()
                    ));

                    println!("\nDeveloper Registration:");
                    if let Some(dev_id) = result.get("developerId").and_then(|v| v.as_str()) {
                        println!("  Developer ID: {}", dev_id.cyan());
                    }
                    println!("  Email: {}", email);

                    println!("\n{}", "✓ Setup Complete!".green().bold());
                    println!(
                        "You are now enrolled in {}'s fleet management.",
                        org_name
                    );
                    println!();

                    // Save org info to config
                    let mut config = crate::client::LocalConfig::load()?;
                    config.default_org = Some(org_name.to_string());
                    if let Some(dev_id) = result.get("developerId").and_then(|v| v.as_str()) {
                        // Store developer id in config
                        let _ = dev_id;
                    }
                    config.save()?;
                }
                Err(e) => {
                    accept_spinner.finish_and_clear();
                    eprintln!("{} Failed to join organization: {}", "✗".red(), e);
                }
            }
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Error validating invite: {}", "✗".red(), e);
        }
    }

    Ok(())
}

fn get_git_email() -> Option<String> {
    std::process::Command::new("git")
        .args(["config", "user.email"])
        .output()
        .ok()
        .and_then(|o| {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if s.is_empty() { None } else { Some(s) }
        })
}

fn hostname() -> String {
    std::process::Command::new("hostname")
        .output()
        .ok()
        .and_then(|o| {
            let s = String::from_utf8_lossy(&o.stdout).trim().to_string();
            if s.is_empty() { None } else { Some(s) }
        })
        .unwrap_or_else(|| "unknown".to_string())
}

/// A stable per-machine identifier.
///
/// Prefers the OS machine id (`/etc/machine-id` or `/var/lib/dbus/machine-id`
/// on Linux), otherwise persists a random UUID under `~/.gal/machine_id` (0600)
/// and reuses it on subsequent runs. Never returns a constant — a constant would
/// make every install indistinguishable to the server.
fn machine_id() -> String {
    // Linux: the OS-provided stable id.
    for p in ["/etc/machine-id", "/var/lib/dbus/machine-id"] {
        if let Ok(s) = std::fs::read_to_string(p) {
            let s = s.trim();
            if !s.is_empty() {
                return s.to_string();
            }
        }
    }
    // Otherwise: a CLI-managed UUID persisted with owner-only perms.
    let path = dirs::home_dir()
        .map(|h| h.join(".gal").join("machine_id"))
        .unwrap_or_else(|| std::path::PathBuf::from(".gal_machine_id"));
    if let Ok(s) = std::fs::read_to_string(&path) {
        let s = s.trim();
        if !s.is_empty() {
            return s.to_string();
        }
    }
    let id = uuid::Uuid::new_v4().to_string();
    if let Some(parent) = path.parent() {
        let _ = std::fs::create_dir_all(parent);
    }
    if std::fs::write(&path, &id).is_ok() {
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let _ = std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600));
        }
    }
    id
}
