//! `gal capability` — the CapabilityManifest governance gate.
//!
//! The governance coverage gate, ported to Rust so that **GAL**
//! (not a bespoke Python script in a product repo) is the enforcing authority for the
//! governance charter. Machine-enforces, over a CapabilityManifest (`capabilities.yaml`):
//!   * Rule #1 — never mix human/agent identities (no human-tier identity referenced by a
//!     grant; non-empty human owner set; human-issuance chain; human-only `granted_by`).
//!   * Spend-only — capability verbs are an ALLOW-LIST (default-deny); real-boolean `can_buy: false`.
//!   * Coverage — every deployed graph (langgraph.json) has a grant (default-deny).
//!   * Funding — real-boolean `auto_recharge`, not on unless `ring_fenced`.
//!   * Probation — every grant `posture: report_only`; least-privilege scope; `revocable: true`.
//!
//! `validate()` is pure (operates on `serde_yaml::Value`, no IO) so it is unit-tested directly,
//! carrying the same failure-mode + bypass-regression tests as the Python. Deterministic
//! rule-checking only — NOT ML, does not touch gal-model.
//!
//! Subcommands:
//!   * `gal capability validate <manifest.yaml> [--coverage langgraph.json]` — offline, exit 1 on violation.
//!   * `gal capability propose  <manifest.yaml> [--org ORG]` — validates (fail-closed), then rides the
//!     existing propose→approve rails (human approval blesses the change).

use anyhow::{anyhow, Result};
use clap::{Parser, Subcommand};
use colored::*;
use serde_yaml::Value;
use std::collections::BTreeSet;
use std::path::{Path, PathBuf};

use crate::client::ApiClient;

const REQUIRED_CAP_FIELDS: [&str; 4] = ["capability", "scope", "why", "granted_by"];
// ALLOW-LIST (default-deny): the only capability verb-prefixes an agent may hold. Inverting to
// an allow-list is what makes "no procurement" un-bypassable by synonym.
const ALLOWED_VERB_PREFIXES: [&str; 5] = ["read", "post", "propose", "write", "git"];
const ALLOWED_GRANT_KEYS: [&str; 6] =
    ["posture", "can_buy", "funding", "runtime", "identities", "capabilities"];
const FORBIDDEN_GRANT_KEYS: [&str; 6] =
    ["acts_as", "run_as", "run_as_user", "impersonate", "login_as", "sudo"];
const ALLOWED_POSTURES: [&str; 1] = ["report_only"];
const WILDCARD_SCOPES: [&str; 7] = ["", "*", "all", "any", "everything", "everywhere", "global"];

/// Required-string-field presence check. A required field must be a NON-EMPTY
/// STRING; a present-but-non-string value (number/bool/map) is type confusion and
/// is treated as MISSING (fail closed) so it cannot smuggle past field validation.
fn truthy_field(c: &Value, key: &str) -> bool {
    match c.get(key) {
        None | Some(Value::Null) => false,
        Some(Value::String(s)) => !s.is_empty(),
        Some(_) => false,
    }
}

fn mapping_keys(v: Option<&serde_yaml::Mapping>) -> BTreeSet<String> {
    v.map(|m| m.keys().filter_map(|k| k.as_str().map(String::from)).collect())
        .unwrap_or_default()
}

