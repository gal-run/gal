//! `gal delegation` — the governance ENGINE (the PDP), ported from Scheduler-Systems'
//! `agent_toolkit/authority.py` + `hitl.py` so the routing/HITL DECISION lives in GAL, not
//! hardcoded in a product fleet. The fleet keeps only the thin PEP (it calls these and then does the
//! LangGraph `interrupt()`); the decision of *who approves* / *does this need a human* is GAL's.
//!
//!   * `gal delegation route   --mandate <delegation.yaml> --decision <json>` — who approves THIS
//!     decision: almost always an agent-officer (cfo/cto/hr/ceo/board), the owner only at the
//!     bright line. Default-deny, escalate-up, owner-reserved by kind AND force-flags, fail-closed
//!     on non-finite/negative spend, live only when the owner signed (status==granted AND
//!     granted_by==owner). Faithful port of authority.route().
//!   * `gal delegation hitl    --action <json>` — does this action need a human in the loop (the
//!     ratified "always needs a human" policy). Port of hitl.human_required().
//!
//! Decisions/actions are parsed as YAML values (JSON ⊂ YAML) so one accessor set covers both.
//! Pure functions, unit-tested directly incl. the adversarial red-team regressions. NOT ML.

use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use colored::*;
use serde_yaml::Value;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use crate::client::ApiClient;

const RESERVED_FLAGS: [&str; 8] = [
    "touches_billing", "touches_paying_customers", "moves_real_money", "changes_entity",
    "changes_captable", "changes_mandate", "security_rules", "appoints_board",
];
const GOVERNANCE_PATHS: [&str; 1] = ["docs/governance/"];

// ---- the ratified "always needs a human" policy (hitl.human_required) ----
const HUMAN_REQUIRED_KINDS: [&str; 7] = [
    "oss_contribution", "message_to_person", "publish", "account_change",
    "permission_change", "paying_customer_action", "spend_money",
];
const INTERNAL_SAFE_VERBS: [&str; 2] = ["read", "propose"];

#[derive(Debug, Clone, serde::Serialize)]
pub struct Verdict {
    pub approver: String,
    pub tier: String,
    pub reason: String,
    pub active: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub within_limit: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub would_be: Option<String>,
}

fn owner(reason: &str, active: bool, within: Option<bool>) -> Verdict {
    Verdict { approver: "owner".into(), tier: "owner".into(), reason: reason.into(),
              active, within_limit: within, would_be: None }
}

/// Finite, non-negative f64 or None (fail closed). Rejects NaN/±inf/negative/non-number.
fn finite_nonneg(v: Option<&Value>) -> Option<f64> {
    match v {
        Some(Value::Bool(_)) | None => None,   // a bool is not an amount
        Some(x) => x.as_f64().filter(|f| f.is_finite() && *f >= 0.0),
    }
}

/// A force-flag counts when PRESENT and not literally `false` (a falsy 0/""/null still flags).
fn flagged_reserved(decision: &Value) -> Option<&'static str> {
    let map = decision.as_mapping()?;
    for flag in RESERVED_FLAGS {
        if let Some(val) = map.get(Value::String(flag.to_string())) {
            if val != &Value::Bool(false) {
                return Some(flag);
            }
        }
    }
    None
}

fn str_set(v: Option<&Value>) -> BTreeSet<String> {
    v.and_then(|x| x.as_sequence())
        .map(|s| s.iter().filter_map(|e| e.as_str().map(String::from)).collect())
        .unwrap_or_default()
}

fn is_granted(mandate: &Value) -> bool {
    let owner = mandate.get("owner").and_then(|v| v.as_str());
    owner.is_some()
        && mandate.get("status").and_then(|v| v.as_str()) == Some("granted")
        && mandate.get("granted_by").and_then(|v| v.as_str()) == owner
}

fn within_limit(decision: &Value, caps: &Value) -> bool {
    if let Some(amt) = decision.get("amount_usd") {
        let a = finite_nonneg(Some(amt));
        let cap = finite_nonneg(caps.get("max_officer_spend_usd"));
        return match (a, cap) {
            (Some(a), Some(cap)) => a <= cap,
            _ => false, // bad amount or missing/invalid cap → deny
        };
    }
    decision.get("within_policy") == Some(&Value::Bool(true))
}

