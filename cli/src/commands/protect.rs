use anyhow::{Context, Result};
use clap::{Parser, Subcommand};
use colored::*;
use std::io::Read;
use std::path::{Path, PathBuf};

use crate::client::ApiClient;

#[derive(Parser)]
pub struct ProtectArgs {
    #[command(subcommand)]
    pub command: ProtectCommands,
}

#[derive(Subcommand)]
pub enum ProtectCommands {
    /// List protection/guard rules
    List {
        /// Output as JSON
        #[arg(long)]
        json: bool,
    },
    /// Check if a path is protected
    Check {
        /// Path to check
        path: String,
    },
    /// Add a deny rule that blocks a command pattern at AI-agent tool-call time
    ///
    /// Compiles the rule into a Claude Code PreToolUse hook so the agent is
    /// stopped *before* the command runs — unlike a git hook, which an agent
    /// can bypass with `--no-verify`.
    Add {
        /// Command substring to deny (e.g. "--no-verify", "git push origin main")
        #[arg(long)]
        deny: String,
        /// Human-readable reason surfaced to the agent when the rule fires
        #[arg(long)]
        reason: Option<String>,
    },
    /// PreToolUse hook handler: evaluate a Claude Code tool call from stdin (internal)
    #[command(hide = true)]
    Handle {
        /// Path to the compiled rule set JSON
        #[arg(long)]
        rules: PathBuf,
    },
}

pub async fn run(client: ApiClient, args: ProtectArgs) -> Result<()> {
    match args.command {
        ProtectCommands::List { json } => cmd_list(client, json).await,
        ProtectCommands::Check { path } => cmd_check(client, &path).await,
        ProtectCommands::Add { deny, reason } => cmd_add(&deny, reason.as_deref()),
        ProtectCommands::Handle { rules } => cmd_handle(&rules),
    }
}

async fn cmd_list(client: ApiClient, json: bool) -> Result<()> {
    // List from enforce_rules module constants
    let blocked_tools: Vec<&str> = crate::enforce_rules::BLOCKED_TOOLS.to_vec();
    let blocked_bash: Vec<&str> = crate::enforce_rules::BLOCKED_BASH_PATTERNS.to_vec();
    let always_allowed: Vec<&str> = crate::enforce_rules::ALWAYS_ALLOWED_TOOLS.to_vec();

    if json {
        let data = serde_json::json!({
            "blocked_tools": blocked_tools,
            "blocked_bash_patterns": blocked_bash,
            "always_allowed_tools": always_allowed,
        });
        println!("{}", serde_json::to_string_pretty(&data)?);
        return Ok(());
    }

    println!("\n{}", "Protection Rules:".blue().bold());
    println!("{}", "─".repeat(50).dimmed());
    println!("\n  {} Blocked tools:", "Blocked Tools:".bold());
    for tool in &blocked_tools {
        println!("    {} {}", "•".cyan(), tool);
    }
    println!("\n  {} Blocked bash patterns:", "Blocked Bash:".bold());
    for pattern in &blocked_bash {
        println!("    {} {}", "•".cyan(), pattern);
    }
    println!("\n  {} Always allowed:", "Always Allowed:".bold());
    for tool in &always_allowed {
        println!("    {} {}", "•".cyan(), tool);
    }
    println!();

    // Also fetch server-side if available
    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Fetching server protection rules...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client
        .get::<serde_json::Value>("/compliance-status")
        .await
    {
        Ok(compliance) => {
            spinner.finish_and_clear();
            if let Some(guards) = compliance.get("guards").and_then(|v| v.as_array()) {
                println!("{}", "Server-side Guards:".bold());
                for guard in guards {
                    let name = guard.get("name").and_then(|v| v.as_str()).unwrap_or("unknown");
                    let active = guard.get("active").and_then(|v| v.as_bool()).unwrap_or(false);
                    let icon = if active { "✓".green() } else { "✗".red() };
                    println!("  {} {}", icon, name);
                }
                println!();
            }
        }
        Err(_) => {
            spinner.finish_and_clear();
        }
    }

    Ok(())
}