/// Pure validation. Returns (errors, warnings).
pub fn validate(graphs: &BTreeSet<String>, manifest: &Value) -> (Vec<String>, Vec<String>) {
    let mut errors: Vec<String> = Vec::new();
    let mut warnings: Vec<String> = Vec::new();

    let owners = manifest.get("owners").and_then(|v| v.as_sequence());
    let identities = manifest.get("identities").and_then(|v| v.as_mapping());
    let funding = manifest.get("funding").and_then(|v| v.as_mapping());
    let grants = manifest.get("grants").and_then(|v| v.as_mapping());

    let identity_names = mapping_keys(identities);
    let funding_names = mapping_keys(funding);
    let grant_names = mapping_keys(grants);

    // --- humans (owners): set must never be empty; each has id+tier; >=1 is human ---
    let mut human_ids: BTreeSet<String> = BTreeSet::new();
    match owners {
        None => errors
            .push("owners is missing/empty — the human set may never be empty (Rule #1)".into()),
        Some(seq) if seq.is_empty() => errors
            .push("owners is missing/empty — the human set may never be empty (Rule #1)".into()),
        Some(seq) => {
            for o in seq {
                let oid = o.get("id").and_then(|v| v.as_str());
                let tier = o.get("tier").and_then(|v| v.as_str());
                if oid.map_or(true, |s| s.is_empty()) || tier.is_none() {
                    errors.push("an owner must declare both id and tier".into());
                }
                if let Some(id) = oid {
                    if tier == Some("human") {
                        human_ids.insert(id.to_string());
                    }
                }
                if tier != Some("human") {
                    errors.push(format!("owner '{}' must be tier: human", oid.unwrap_or("?")));
                }
            }
        }
    }
    if owners.map_or(false, |s| !s.is_empty()) && human_ids.is_empty() {
        errors.push("no tier: human owner declared — the founder must anchor the human set".into());
    }

    // --- agent identities (NHI): tier:agent, spend-only, issued by a human ---
    if let Some(ids) = identities {
        for (k, ident) in ids {
            let name = k.as_str().unwrap_or("?");
            if !ident.is_mapping() {
                errors.push(format!("identity '{}' must be a mapping", name));
                continue;
            }
            if ident.get("tier").and_then(|v| v.as_str()) != Some("agent") {
                errors.push(format!(
                    "identity '{}' must be tier: agent (humans belong under owners:)",
                    name
                ));
            }
            if human_ids.contains(name) {
                errors.push(format!(
                    "identity '{}' collides with a human owner id — never mix tiers (Rule #1)",
                    name
                ));
            }
            match ident.get("can_buy") {
                None => errors.push(format!("identity '{}' must declare can_buy: false", name)),
                Some(Value::Bool(false)) => {}
                Some(other) => errors.push(format!(
                    "identity '{}' can_buy must be the boolean false (got {:?})",
                    name, other
                )),
            }
            match ident.get("issued_by").and_then(|v| v.as_str()) {
                None => errors.push(format!(
                    "identity '{}' must declare issued_by (the human who issued it)",
                    name
                )),
                Some(ib) if !human_ids.contains(ib) => errors.push(format!(
                    "identity '{}' issued_by '{}' is not a human owner — issuance chain broken",
                    name, ib
                )),
                _ => {}
            }
            if ident.get("shared").and_then(|v| v.as_bool()) == Some(true) {
                warnings.push(format!(
                    "identity '{}' is shared across agents (not isolated) — see audit item 3",
                    name
                ));
            }
            if let Some(sr) = ident.get("secret_ref").and_then(|v| v.as_str()) {
                let lc = sr.to_lowercase();
                if lc.contains("plaintext") || lc.contains("pending") {
                    warnings.push(format!("identity '{}' secret storage unresolved — {}", name, sr));
                }
            }
        }
    }

    // --- coverage: every deployed graph must have a grant (default-deny) ---
    for m in graphs.difference(&grant_names) {
        errors.push(format!(
            "deployed graph '{}' has NO capability grant (default-deny)",
            m
        ));
    }

    // --- per-grant: keys + posture + spend-only + Rule #1 + capability schema ---
    if let Some(gmap) = grants {
        for (k, g) in gmap {
            let agent = k.as_str().unwrap_or("?");
            if !g.is_mapping() {
                errors.push(format!("grant '{}' must be a mapping", agent));
                continue;
            }
            if !graphs.contains(agent) {
                warnings.push(format!("grant '{}' is not a deployed graph (stale grant?)", agent));
            }

            if let Some(gm) = g.as_mapping() {
                for kk in gm.keys() {
                    if let Some(key) = kk.as_str() {
                        if FORBIDDEN_GRANT_KEYS.contains(&key) {
                            errors.push(format!(
                                "grant '{}' uses forbidden key '{}' — identity-smuggling channel",
                                agent, key
                            ));
                        } else if !ALLOWED_GRANT_KEYS.contains(&key) {
                            errors.push(format!(
                                "grant '{}' has unknown key '{}' (allow-list only)",
                                agent, key
                            ));
                        }
                    }
                }
            }

            if !g
                .get("posture")
                .and_then(|v| v.as_str())
                .map_or(false, |p| ALLOWED_POSTURES.contains(&p))
            {
                errors.push(format!(
                    "grant '{}' posture must be report_only on probation (got {:?})",
                    agent,
                    g.get("posture")
                ));
            }

            match g.get("can_buy") {
                None => errors.push(format!(
                    "grant '{}' must declare can_buy: false explicitly",
                    agent
                )),
                Some(Value::Bool(false)) => {}
                Some(other) => errors.push(format!(
                    "grant '{}' can_buy must be the boolean false (got {:?}) — agents never procure",
                    agent, other
                )),
            }

            match g.get("identities").and_then(|v| v.as_sequence()) {
                None => errors.push(format!("grant '{}' declares no identities", agent)),
                Some(s) if s.is_empty() => {
                    errors.push(format!("grant '{}' declares no identities", agent))
                }
                Some(s) => {
                    for r in s {
                        if let Some(refn) = r.as_str() {
                            if human_ids.contains(refn) {
                                errors.push(format!(
                                    "grant '{}' references HUMAN identity '{}' — Rule #1 violation",
                                    agent, refn
                                ));
                            } else if !identity_names.contains(refn) {
                                errors.push(format!(
                                    "grant '{}' references undeclared identity '{}'",
                                    agent, refn
                                ));
                            }
                        }
                    }
                }
            }

            match g.get("capabilities").and_then(|v| v.as_sequence()) {
                None => errors.push(format!("grant '{}' declares no capabilities (default-deny)", agent)),
                Some(s) if s.is_empty() => {
                    errors.push(format!("grant '{}' declares no capabilities (default-deny)", agent))
                }
                Some(s) => {
                    for c in s {
                        if !c.is_mapping() {
                            errors.push(format!("grant '{}' has a non-mapping capability entry", agent));
                            continue;
                        }
                        let capname = c.get("capability").and_then(|v| v.as_str()).unwrap_or("?");
                        for f in REQUIRED_CAP_FIELDS {
                            if !truthy_field(c, f) {
                                errors.push(format!(
                                    "grant '{}' capability '{}' missing '{}'",
                                    agent, capname, f
                                ));
                            }
                        }
                        let cap = c.get("capability").and_then(|v| v.as_str()).unwrap_or("");
                        let verb = cap.split(':').next().unwrap_or("").trim().to_lowercase();
                        if !ALLOWED_VERB_PREFIXES.contains(&verb.as_str()) {
                            errors.push(format!(
                                "grant '{}' capability '{}' verb '{}' is not allow-listed \
                                 (default-deny: only {} — never procure/execute/deploy)",
                                agent,
                                cap,
                                verb,
                                ALLOWED_VERB_PREFIXES.join("/")
                            ));
                        }
                        let scope = c
                            .get("scope")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .trim()
                            .to_lowercase();
                        if WILDCARD_SCOPES.contains(&scope.as_str()) {
                            errors.push(format!(
                                "grant '{}' capability '{}' scope is a bare wildcard — \
                                 least-privilege requires a specific scope",
                                agent, cap
                            ));
                        }
                        // Fail closed on type confusion: a missing or non-string
                        // granted_by must error, never silently skip the grantor check.
                        match c.get("granted_by").and_then(|v| v.as_str()) {
                            None => errors.push(format!(
                                "grant '{}' capability '{}' granted_by must be a string naming a human owner",
                                agent, cap
                            )),
                            Some(gb) if !human_ids.contains(gb) => errors.push(format!(
                                "grant '{}' capability '{}' granted_by '{}' is not a human owner \
                                 (no self-grant / forged grantor)",
                                agent, cap, gb
                            )),
                            _ => {}
                        }
                        if c.get("revocable").and_then(|v| v.as_bool()) != Some(true) {
                            errors.push(format!(
                                "grant '{}' capability '{}' must set revocable: true",
                                agent, cap
                            ));
                        }
                    }
                }
            }

            if let Some(fund) = g.get("funding").and_then(|v| v.as_str()) {
                if !funding_names.contains(fund) {
                    errors.push(format!(
                        "grant '{}' funding '{}' is not a declared instrument",
                        agent, fund
                    ));
                }
            }
        }
    }

    // --- funding: real-bool auto_recharge; may not be ON unless ring-fenced ---
    if let Some(fmap) = funding {
        for (k, f) in fmap {
            let fname = k.as_str().unwrap_or("?");
            if !f.is_mapping() {
                errors.push(format!("funding '{}' must be a mapping", fname));
                continue;
            }
            let rf = f.get("ring_fenced");
            let rf_is_true = rf.and_then(|v| v.as_bool()) == Some(true);
            match f.get("auto_recharge") {
                Some(Value::Bool(b)) => {
                    if *b && !rf_is_true {
                        errors.push(format!(
                            "funding '{}' auto_recharge is ON but not ring_fenced — unbounded real-money exposure",
                            fname
                        ));
                    }
                }
                other => errors.push(format!(
                    "funding '{}' auto_recharge must be a real boolean (got {:?}) — no quoted/cased truthy values",
                    fname, other
                )),
            }
            let rf_ok = matches!(rf, Some(Value::Bool(_)))
                || rf.and_then(|v| v.as_str()) == Some("pending");
            if !rf_ok {
                errors.push(format!(
                    "funding '{}' ring_fenced must be true/false or 'pending' (got {:?})",
                    fname, rf
                ));
            }
            if rf.and_then(|v| v.as_str()) == Some("pending") {
                warnings.push(format!(
                    "funding '{}' ring_fenced: pending — FOUNDER action (audit table C)",
                    fname
                ));
            }
        }
    }

    (errors, warnings)
}