/// Faithful port of authority.route(). `decision` + `mandate` are YAML values.
pub fn route(decision: &Value, mandate: &Value) -> Verdict {
    let kind = decision.get("kind").and_then(|v| v.as_str()).unwrap_or("").trim().to_string();
    let reserved = str_set(mandate.get("owner_reserved"));
    let empty = Value::Mapping(Default::default());
    let caps = mandate.get("mandate").unwrap_or(&empty);
    let granted = is_granted(mandate);

    // 1) force-flags → owner
    if let Some(flag) = flagged_reserved(decision) {
        return owner(&format!("force-flagged '{}' — owner-reserved (bright line), never delegable", flag), granted, None);
    }
    // 2) owner-reserved by kind → owner
    if reserved.contains(&kind) {
        return owner(&format!("'{}' is owner-reserved (bright line) — never delegable", kind), granted, None);
    }
    // 3) spend validity + bet-the-company (NaN/inf/negative all fail closed)
    if let Some(amt) = decision.get("amount_usd") {
        let a = finite_nonneg(Some(amt));
        let board_cap = finite_nonneg(caps.get("max_board_spend_usd"));
        match (a, board_cap) {
            (None, _) => return owner("invalid spend amount (non-finite/negative/unparseable) — default-deny", granted, Some(false)),
            (_, None) => return owner("spend cap misconfigured — default-deny to owner", granted, Some(false)),
            (Some(a), Some(board_cap)) if a > board_cap =>
                return owner("spend exceeds board authority — bet-the-company, owner-reserved", granted, Some(false)),
            _ => {}
        }
    }
    // 4) lane lookup; unknown → owner
    let lane = mandate.get("authorities").and_then(|a| a.get(&kind));
    let lane = match lane {
        Some(l) => l,
        None => return owner(&format!("no delegated authority for '{}' — default-deny, owner decides", kind), granted, Some(false)),
    };
    let decider = lane.get("decider").and_then(|v| v.as_str()).unwrap_or("owner").to_string();
    let within = within_limit(decision, caps);

    // 5) inert until granted
    if !granted {
        return Verdict { approver: "owner".into(), tier: "owner".into(),
            reason: "delegation mandate not yet granted by the owner — owner decides (inert)".into(),
            active: false, within_limit: Some(within), would_be: Some(decider) };
    }
    // 6) granted: officer if within, else escalate
    if within {
        return Verdict { approver: decider.clone(), tier: "officer".into(),
            reason: format!("within {}'s delegated authority", decider),
            active: true, within_limit: Some(true), would_be: None };
    }
    let nxt = lane.get("escalates_to").and_then(|v| v.as_sequence())
        .and_then(|s| s.first()).and_then(|v| v.as_str()).unwrap_or("owner").to_string();
    let tier = if nxt == "owner" { "owner" } else if nxt == "board" { "board" } else { "officer" };
    Verdict { approver: nxt.clone(), tier: tier.into(),
        reason: format!("exceeds {}'s limit — escalates to {}", decider, nxt),
        active: true, within_limit: Some(false), would_be: None }
}

pub fn reaches_owner(decision: &Value, mandate: &Value) -> bool {
    route(decision, mandate).approver == "owner"
}

/// Paths under the governance dir — editing them is `change_mandate` (owner-reserved).
pub fn constitution_paths(paths: &[String]) -> Vec<String> {
    paths.iter().filter(|p| GOVERNANCE_PATHS.iter().any(|g| p.contains(g))).cloned().collect()
}