async fn cmd_check(client: ApiClient, path: &str) -> Result<()> {
    // Check against blocked bash patterns
    let blocked_patterns: Vec<&str> = crate::enforce_rules::BLOCKED_BASH_PATTERNS.to_vec();
    let mut violations = Vec::new();

    for pattern in &blocked_patterns {
        if path.contains(pattern) {
            violations.push(pattern.to_string());
        }
    }

    println!("\n{} Protected path check:", "Check:".blue().bold());
    println!("  Path: {}", path.cyan());

    if violations.is_empty() {
        println!("  {} Path is clear", "✓".green());
    } else {
        println!("  {} Matched protection patterns:", "!".yellow());
        for v in &violations {
            println!("    - {}", v);
        }
    }
    println!();

    // Check server-side compliance
    let spinner = indicatif::ProgressBar::new_spinner();
    spinner.set_message("Checking server-side compliance...");
    spinner.enable_steady_tick(std::time::Duration::from_millis(100));

    match client
        .get::<serde_json::Value>("/compliance-status")
        .await
    {
        Ok(compliance) => {
            spinner.finish_and_clear();
            let compliant = compliance
                .get("compliant")
                .and_then(|v| v.as_bool())
                .unwrap_or(false);
            if compliant {
                println!("  {} Server: Compliant", "✓".green());
            } else {
                println!("  {} Server: Non-compliant", "✗".red());
            }
            println!();
        }
        Err(_) => {
            spinner.finish_and_clear();
        }
    }

    Ok(())
}

// ---------------------------------------------------------------------------
// `gal protect add --deny` — install a tool-call deny rule
// ---------------------------------------------------------------------------

fn gal_home() -> Result<PathBuf> {
    std::env::var_os("HOME")
        .map(PathBuf::from)
        .ok_or_else(|| anyhow::anyhow!("HOME environment variable is not set"))
}

fn cmd_add(deny: &str, reason: Option<&str>) -> Result<()> {
    use crate::enforcement::{CommandRule, RuleMode, RuleSet};

    if deny.trim().is_empty() {
        anyhow::bail!("--deny pattern cannot be empty");
    }

    let home = gal_home()?;
    let rules_dir = home.join(".gal").join("rules");
    let compiled_path = rules_dir.join("compiled.json");
    let settings_path = home.join(".claude").join("settings.json");

    // 1. Load the existing compiled rule set, or start from an empty one.
    let mut rule_set = if compiled_path.exists() {
        RuleSet::from_json_file(&compiled_path).unwrap_or_else(|_| RuleSet::empty())
    } else {
        RuleSet::empty()
    };

    // 2. Append the deny rule (idempotent on the match text).
    let reason = reason
        .map(|s| s.to_string())
        .unwrap_or_else(|| format!("Blocked by GAL: '{deny}' is denied for AI agents"));
    let already = rule_set.commands.iter().any(|c| c.match_ == deny);
    if !already {
        rule_set.commands.push(CommandRule {
            match_: deny.to_string(),
            mode: Some(RuleMode::Block),
            reason: reason.clone(),
            scope: Some("agent".to_string()),
        });
    }

    // 3. Persist the compiled rules (read by the handler on every tool call).
    std::fs::create_dir_all(&rules_dir)
        .with_context(|| format!("creating {}", rules_dir.display()))?;
    std::fs::write(&compiled_path, rule_set.to_json_pretty()? + "\n")
        .with_context(|| format!("writing {}", compiled_path.display()))?;

    // 4. Register the PreToolUse hook in Claude Code settings.json so the rule
    //    is enforced *before* the agent's command runs.
    let gal_bin = std::env::current_exe().context("cannot resolve the gal binary path")?;
    let cfg = crate::enforce_hooks::build_gal_hook_config(&gal_bin, &compiled_path);
    let hook_cmd = cfg.pre_tool_use[0].hooks[0].command.clone();
    register_pretooluse_hook(&settings_path, &hook_cmd)?;

    if already {
        println!("\n{} Deny rule already present — refreshed", "✓".green());
    } else {
        println!("\n{} Deny rule added", "✓".green());
    }
    println!("  Pattern : {}", deny.cyan());
    println!("  Reason  : {}", reason.dimmed());
    println!("  Scope   : AI-agent tool calls (Claude Code PreToolUse)");
    println!("  Rules   : {}", compiled_path.display().to_string().dimmed());
    println!(
        "\n  {} GAL now blocks this at tool-call time — before the command runs.",
        "→".cyan()
    );
    println!();
    Ok(())
}

