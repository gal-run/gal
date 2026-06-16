use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct EnforceArgs {
    #[command(subcommand)]
    pub command: EnforceCommands,
}

#[derive(Subcommand)]
pub enum EnforceCommands {
    /// Install product issue gate hook (kebab-case alias)
    #[command(name = "product-issue-hook")]
    ProductIssueHook {
        /// Repository path
        #[arg(default_value = ".")]
        repo_path: String,
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Output in JSON format
        #[arg(long, default_value = "false")]
        json: bool,
        /// Force overwrite existing hook
        #[arg(long, default_value = "false")]
        force: bool,
    },
    /// Evaluate product-status issue gates for local agent hooks
    #[command(name = "product-issue")]
    ProductIssue {
        #[command(subcommand)]
        command: ProductIssueCommands,
    },
}

#[derive(Subcommand)]
pub enum ProductIssueCommands {
    /// Install product issue gate hook
    Hook {
        /// Repository path
        #[arg(default_value = ".")]
        repo_path: String,
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Output in JSON format
        #[arg(long, default_value = "false")]
        json: bool,
        /// Force overwrite existing hook
        #[arg(long, default_value = "false")]
        force: bool,
    },
}

pub async fn run(_client: ApiClient, args: EnforceArgs) -> Result<()> {
    match args.command {
        EnforceCommands::ProductIssueHook { repo_path, org, json, force } => {
            cmd_install_hook(&repo_path, org.unwrap_or_else(|| "default".to_string()), json, force)?;
            Ok(())
        }
        EnforceCommands::ProductIssue { command } => match command {
            ProductIssueCommands::Hook { repo_path, org, json, force } => {
                cmd_install_hook(&repo_path, org.unwrap_or_else(|| "default".to_string()), json, force)?;
                Ok(())
            }
        },
    }
}

fn cmd_install_hook(repo_path: &str, org: String, json: bool, force: bool) -> Result<()> {
    let git_dir = std::path::Path::new(repo_path).join(".git");
    if !git_dir.exists() {
        if json {
            println!(r#"{{"status":"error","message":"not a git repository"}}"#);
            std::process::exit(1);
        }
        return Err(anyhow!("Not a git repository: {}", repo_path));
    }

    let hooks_dir = std::path::Path::new(repo_path).join(".git").join("hooks");
    let hook_path = hooks_dir.join("prepare-commit-msg");

    if hook_path.exists() && !force {
        if json {
            println!(r#"{{"status":"exists","path":"{}"}}"#, hook_path.display());
            return Ok(());
        }
        println!("\n{} Hook already exists at {}", "!".yellow(), hook_path.display().to_string().cyan());
        println!("  {} Overwrite with --force", "(Hint)".dimmed());
        println!();
        return Ok(());
    }

    let hook_script = format!(
        r#"#!/bin/bash
# GAL Product Issue Gate Hook
# Installed by gal enforce product-issue-hook
# Organization: {org}

echo "[GAL] Checking commit message for product issue reference..."
COMMIT_MSG_FILE="$1"
COMMIT_SOURCE="$2"
SHA1="$3"

if ! grep -qE '(PROD-[0-9]+|GAL-[0-9]+|fixes #[0-9]+)' "$COMMIT_MSG_FILE"; then
  echo "[GAL] WARNING: No product issue reference found in commit message."
  echo "[GAL] Consider adding PROD-XXX, GAL-XXX or fixes #XXX to your commit message."
fi

exit 0
"#,
    );

    std::fs::create_dir_all(&hooks_dir)
        .map_err(|e| anyhow!("Failed to create hooks directory: {}", e))?;

    std::fs::write(&hook_path, &hook_script)
        .map_err(|e| anyhow!("Failed to write hook script: {}", e))?;

    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let perms = std::fs::Permissions::from_mode(0o755);
        std::fs::set_permissions(&hook_path, perms)
            .map_err(|e| anyhow!("Failed to set hook permissions: {}", e))?;
    }

    if json {
        println!(r#"{{"status":"installed","path":"{}"}}"#, hook_path.display());
    } else {
        println!("\n{} Product issue gate hook installed!", "✓".green());
        println!("  Path: {}", hook_path.display().to_string().cyan());
        println!("  {}", "Commit messages will be checked for issue references.".dimmed());
        println!();
    }
    Ok(())
}