/// Port of hitl.human_required(). Returns (required, reason).
pub fn human_required(action: &Value) -> (bool, String) {
    let kind = action.get("kind").and_then(|v| v.as_str()).unwrap_or("").trim().to_lowercase();
    if HUMAN_REQUIRED_KINDS.contains(&kind.as_str()) {
        return (true, format!("'{}' is a ratified human-in-the-loop action", kind));
    }
    let external = action.get("external").and_then(|v| v.as_bool()).unwrap_or(false)
        || action.get("public").and_then(|v| v.as_bool()).unwrap_or(false);
    let outward = action.get("outward").and_then(|v| v.as_bool()).unwrap_or(false) || external;
    let cap = action.get("capability").and_then(|v| v.as_str()).unwrap_or("");
    let verb = cap.split(':').next().unwrap_or("").trim().to_lowercase();

    if INTERNAL_SAFE_VERBS.contains(&verb.as_str()) && !outward {
        return (false, "internal, reversible action (autonomous)".into());
    }
    if outward {
        return (true, "outward-facing or irreversible — reaches a person or the public".into());
    }
    if external && matches!(verb.as_str(), "write" | "post" | "git") {
        return (true, "external write/post/push — outward-facing".into());
    }
    (false, "internal action (autonomous)".into())
}

// ───────────────────────── CLI ─────────────────────────

#[derive(Parser)]
pub struct DelegationArgs {
    #[command(subcommand)]
    pub command: DelegationCommands,
}

#[derive(Subcommand)]
pub enum DelegationCommands {
    /// Who approves a decision under the owner's delegation mandate (officer vs. owner)
    Route {
        /// Path to the delegation mandate YAML
        #[arg(long)]
        mandate: PathBuf,
        /// The decision as JSON, e.g. '{"kind":"spend","amount_usd":50}'
        #[arg(long)]
        decision: String,
        #[arg(long)]
        json: bool,
    },
    /// Does an action require a human in the loop (the ratified HITL policy)
    Hitl {
        /// The action as JSON, e.g. '{"kind":"oss_contribution"}'
        #[arg(long)]
        action: String,
        #[arg(long)]
        json: bool,
    },
}

pub async fn run(_client: ApiClient, args: DelegationArgs) -> Result<()> {
    match args.command {
        DelegationCommands::Route { mandate, decision, json } => cmd_route(&mandate, &decision, json),
        DelegationCommands::Hitl { action, json } => cmd_hitl(&action, json),
    }
}

fn parse_value(s: &str, what: &str) -> Result<Value> {
    serde_yaml::from_str(s).map_err(|e| anyhow!("invalid {} JSON: {}", what, e))
}

fn cmd_route(mandate_path: &Path, decision: &str, json: bool) -> Result<()> {
    let mandate: Value = serde_yaml::from_str(
        &std::fs::read_to_string(mandate_path).map_err(|e| anyhow!("cannot read mandate {}: {}", mandate_path.display(), e))?,
    ).map_err(|e| anyhow!("mandate is not valid YAML: {}", e))?;
    let decision = parse_value(decision, "decision")?;
    let v = route(&decision, &mandate);
    if json {
        println!("{}", serde_json::to_string_pretty(&v)?);
    } else {
        let who = if v.approver == "owner" { v.approver.red().bold() } else { v.approver.green().bold() };
        println!("approver: {} ({})  active={}\n  {}", who, v.tier, v.active, v.reason);
    }
    Ok(())
}