/// Merge a single `gal protect handle` PreToolUse entry into Claude Code's
/// `settings.json`, replacing any prior gal-protect entry (idempotent).
fn register_pretooluse_hook(settings_path: &Path, command: &str) -> Result<()> {
    use serde_json::{json, Value};

    let mut settings: Value = if settings_path.exists() {
        serde_json::from_str(&std::fs::read_to_string(settings_path)?).unwrap_or_else(|_| json!({}))
    } else {
        json!({})
    };
    if !settings.is_object() {
        settings = json!({});
    }

    let hooks = settings
        .as_object_mut()
        .unwrap()
        .entry("hooks")
        .or_insert_with(|| json!({}));
    if !hooks.is_object() {
        *hooks = json!({});
    }
    let pre = hooks
        .as_object_mut()
        .unwrap()
        .entry("PreToolUse")
        .or_insert_with(|| json!([]));
    if !pre.is_array() {
        *pre = json!([]);
    }
    let arr = pre.as_array_mut().unwrap();

    // Drop any existing gal-protect-handle group so re-adding stays idempotent.
    arr.retain(|group| {
        group
            .get("hooks")
            .and_then(|h| h.as_array())
            .map(|inner| {
                !inner.iter().any(|h| {
                    h.get("command")
                        .and_then(|c| c.as_str())
                        .map(|s| s.contains("protect handle"))
                        .unwrap_or(false)
                })
            })
            .unwrap_or(true)
    });

    arr.push(json!({
        "matcher": "Bash",
        "hooks": [ { "type": "command", "command": command } ]
    }));

    if let Some(parent) = settings_path.parent() {
        std::fs::create_dir_all(parent)
            .with_context(|| format!("creating {}", parent.display()))?;
    }
    std::fs::write(settings_path, serde_json::to_string_pretty(&settings)? + "\n")
        .with_context(|| format!("writing {}", settings_path.display()))?;
    Ok(())
}

// ---------------------------------------------------------------------------
// `gal protect handle` — PreToolUse hook handler (allow/deny a tool call)
// ---------------------------------------------------------------------------

/// Whether a pattern is a regex literal, i.e. wrapped in `/.../`.
///
/// Mirrors the dashboard's `isRegexMatch` (parser.ts) exactly so Rust and TS
/// agree on which rules are regex vs literal.
fn is_regex_match(pattern: &str) -> bool {
    pattern.len() >= 2 && pattern.starts_with('/') && pattern.ends_with('/')
}

/// Strip the surrounding `/.../` from a regex literal. Mirrors the dashboard's
/// `stripRegexSlashes` (parser.ts). Caller must have checked `is_regex_match`.
fn strip_regex_slashes(pattern: &str) -> &str {
    &pattern[1..pattern.len() - 1]
}

/// Split a command line into chained segments on `&&`, `;`, and `|` so a rule
/// still matches when its target is buried in a chain
/// (e.g. `foo && git push origin main`). `|` also covers `||`.
fn command_segments(command_text: &str) -> Vec<&str> {
    command_text
        .split(|c| c == '&' || c == ';' || c == '|')
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect()
}

/// `git`-LEVEL (pre-subcommand) options that consume a following value token,
/// e.g. `git -c key=val push ...` or `git --git-dir /x push ...`. We must skip
/// BOTH the flag and its value so the value never leaks into the subcommand
/// slot. `--flag=value` carries its value inline and is handled separately.
const GIT_GLOBAL_VALUE_FLAGS: &[&str] =
    &["-c", "-C", "--git-dir", "--work-tree", "--namespace"];

/// `git push` / `git fetch` options that consume a following value token. If we
/// treated these as boolean (the old behaviour), the value would leak into the
/// positional remote/ref slots and corrupt the salient comparison
/// (e.g. `-o ci.skip` leaving `ci.skip` as a phantom positional).
const PUSH_VALUE_FLAGS: &[&str] = &[
    "-o",
    "--push-option",
    "--receive-pack",
    "--exec",
    "--repo",
];

/// Split a `--flag=value` token into `(flag, Some(value))`, or `(token, None)`
/// for a bare flag / non-`=` token. Only treats a leading-`-` token as a flag.
fn split_flag_value(tok: &str) -> (&str, Option<&str>) {
    if tok.starts_with('-') {
        if let Some(eq) = tok.find('=') {
            return (&tok[..eq], Some(&tok[eq + 1..]));
        }
    }
    (tok, None)
}

/// Whether `flag` (the bare flag name, no `=value`) is in `table`.
fn flag_takes_value(flag: &str, table: &[&str]) -> bool {
    table.contains(&flag)
}

/// Normalize a push/fetch DESTINATION ref token to its target branch name so
/// refspec variants that all update the same ref compare equal:
///   `+main`              -> main   (strip leading force `+`)
///   `HEAD:main`          -> main   (take the dst, i.e. after the LAST `:`)
///   `main:main`          -> main
///   `master:main`        -> main
///   `refs/heads/main`    -> main   (strip `refs/heads/` prefix)
///   `HEAD:refs/heads/main` -> main
/// A plain `main` stays `main`; `main:develop` -> develop (so it does NOT match
/// a `main` deny rule). This is push/fetch-specific — never applied to other
/// subcommands' positionals.
fn refspec_dst(token: &str) -> String {
    let mut t = token;
    // Strip a single leading force marker.
    if let Some(rest) = t.strip_prefix('+') {
        t = rest;
    }
    // For a `src:dst` refspec, the destination is after the LAST colon.
    if let Some(idx) = t.rfind(':') {
        t = &t[idx + 1..];
    }
    // Fully-qualified destination -> short branch name.
    if let Some(rest) = t.strip_prefix("refs/heads/") {
        t = rest;
    }
    t.to_string()
}

