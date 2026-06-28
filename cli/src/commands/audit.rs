use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use colored::*;

use crate::client::ApiClient;

#[derive(Parser)]
pub struct AuditArgs {
    #[command(subcommand)]
    pub command: AuditCommands,
}

#[derive(Subcommand)]
pub enum AuditCommands {
    /// Query the audit log
    Log {
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Filter by event type
        #[arg(long)]
        event: Option<String>,
        /// Filter by actor
        #[arg(long)]
        actor: Option<String>,
        /// Limit results
        #[arg(long, default_value = "50")]
        limit: u64,
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
}

pub async fn run(client: ApiClient, args: AuditArgs) -> Result<()> {
    match args.command {
        AuditCommands::Log {
            org,
            event,
            actor,
            limit,
            json,
        } => cmd_log(client, org, event, actor, limit, json).await,
    }
}

async fn cmd_log(
    client: ApiClient,
    org: Option<String>,
    event: Option<String>,
    actor: Option<String>,
    limit: u64,
    json: bool,
) -> Result<()> {
    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or_else(|| config.default_org.clone())
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Querying audit log...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    // telemetry-svc filters on `action` and `userId`; `org` is advisory (the
    // service scopes results by the JWT org claim). See audit_entries/audit_row
    // below for the matching response projection.
    let mut query = serde_json::json!({
        "org": org,
        "limit": limit,
    });
    if let Some(e) = event {
        query["action"] = serde_json::json!(e);
    }
    if let Some(a) = actor {
        query["userId"] = serde_json::json!(a);
    }

    match client
        .post::<serde_json::Value>("/audit-log/query", Some(&query))
        .await
    {
        Ok(result) => {
            spinner.finish_and_clear();

            if json {
                println!("{}", serde_json::to_string_pretty(&result)?);
                return Ok(());
            }

            let entries = audit_entries(&result);
            println!(
                "\n{} Audit log for {} ({})",
                "Audit Log:".blue().bold(),
                org.bold(),
                entries.len()
            );
            println!("{}", "─".repeat(80).dimmed());

            for entry in &entries {
                let row = audit_row(entry);
                println!(
                    "  {} {} {} {} {}",
                    "•".cyan(),
                    row.timestamp.dimmed(),
                    row.event.yellow(),
                    row.actor,
                    row.details
                );
            }
            println!();
        }
        Err(e) => {
            spinner.finish_and_clear();
            eprintln!("{} Audit log query failed: {}", "✗".red(), e);
        }
    }

    Ok(())
}

/// Extracts the entries array from telemetry-svc's `{ "entries": [...] }` envelope,
/// falling back to a bare top-level array for forward/backward compatibility.
fn audit_entries(result: &serde_json::Value) -> Vec<serde_json::Value> {
    result
        .get("entries")
        .and_then(|v| v.as_array())
        .or_else(|| result.as_array())
        .cloned()
        .unwrap_or_default()
}

/// Display projection of one audit entry. telemetry-svc emits `action` / `userId` /
/// `userName` with `details` as a JSON object; the older shape used `event` / `actor`
/// with a string `details`. We accept either so the CLI renders correctly against both.
struct AuditRow {
    timestamp: String,
    event: String,
    actor: String,
    details: String,
}

fn audit_row(entry: &serde_json::Value) -> AuditRow {
    let str_field =
        |key: &str| entry.get(key).and_then(|v| v.as_str()).filter(|s| !s.is_empty());

    let timestamp = str_field("timestamp").unwrap_or("—").to_string();
    let event = str_field("action")
        .or_else(|| str_field("event"))
        .unwrap_or("—")
        .to_string();
    let actor = str_field("userName")
        .or_else(|| str_field("userId"))
        .or_else(|| str_field("actor"))
        .unwrap_or("—")
        .to_string();
    let details = match entry.get("details") {
        Some(serde_json::Value::String(s)) => s.clone(),
        Some(serde_json::Value::Null) | None => String::new(),
        Some(v) => serde_json::to_string(v).unwrap_or_default(),
    };

    AuditRow {
        timestamp,
        event,
        actor,
        details,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn maps_telemetry_svc_envelope() {
        let resp = json!({
            "entries": [{
                "timestamp": "2026-06-20T10:00:00Z",
                "action": "tool_call",
                "userId": "u_123",
                "userName": "karabil",
                "details": {"tool": "bash", "ok": true}
            }],
            "total": 1, "limit": 50, "offset": 0
        });
        let entries = audit_entries(&resp);
        assert_eq!(entries.len(), 1);
        let row = audit_row(&entries[0]);
        assert_eq!(row.timestamp, "2026-06-20T10:00:00Z");
        assert_eq!(row.event, "tool_call"); // action -> event
        assert_eq!(row.actor, "karabil"); // userName -> actor
        assert!(row.details.contains("bash")); // object -> JSON string
    }

    #[test]
    fn falls_back_to_bare_array_and_userid() {
        let resp = json!([{
            "timestamp": "t",
            "action": "x",
            "userId": "u_1",
            "details": "plain"
        }]);
        let entries = audit_entries(&resp);
        assert_eq!(entries.len(), 1);
        let row = audit_row(&entries[0]);
        assert_eq!(row.event, "x");
        assert_eq!(row.actor, "u_1"); // no userName -> userId
        assert_eq!(row.details, "plain"); // string details passthrough
    }

    #[test]
    fn empty_entry_uses_placeholders() {
        let row = audit_row(&json!({}));
        assert_eq!(row.timestamp, "—");
        assert_eq!(row.event, "—");
        assert_eq!(row.actor, "—");
        assert_eq!(row.details, "");
    }
}