fn cmd_hitl(action: &str, json: bool) -> Result<()> {
    let action = parse_value(action, "action")?;
    let (required, reason) = human_required(&action);
    if json {
        println!("{}", serde_json::to_string_pretty(&serde_json::json!({"required": required, "reason": reason}))?);
    } else {
        let r = if required { "HUMAN REQUIRED".red().bold() } else { "autonomous".green() };
        println!("{} — {}", r, reason);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn y(s: &str) -> Value { serde_yaml::from_str(s).expect("yaml") }

    // a granted, signed mandate with SYNTHETIC non-zero caps for spend-routing logic tests
    fn granted(officer: i64, board: i64) -> Value {
        y(&format!(r#"
owner: shay
status: granted
granted_by: shay
mandate: {{max_officer_spend_usd: {officer}, max_board_spend_usd: {board}}}
owner_reserved: [change_mandate, live_billing_or_pricing, security_rules_first_deploy,
                 entity_or_captable, bet_the_company_spend, appoint_or_replace_board]
authorities:
  spend: {{decider: cfo, escalates_to: [board, owner]}}
  hire_fire: {{decider: hr_ops_manager, escalates_to: [board, owner]}}
"#))
    }
    fn d(s: &str) -> Value { y(s) }

    #[test] fn within_limit_goes_to_officer() {
        assert_eq!(route(&d(r#"{kind: spend, amount_usd: 10}"#), &granted(100, 1000)).approver, "cfo");
    }
    #[test] fn over_officer_escalates_to_board() {
        assert_eq!(route(&d(r#"{kind: spend, amount_usd: 500}"#), &granted(100, 1000)).approver, "board");
    }
    #[test] fn owner_reserved_kind_reaches_owner() {
        assert_eq!(route(&d(r#"{kind: live_billing_or_pricing}"#), &granted(100, 1000)).approver, "owner");
    }
    // --- red-team regressions (must all reach the owner) ---
    #[test] fn nan_string_spend_reaches_owner() {
        assert_eq!(route(&d(r#"{kind: spend, amount_usd: "nan"}"#), &granted(100, 1000)).approver, "owner");
    }
    #[test] fn negative_spend_reaches_owner() {
        assert_eq!(route(&d(r#"{kind: spend, amount_usd: -5}"#), &granted(100, 1000)).approver, "owner");
    }
    #[test] fn bool_amount_reaches_owner() {
        assert_eq!(route(&d(r#"{kind: spend, amount_usd: true}"#), &granted(100, 1000)).approver, "owner");
    }
    #[test] fn falsy_present_flag_reaches_owner() {
        for v in ["0", "\"\"", "null"] {
            let dec = d(&format!(r#"{{kind: spend, amount_usd: 5, touches_billing: {v}}}"#));
            assert_eq!(route(&dec, &granted(100, 1000)).approver, "owner", "flag {v} must flag");
        }
    }
    #[test] fn explicit_false_flag_does_not_force_owner() {
        assert_eq!(route(&d(r#"{kind: spend, amount_usd: 5, touches_billing: false}"#), &granted(100, 1000)).approver, "cfo");
    }
    #[test] fn bet_the_company_reaches_owner() {
        assert_eq!(route(&d(r#"{kind: spend, amount_usd: 5000}"#), &granted(100, 1000)).approver, "owner");
    }
    #[test] fn unsigned_grant_stays_inert() {
        let mut m = granted(100, 1000);
        m.as_mapping_mut().unwrap().insert(Value::String("granted_by".into()), Value::String("".into()));
        let v = route(&d(r#"{kind: spend, amount_usd: 10}"#), &m);
        assert_eq!(v.approver, "owner");
        assert!(!v.active);
    }
    #[test] fn zero_caps_delegate_no_spend() {
        assert_eq!(route(&d(r#"{kind: spend, amount_usd: 1}"#), &granted(0, 0)).approver, "owner");
        assert_eq!(route(&d(r#"{kind: hire_fire, within_policy: true}"#), &granted(0, 0)).approver, "hr_ops_manager");
    }
    #[test] fn unknown_kind_defaults_to_owner() {
        assert_eq!(route(&d(r#"{kind: launch_nukes}"#), &granted(100, 1000)).approver, "owner");
    }
    #[test] fn constitution_paths_flagged() {
        let p = vec!["docs/governance/delegation.yaml".to_string(), "src/x.rs".to_string()];
        assert_eq!(constitution_paths(&p), vec!["docs/governance/delegation.yaml".to_string()]);
    }
    // --- hitl ---
    #[test] fn hitl_oss_contribution_requires_human() {
        assert!(human_required(&d(r#"{kind: oss_contribution}"#)).0);
    }
    #[test] fn hitl_internal_read_is_autonomous() {
        assert!(!human_required(&d(r#"{capability: "read:repo"}"#)).0);
    }
    #[test] fn hitl_outward_requires_human() {
        assert!(human_required(&d(r#"{capability: "post:slack", outward: true}"#)).0);
    }
    #[test] fn hitl_internal_post_autonomous() {
        assert!(!human_required(&d(r#"{capability: "post:slack"}"#)).0);
    }
}