/// Reduce a tokenized git command to its salient structure for variant-
/// insensitive matching: `(subcommand, positional_args)`, with option flags
/// (incl. their consumed values), any leading `git -C <path>` / global value
/// option prefix, and a leading env-var (`FOO=bar`) prefix stripped. For
/// `push`/`fetch`, destination refspecs are normalized to their target branch
/// and `--repo=<remote>` is treated as the remote. Returns `None` if the tokens
/// are not a `git ...` invocation.
fn git_salient(tokens: &[String]) -> Option<(String, Vec<String>)> {
    let mut it = tokens.iter().peekable();

    // Skip a leading env-var assignment prefix (e.g. `GIT_SSH=... git push`).
    while let Some(tok) = it.peek() {
        // An env assignment has a `=` before any `/` (which would be a path).
        let is_env = tok
            .find('=')
            .map(|eq| !tok[..eq].is_empty() && !tok[..eq].contains('/'))
            .unwrap_or(false);
        if is_env {
            it.next();
        } else {
            break;
        }
    }

    // Must start with `git`.
    match it.next() {
        Some(g) if g == "git" => {}
        _ => return None,
    }

    // Consume any `git`-level options that precede the subcommand. Value-taking
    // options (`-c key=val`, `-C <path>`, `--git-dir <p>`, ...) consume their
    // following token (or carry it inline as `--flag=value`) so the value never
    // leaks into the subcommand slot. Other git-level flags are ignored.
    let mut subcommand: Option<String> = None;
    while let Some(tok) = it.next() {
        let (flag, inline) = split_flag_value(tok);
        if tok.starts_with('-') {
            if inline.is_none() && flag_takes_value(flag, GIT_GLOBAL_VALUE_FLAGS) {
                it.next(); // consume the separate value token
            }
            continue;
        }
        subcommand = Some(tok.clone());
        break;
    }
    let subcommand = subcommand?;

    let is_pushlike = subcommand == "push" || subcommand == "fetch";

    // Collect positional args. Recognised value-taking flags consume their value
    // (inline `--flag=value` or the next token) so it cannot leak into the
    // positional remote/ref slots. `--repo=<remote>` / `--repo <remote>` sets
    // the remote (a positional). Bare boolean flags are dropped.
    let mut remote_from_repo: Option<String> = None;
    let mut positionals = Vec::new();
    while let Some(tok) = it.next() {
        if tok == "--" {
            // Everything after `--` is positional (still ref-normalized for push).
            for rest in it.by_ref() {
                positionals.push(rest.clone());
            }
            break;
        }
        if tok.starts_with('-') {
            let (flag, inline) = split_flag_value(tok);
            // `--repo` selects the remote — capture its value as a positional.
            if flag == "--repo" {
                let val = inline
                    .map(|s| s.to_string())
                    .or_else(|| it.next().cloned());
                if let Some(v) = val {
                    remote_from_repo = Some(v);
                }
                continue;
            }
            // Other value-taking push/fetch flags: consume (and discard) value.
            if is_pushlike && inline.is_none() && flag_takes_value(flag, PUSH_VALUE_FLAGS) {
                it.next();
            }
            // Inline-valued (`--flag=value`) or bare boolean flag: drop entirely.
            continue;
        }
        positionals.push(tok.clone());
    }

    // A `--repo=<remote>` remote leads the positionals (mirrors `git push <remote> <ref>`).
    if let Some(remote) = remote_from_repo {
        positionals.insert(0, remote);
    }

    // For push/fetch, normalize positional refs (every slot after the remote is
    // a refspec) to their destination branch so refspec variants compare equal.
    if is_pushlike {
        for (idx, p) in positionals.iter_mut().enumerate() {
            // Slot 0 is the remote (e.g. `origin`); refspecs follow. Only
            // normalize tokens that look like refs, i.e. not slot 0.
            if idx == 0 {
                continue;
            }
            *p = refspec_dst(p);
        }
    }

    Some((subcommand, positionals))
}