// ───────────────────────── CLI ─────────────────────────

#[derive(Parser)]
pub struct CapabilityArgs {
    #[command(subcommand)]
    pub command: CapabilityCommands,
}

#[derive(Subcommand)]
pub enum CapabilityCommands {
    /// Validate a CapabilityManifest against the governance charter (offline; exit 1 on any violation)
    Validate {
        /// Path to the capability manifest YAML
        manifest: PathBuf,
        /// Path to langgraph.json — coverage source (every graph must have a grant)
        #[arg(long)]
        coverage: Option<PathBuf>,
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// Propose a CapabilityManifest change through GAL (validates first, fail-closed; then propose→human approve)
    Propose {
        /// Path to the capability manifest YAML
        manifest: PathBuf,
        /// Organization name
        #[arg(long)]
        org: Option<String>,
        /// Path to langgraph.json — coverage source
        #[arg(long)]
        coverage: Option<PathBuf>,
    },
}

pub async fn run(client: ApiClient, args: CapabilityArgs) -> Result<()> {
    match args.command {
        CapabilityCommands::Validate {
            manifest,
            coverage,
            json,
        } => cmd_validate(&manifest, coverage.as_deref(), json),
        CapabilityCommands::Propose {
            manifest,
            org,
            coverage,
        } => cmd_propose(client, &manifest, org, coverage.as_deref()).await,
    }
}

fn load_manifest(path: &Path) -> Result<Value> {
    let text = std::fs::read_to_string(path)
        .map_err(|e| anyhow!("cannot read manifest {}: {}", path.display(), e))?;
    serde_yaml::from_str(&text)
        .map_err(|e| anyhow!("manifest {} is not valid YAML: {}", path.display(), e))
}

fn load_graphs(coverage: Option<&Path>) -> Result<BTreeSet<String>> {
    let path = match coverage {
        Some(p) => p,
        None => return Ok(BTreeSet::new()),
    };
    let text = std::fs::read_to_string(path)
        .map_err(|e| anyhow!("cannot read coverage {}: {}", path.display(), e))?;
    let j: serde_json::Value = serde_json::from_str(&text)
        .map_err(|e| anyhow!("coverage {} is not valid JSON: {}", path.display(), e))?;
    // Fail closed: a supplied coverage file MUST declare a `graphs` object.
    // Previously a missing/mistyped `graphs` key yielded an empty set, silently
    // skipping coverage enforcement.
    match j.get("graphs").and_then(|g| g.as_object()) {
        Some(o) => Ok(o.keys().cloned().collect()),
        None => Err(anyhow!(
            "coverage {} must contain a 'graphs' object (fail closed: refusing to skip coverage)",
            path.display()
        )),
    }
}

fn cmd_validate(manifest_path: &Path, coverage: Option<&Path>, json: bool) -> Result<()> {
    let manifest = load_manifest(manifest_path)?;
    let graphs = load_graphs(coverage)?;
    let (errors, warnings) = validate(&graphs, &manifest);

    if json {
        let out = serde_json::json!({
            "ok": errors.is_empty(),
            "graphs": graphs.len(),
            "errors": errors,
            "warnings": warnings,
        });
        println!("{}", serde_json::to_string_pretty(&out)?);
    } else if !errors.is_empty() {
        println!(
            "{} CAPABILITY GATE FAILED — governance-charter violations:",
            "✗".red().bold()
        );
        for e in &errors {
            println!("   - {}", e.red());
        }
        println!("\nEvery deployed agent must declare AGENT-only, SPEND-ONLY, report-only capability grants.");
        println!("See the GAL governance charter (Rule #1 + spend-only). Do not bypass.");
    } else {
        println!(
            "{} capability gate OK: all {} deployed graphs have agent-only, spend-only, report-only grants.",
            "✓".green().bold(),
            graphs.len()
        );
        for w in &warnings {
            println!("   {} {}", "⚠".yellow(), w);
        }
    }

    if !errors.is_empty() {
        std::process::exit(1);
    }
    Ok(())
}

async fn cmd_propose(
    client: ApiClient,
    manifest_path: &Path,
    org: Option<String>,
    coverage: Option<&Path>,
) -> Result<()> {
    let manifest = load_manifest(manifest_path)?;
    let graphs = load_graphs(coverage)?;
    let (errors, _warnings) = validate(&graphs, &manifest);
    if !errors.is_empty() {
        return Err(anyhow!(
            "manifest has {} violation(s) — run `gal capability validate` and fix before proposing (fail-closed)",
            errors.len()
        ));
    }

    let config = crate::client::LocalConfig::load()?;
    let org = org
        .or(config.default_org)
        .ok_or_else(|| anyhow!("No organization specified. Use --org <name>"))?;

    let manifest_json: serde_json::Value = serde_json::to_value(&manifest)?;
    let grant_count = manifest_json
        .get("grants")
        .and_then(|g| g.as_object())
        .map_or(0, |m| m.len());
    let content = serde_json::json!({
        "kind": "CapabilityManifest",
        "apiVersion": "gal/v1",
        "manifest": manifest_json,
        "coverage": graphs.iter().collect::<Vec<_>>(),
    });
    let description = format!(
        "CapabilityManifest update ({} grants, {} graphs)",
        grant_count,
        graphs.len()
    );

    match client
        .create_proposal("org", &org, None, Some(&description), &content)
        .await
    {
        Ok(resp) => {
            println!(
                "{} CapabilityManifest proposed for {} — human approval required to bless it.",
                "✓".green(),
                org.bold()
            );
            if let Some(id) = resp.get("id").and_then(|v| v.as_str()) {
                println!("  Proposal ID: {}", id.cyan());
            }
            Ok(())
        }
        Err(e) => Err(anyhow!("propose failed: {}", e)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(y: &str) -> Value {
        serde_yaml::from_str(y).expect("test yaml")
    }
    fn graphs() -> BTreeSet<String> {
        ["alpha"].iter().map(|s| s.to_string()).collect()
    }
    fn errs(y: &str) -> Vec<String> {
        validate(&graphs(), &parse(y)).0
    }

    // A minimal, valid manifest (flow style for compactness).
    const MIN: &str = r#"
owners: [{id: shay, tier: human}]
identities:
  mi: {tier: agent, can_buy: false, issued_by: shay}
  gh: {tier: agent, can_buy: false, issued_by: shay}
funding:
  pool: {auto_recharge: false, ring_fenced: pending}
grants:
  alpha:
    posture: report_only
    can_buy: false
    funding: pool
    identities: [mi, gh]
    capabilities:
      - {capability: "read:repo", scope: "x", why: "y", granted_by: shay, revocable: true}
"#;

    fn has(v: &[String], needle: &str) -> bool {
        v.iter().any(|e| e.contains(needle))
    }

    #[test]
    fn minimal_is_valid() {
        let (e, w) = validate(&graphs(), &parse(MIN));
        assert!(e.is_empty(), "expected valid, got {:?}", e);
        assert!(has(&w, "ring_fenced: pending"));
    }

    #[test]
    fn missing_grant_fails() {
        let y = MIN.replace("grants:\n  alpha:", "grants:\n  other:");
        assert!(has(&errs(&y), "NO capability grant"));
    }

    #[test]
    fn human_identity_reference_fails() {
        let y = MIN.replace("identities: [mi, gh]", "identities: [mi, gh, shay]");
        let e = errs(&y);
        assert!(has(&e, "HUMAN identity") && has(&e, "Rule #1"));
    }

    #[test]
    fn empty_owners_blocked() {
        let y = MIN.replace("owners: [{id: shay, tier: human}]", "owners: []");
        assert!(has(&errs(&y), "owners is missing/empty"));
    }

    #[test]
    fn issued_by_must_be_human() {
        let y = MIN.replace("mi: {tier: agent, can_buy: false, issued_by: shay}", "mi: {tier: agent, can_buy: false, issued_by: mallory}");
        assert!(has(&errs(&y), "issuance chain broken"));
    }

    #[test]
    fn granted_by_non_owner_fails() {
        let y = MIN.replace("granted_by: shay", "granted_by: mallory");
        assert!(has(&errs(&y), "not a human owner"));
    }

    #[test]
    fn granted_by_non_string_fails_closed() {
        // Type confusion: a numeric granted_by must not silently skip the grantor check.
        let y = MIN.replace("granted_by: shay", "granted_by: 123");
        assert!(has(&errs(&y), "granted_by must be a string"));
    }

    #[test]
    fn can_buy_true_fails() {
        // the grant-level can_buy (the one before `funding: pool`)
        let y = MIN.replace("posture: report_only\n    can_buy: false", "posture: report_only\n    can_buy: true");
        assert!(has(&errs(&y), "can_buy must be the boolean false"));
    }

    #[test]
    fn quoted_truthy_can_buy_blocked() {
        for v in ["\"Y\"", "\"1\"", "\"yes \"", "enabled", "\"true\""] {
            let y = MIN.replace("posture: report_only\n    can_buy: false", &format!("posture: report_only\n    can_buy: {}", v));
            assert!(has(&errs(&y), "can_buy must be the boolean false"), "can_buy={} should fail", v);
        }
    }

    #[test]
    fn procurement_synonym_blocked() {
        for verb in ["buy:tokens", "acquire:cap", "fund:pool", "settle:invoice", "execute:deploy", "deploy:prod"] {
            let y = MIN.replace("read:repo", verb);
            assert!(has(&errs(&y), "not allow-listed"), "{} should be blocked", verb);
        }
    }

    #[test]
    fn read_payroll_not_false_failed() {
        // 'pay' substring must NOT trip the allow-list (the false-fail the Python fix closed)
        let y = MIN.replace("read:repo", "read:payroll");
        assert!(errs(&y).is_empty(), "read:payroll should pass: {:?}", errs(&y));
    }

    #[test]
    fn auto_recharge_without_ringfence_fails() {
        let y = MIN.replace("pool: {auto_recharge: false, ring_fenced: pending}", "pool: {auto_recharge: true, ring_fenced: false}");
        assert!(has(&errs(&y), "auto_recharge is ON but not ring_fenced"));
    }

    #[test]
    fn quoted_truthy_auto_recharge_blocked() {
        let y = MIN.replace("pool: {auto_recharge: false, ring_fenced: pending}", "pool: {auto_recharge: \"ON\", ring_fenced: false}");
        assert!(has(&errs(&y), "must be a real boolean"));
    }

    #[test]
    fn posture_must_be_report_only() {
        let y = MIN.replace("posture: report_only", "posture: execute");
        assert!(has(&errs(&y), "posture must be report_only"));
    }

    #[test]
    fn forbidden_grant_key_blocked() {
        let y = MIN.replace("posture: report_only\n", "posture: report_only\n    acts_as: shay\n");
        assert!(has(&errs(&y), "forbidden key"));
    }

    #[test]
    fn wildcard_scope_blocked() {
        let y = MIN.replace("scope: \"x\"", "scope: \"*\"");
        assert!(has(&errs(&y), "bare wildcard"));
    }

    #[test]
    fn revocable_required() {
        let y = MIN.replace(", revocable: true", "");
        assert!(has(&errs(&y), "revocable: true"));
    }

    #[test]
    fn undeclared_identity_fails() {
        let y = MIN.replace("identities: [mi, gh]", "identities: [mi, gh, ghost]");
        assert!(has(&errs(&y), "undeclared identity"));
    }

    #[test]
    fn identity_must_be_agent_tier() {
        let y = MIN.replace("mi: {tier: agent, can_buy: false, issued_by: shay}", "mi: {tier: human, can_buy: false, issued_by: shay}");
        assert!(has(&errs(&y), "must be tier: agent"));
    }

    #[test]
    fn combined_killshot_rejected() {
        // The adversary kill-shot that passed the FIRST Python gate with 0 errors must be caught.
        let evil = r#"
owners: []
identities:
  founder_pat: {tier: agent, can_buy: "no", issued_by: rogue}
funding:
  pool: {auto_recharge: "ON", ring_fenced: "no"}
grants:
  alpha:
    posture: execute
    can_buy: "Y"
    funding: pool
    acts_as: shay
    identities: [founder_pat]
    capabilities:
      - {capability: "transfer:funds", scope: "*", why: "x", granted_by: alpha, revocable: false}
"#;
        let e = errs(evil);
        assert!(e.len() >= 8, "kill-shot should produce many errors, got {}: {:?}", e.len(), e);
        assert!(has(&e, "owners is missing/empty"));
        assert!(has(&e, "not allow-listed"));
        assert!(has(&e, "auto_recharge must be a real boolean"));
        assert!(has(&e, "forbidden key"));
        assert!(has(&e, "posture must be report_only"));
    }
}