/// Variant-aware match for git patterns: a rule like `git push origin main`
/// matches the command if both tokenize to the same `(subcommand, positionals)`
/// after stripping flags / `git -C <path>` / env prefixes. Flag order and
/// extra whitespace are irrelevant; positional args (remote, ref) must match
/// exactly so `main` does not match `maintenance` or `main-branch`.
///
/// For `push`/`fetch`, matching is NOT whole-tuple equality — that let a
/// multi-refspec push smuggle the protected ref past the rule
/// (`git push origin develop main` has positionals `[origin, develop, main]`,
/// never equal to the rule's `[origin, main]`, yet it DOES update origin/main).
/// Instead we split each side into `(remote, dest_refs)` keyed on the remote
/// (slot 0) and BLOCK iff the remotes match AND every rule dest_ref is among
/// the command's destinations (`rule.dest_refs ⊆ command.dest_refs`). For the
/// common single-ref rule that means: same remote AND `main` ∈ the command's
/// normalized destinations. A different dst (`main:develop`), a different remote
/// (`upstream`), or a non-push subcommand still does NOT match.
fn git_variant_match(pattern: &str, segment: &str) -> bool {
    let pat_tokens = match shlex::split(pattern) {
        Some(t) => t,
        None => return false,
    };
    let cmd_tokens = match shlex::split(segment) {
        Some(t) => t,
        None => return false,
    };
    let (p, c) = match (git_salient(&pat_tokens), git_salient(&cmd_tokens)) {
        (Some(p), Some(c)) => (p, c),
        _ => return false,
    };
    let (p_sub, p_pos) = p;
    let (c_sub, c_pos) = c;

    // Subcommand must match for any branch.
    if p_sub != c_sub {
        return false;
    }

    // Push/fetch: per-destination-ref containment keyed on the remote.
    if p_sub == "push" || p_sub == "fetch" {
        // Slot 0 is the remote; the remaining (already `refspec_dst`-normalized
        // by `git_salient`) slots are the destination refs.
        let (p_remote, p_dsts) = match p_pos.split_first() {
            Some(parts) => parts,
            // A rule with no remote (e.g. bare `git push`) blocks any push with
            // a matching subcommand — there's nothing to constrain on.
            None => return c_sub == p_sub,
        };
        let (c_remote, c_dsts) = match c_pos.split_first() {
            Some(parts) => parts,
            None => return false,
        };
        if p_remote != c_remote {
            return false;
        }
        // rule.dest_refs ⊆ command.dest_refs (empty rule set ⊆ anything).
        return p_dsts.iter().all(|d| c_dsts.contains(d));
    }

    // Non-push/fetch git subcommands keep whole-tuple equality.
    p_pos == c_pos
}

/// Layered match of a deny `match_pattern` against `command_text`.
///
/// 1. **Regex**: a `/.../`-wrapped pattern is compiled with the `regex` crate
///    and tested anywhere in the command (mirrors the dashboard TS contract).
///    If it fails to COMPILE we fall back to literal substring — never panic,
///    so the PreToolUse handler can't crash the agent.
/// 2. **Git-aware variant match**: a pattern starting with `git ` is matched
///    flag-order-insensitively on `{subcommand, positional args}`, ignoring
///    option flags (`-u`/`--set-upstream`/`-f`) and a leading `git -C <path>`
///    / env-var prefix. Tested per chained segment.
/// 3. **Literal substring** (case-sensitive): the default and the back-compat
///    fallback. Chained-command segments are tested individually too.
fn matches_rule(match_pattern: &str, command_text: &str) -> bool {
    if match_pattern.is_empty() {
        return false;
    }

    // 1. Regex branch — fail OPEN to literal substring on a bad pattern.
    if is_regex_match(match_pattern) {
        let body = strip_regex_slashes(match_pattern);
        match regex::Regex::new(body) {
            Ok(re) => return re.is_match(command_text),
            Err(_) => return command_text.contains(match_pattern),
        }
    }

    // 2. Git-aware variant branch — per chained segment.
    if match_pattern.starts_with("git ") {
        let segments = command_segments(command_text);
        // If ANY segment is itself a git invocation, the git-argv comparison is
        // authoritative for that segment — we must NOT fall back to substring
        // there, or `git push origin main` would spuriously match
        // `git push origin maintenance` (the over-match the whole feature
        // exists to prevent). A segment that is NOT a git invocation can still
        // be substring-matched below for back-compat.
        for seg in &segments {
            if git_variant_match(match_pattern, seg) {
                return true;
            }
        }
        // Substring fallback ONLY over non-git segments, so a git rule is never
        // weaker than the old behaviour for genuinely non-git text, yet never
        // over-matches a real `git` command line.
        return segments
            .iter()
            .filter(|seg| shlex::split(seg).and_then(|t| git_salient(&t)).is_none())
            .any(|seg| seg.contains(match_pattern));
    }

    // 3. Literal substring (default + fallback for non-git patterns), incl.
    //    chained segments.
    if command_text.contains(match_pattern) {
        return true;
    }
    command_segments(command_text)
        .iter()
        .any(|seg| seg.contains(match_pattern))
}

/// Pure policy evaluation: returns the deny reason if any Block-mode command
/// rule matches the command text (variant-aware — see `matches_rule`), else
/// `None` (allow).
fn deny_reason<'a>(
    rule_set: &'a crate::enforcement::RuleSet,
    command_text: &str,
) -> Option<&'a str> {
    use crate::enforcement::RuleMode;
    rule_set.commands.iter().find_map(|rule| {
        let blocks = matches!(rule.mode, Some(RuleMode::Block))
            || (rule.mode.is_none() && rule_set.mode == RuleMode::Block);
        if blocks && !rule.match_.is_empty() && matches_rule(&rule.match_, command_text) {
            Some(rule.reason.as_str())
        } else {
            None
        }
    })
}

fn cmd_handle(rules_path: &Path) -> Result<()> {
    use crate::enforcement::RuleSet;

    // 1. Read the Claude Code PreToolUse event from stdin.
    let mut input = String::new();
    std::io::stdin().read_to_string(&mut input).ok();
    let event: serde_json::Value = serde_json::from_str(&input).unwrap_or(serde_json::json!({}));

    // Command text for Bash; fall back to the whole tool_input for other tools.
    let command_text = event
        .get("tool_input")
        .and_then(|ti| ti.get("command"))
        .and_then(|c| c.as_str())
        .map(|s| s.to_string())
        .unwrap_or_else(|| {
            event
                .get("tool_input")
                .map(|ti| ti.to_string())
                .unwrap_or_default()
        });

    // 2. Load rules; fail OPEN (allow silently) if the file is missing or
    //    unreadable, so a broken rules file never bricks the agent.
    let rule_set = match RuleSet::from_json_file(rules_path) {
        Ok(rs) => rs,
        Err(_) => return Ok(()),
    };

    // 3. Deny if a Block-mode rule matches; otherwise allow silently.
    if let Some(reason) = deny_reason(&rule_set, &command_text) {
        let payload = serde_json::json!({
            "hookSpecificOutput": {
                "hookEventName": "PreToolUse",
                "permissionDecision": "deny",
                "permissionDecisionReason": reason,
            }
        });
        println!("{}", serde_json::to_string(&payload)?);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::deny_reason;
    use crate::enforcement::{CommandRule, RuleMode, RuleSet};

    fn rule_set(match_: &str, mode: RuleMode) -> RuleSet {
        let mut rs = RuleSet::empty();
        rs.commands.push(CommandRule {
            match_: match_.to_string(),
            mode: Some(mode),
            reason: format!("blocked {match_}"),
            scope: Some("agent".to_string()),
        });
        rs
    }

    #[test]
    fn denies_matching_command() {
        let rs = rule_set("--no-verify", RuleMode::Block);
        assert_eq!(
            deny_reason(&rs, "git commit --no-verify -m x"),
            Some("blocked --no-verify")
        );
    }

    #[test]
    fn allows_benign_command() {
        let rs = rule_set("--no-verify", RuleMode::Block);
        assert_eq!(deny_reason(&rs, "git status"), None);
    }

    #[test]
    fn warn_mode_does_not_block() {
        let rs = rule_set("rm -rf", RuleMode::Warn);
        assert_eq!(deny_reason(&rs, "rm -rf /"), None);
    }

    #[test]
    fn empty_match_never_blocks() {
        let rs = rule_set("", RuleMode::Block);
        assert_eq!(deny_reason(&rs, "anything at all"), None);
    }

    // -----------------------------------------------------------------------
    // Variant-aware git matching — the substring-bypass threat regression.
    // A literal substring matcher LET `git push -u origin main` through; the
    // git-argv matcher must block every flag/prefix/whitespace variant.
    // -----------------------------------------------------------------------

    const PUSH_RULE: &str = "git push origin main";

    fn push_rs() -> RuleSet {
        rule_set(PUSH_RULE, RuleMode::Block)
    }

    #[test]
    fn git_variant_blocks_plain() {
        assert!(deny_reason(&push_rs(), "git push origin main").is_some());
    }

    #[test]
    fn git_variant_blocks_set_upstream_short() {
        // The original bypass: `-u` between `push` and `origin`.
        assert!(deny_reason(&push_rs(), "git push -u origin main").is_some());
    }

    #[test]
    fn git_variant_blocks_set_upstream_long() {
        assert!(deny_reason(&push_rs(), "git push --set-upstream origin main").is_some());
    }

    #[test]
    fn git_variant_blocks_force_flag() {
        assert!(deny_reason(&push_rs(), "git push -f origin main").is_some());
    }

    #[test]
    fn git_variant_blocks_dash_c_prefix() {
        assert!(deny_reason(&push_rs(), "git -C . push origin main").is_some());
    }

    #[test]
    fn git_variant_blocks_extra_whitespace() {
        assert!(deny_reason(&push_rs(), "git push  origin   main").is_some());
    }

    #[test]
    fn git_variant_blocks_env_prefix() {
        assert!(deny_reason(&push_rs(), "GIT_SSH=x git push -u origin main").is_some());
    }

    #[test]
    fn git_variant_blocks_in_chain() {
        // Buried in an `&&` chain.
        assert!(deny_reason(&push_rs(), "echo hi && git push origin main").is_some());
        assert!(deny_reason(&push_rs(), "true; git push -u origin main").is_some());
    }

    // -----------------------------------------------------------------------
    // Over-match guards — these MUST NOT be blocked by the push rule.
    // -----------------------------------------------------------------------

    #[test]
    fn git_variant_allows_pushover_subcommand() {
        // `pushover` is not `push`; ref differs too.
        assert_eq!(deny_reason(&push_rs(), "git pushover origin main-branch"), None);
    }

    #[test]
    fn git_variant_allows_maintenance_ref() {
        // `maintenance` must not be matched by `main` (no substring leak).
        assert_eq!(deny_reason(&push_rs(), "git push origin maintenance"), None);
    }

    #[test]
    fn git_variant_allows_different_ref() {
        assert_eq!(deny_reason(&push_rs(), "git push origin feature/x"), None);
    }

    #[test]
    fn git_variant_allows_unrelated_subcommand() {
        assert_eq!(deny_reason(&push_rs(), "git status"), None);
    }

    // -----------------------------------------------------------------------
    // Regex branch (`/.../`) — mirrors the dashboard TS regex contract.
    // -----------------------------------------------------------------------

    #[test]
    fn regex_rule_matches_push_variants() {
        let rs = rule_set(r"/git\s+push\s+.*origin.*main/", RuleMode::Block);
        assert!(deny_reason(&rs, "git push origin main").is_some());
        assert!(deny_reason(&rs, "git push -u origin main").is_some());
        assert!(deny_reason(&rs, "git push --set-upstream origin main").is_some());
    }

    #[test]
    fn regex_rule_does_not_match_unrelated() {
        let rs = rule_set(r"/git\s+push\s+.*origin.*main/", RuleMode::Block);
        assert_eq!(deny_reason(&rs, "git status"), None);
    }

    #[test]
    fn invalid_regex_fails_open_no_panic() {
        // An uncompilable regex must NOT panic; it falls back to literal
        // substring of the WHOLE `/.../` pattern (which won't appear in a real
        // command), so it neither crashes nor spuriously over-blocks.
        let rs = rule_set("/git push (origin/", RuleMode::Block);
        assert_eq!(deny_reason(&rs, "git push origin main"), None);
        // And it literally matches only if the raw bad pattern is present.
        assert!(deny_reason(&rs, "literal /git push (origin/ text").is_some());
    }

    // -----------------------------------------------------------------------
    // Back-compat: non-git literal patterns still match by substring, incl.
    // inside chains. (The existing tests above already cover --no-verify.)
    // -----------------------------------------------------------------------

    #[test]
    fn literal_non_git_still_substring_matches() {
        let rs = rule_set("rm -rf /", RuleMode::Block);
        assert!(deny_reason(&rs, "sudo rm -rf / --no-preserve-root").is_some());
    }

    #[test]
    fn literal_matches_in_chain() {
        let rs = rule_set("--no-verify", RuleMode::Block);
        assert!(deny_reason(&rs, "make build && git commit --no-verify -m x").is_some());
    }

    // -----------------------------------------------------------------------
    // Refspec-blindness + value-flag bypasses — the 10 empirically-found false
    // negatives against the rule `git push origin main`. Each one DOES update
    // origin/main, so each MUST now BLOCK.
    // -----------------------------------------------------------------------

    #[test]
    fn git_variant_blocks_all_refspec_and_value_flag_bypasses() {
        let rs = push_rs();
        let must_block = [
            "git push origin HEAD:main",                       // 1
            "git push --repo=origin main",                     // 2
            "git push origin +main",                           // 3 (force)
            "git push origin refs/heads/main",                 // 4
            "git push origin main:main",                       // 5
            "git push origin master:main",                     // 6
            "git push origin HEAD:refs/heads/main",            // 7
            "git push -o ci.skip origin main",                 // 8
            "git push --receive-pack x origin main",           // 9
            "git -c push.default=current push origin HEAD:main", // 10
        ];
        for cmd in must_block {
            assert!(
                deny_reason(&rs, cmd).is_some(),
                "expected BLOCK but got ALLOW for: {cmd}"
            );
        }
    }

    #[test]
    fn git_variant_allows_refspec_false_positive_guards() {
        let rs = push_rs();
        let must_allow = [
            "git push origin main:develop", // dst=develop -> allow
            "git push origin HEAD:feature", // dst=feature -> allow
            "git push origin develop",      // different ref
            "git push upstream main",       // different remote
            "git push origin maintenance",  // not `main` (no substring leak)
            "git pushover origin main-branch", // not `push`
            "git status",                   // unrelated subcommand
        ];
        for cmd in must_allow {
            assert_eq!(
                deny_reason(&rs, cmd),
                None,
                "expected ALLOW but got BLOCK for: {cmd}"
            );
        }
    }

    // Individual coverage for the most dangerous / representative cases.

    #[test]
    fn git_variant_blocks_force_refspec() {
        assert!(deny_reason(&push_rs(), "git push origin +main").is_some());
    }

    #[test]
    fn git_variant_blocks_repo_flag() {
        assert!(deny_reason(&push_rs(), "git push --repo=origin main").is_some());
        assert!(deny_reason(&push_rs(), "git push --repo origin main").is_some());
    }

    #[test]
    fn git_variant_blocks_head_colon_main() {
        assert!(deny_reason(&push_rs(), "git push origin HEAD:main").is_some());
    }

    #[test]
    fn git_variant_blocks_fully_qualified_ref() {
        assert!(deny_reason(&push_rs(), "git push origin refs/heads/main").is_some());
    }

    #[test]
    fn git_variant_allows_refspec_to_other_branch() {
        // src=main but dst=develop -> must NOT block.
        assert_eq!(deny_reason(&push_rs(), "git push origin main:develop"), None);
    }

    // -----------------------------------------------------------------------
    // Multi-positional refspec bypass — pushing the protected ref alongside
    // OTHER refs in one `git push`. Whole-tuple equality missed these because
    // the extra refs changed the positional arity; per-destination containment
    // keyed on the remote catches them. Each DOES update origin/main → BLOCK.
    // -----------------------------------------------------------------------

    #[test]
    fn git_variant_blocks_multi_refspec_pushes() {
        let rs = push_rs();
        let must_block = [
            "git push origin develop main", // feature branch + main together
            "git push origin foo main",     // main last among >2 refs
            "git push origin main foo",     // main first among >2 refs
        ];
        for cmd in must_block {
            assert!(
                deny_reason(&rs, cmd).is_some(),
                "expected BLOCK but got ALLOW for: {cmd}"
            );
        }
    }

    #[test]
    fn git_variant_allows_multi_refspec_false_positive_guards() {
        // Multiple refs, but NONE normalizes to `origin/main`, OR the remote
        // differs, OR it isn't a push — must NOT block.
        let rs = push_rs();
        let must_allow = [
            "git push origin foo:develop",  // two refs, neither dst is main
            "git push origin foo bar",      // two refs, neither is main
            "git push upstream foo main",   // main present but remote ≠ origin
            "git push origin main:develop", // dst=develop (single, control)
            "git push origin HEAD:feature", // dst=feature
            "git push origin develop",      // single different ref
            "git push upstream main",       // different remote
            "git push origin maintenance",  // not `main` (no substring leak)
            "git pushover origin main-branch", // subcommand ≠ push
            "git fetch origin main",        // rule is push, not fetch
            "git log origin/main",          // unrelated subcommand
            "git status",                   // unrelated subcommand
            "git push origin foo:develop",  // (repeat) explicitly listed guard
        ];
        for cmd in must_allow {
            assert_eq!(
                deny_reason(&rs, cmd),
                None,
                "expected ALLOW but got BLOCK for: {cmd}"
            );
        }
    }

    #[test]
    fn git_variant_blocks_delete_forms() {
        // Delete forms also update origin/main on the receiving end → BLOCK.
        let rs = push_rs();
        assert!(deny_reason(&rs, "git push origin --delete main").is_some());
        assert!(deny_reason(&rs, "git push origin :main").is_some());
    }
}
