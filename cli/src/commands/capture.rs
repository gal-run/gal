//! `gal capture-session` — Claude Code Stop-hook transcript capture.
//!
//! Business logic
//! --------------
//! This subcommand is invoked by the Claude Code "Stop" hook (either directly
//! as a settings.json command, or via `execSync` from gal-usage-report.js). It
//! reads the hook's stdin JSON (snake_case `session_id`/`transcript_path`/`cwd`/
//! `hook_event_name`), reads + size-bounds + secret-redacts the Claude Code JSONL
//! transcript, and POSTs the STORE-RAW wire payload to the telemetry-svc Go
//! endpoint `POST /session-outputs` via the shared authenticated [`ApiClient`].
//!
//! The wire contract is pinned to gal-model `SCHEMA_VERSION` =
//! `"gal-runtime-record/v1"`; the transcript is shipped as-is (gal-model's
//! `adapt_claude_code_transcript` normalizes it later, downstream).
//!
//! CRITICAL invariant: this command is strictly best-effort / fail-silent. Every
//! step is wrapped so it can NEVER panic or propagate an error to the host Claude
//! session — `run` always returns `Ok(())` (exit 0). If anything goes wrong
//! (empty/unparseable stdin, missing/unreadable transcript, network failure) we
//! simply ship nothing and exit 0.

use std::path::PathBuf;

use anyhow::Result;
use clap::Parser;
use serde::Deserialize;
use serde_json::Value;

use crate::client::{ApiClient, LocalConfig};

// =============================================================================
// Wire-contract constants (shared with the Go ingest endpoint + gal-model)
// =============================================================================

/// Pinned to gal-model `SCHEMA_VERSION` (multi_agent_audit_contract.py).
const SCHEMA_VERSION: &str = "gal-runtime-record/v1";
/// Tags the transcript array shape for the future adapter dispatch.
const TRANSCRIPT_FORMAT: &str = "claude-code-jsonl/v1";
/// `meta.cliVersion` stamp.
const CLI_VERSION: &str = concat!("gal-cli-oss/", env!("CARGO_PKG_VERSION"));

/// Ingest path on telemetry-svc (must match the Go route).
const INGEST_PATH: &str = "/session-outputs";

// --- Network timeouts (Stop-hook must NEVER hang the host Claude session) -----

/// TCP connect timeout for the capture POST. A blackholed peer must not stall.
const CAPTURE_CONNECT_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(3);
/// Overall request timeout for the capture POST (connect + send + response).
const CAPTURE_REQUEST_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(8);

// --- Transcript-file hard ceiling (read into RAM BEFORE bounding -> OOM risk) --

/// Refuse to read transcripts larger than this (stat'd before read_to_string).
/// A multi-GB transcript (or a FIFO/symlink to something huge) would otherwise
/// OOM the hook process. Above this we ship nothing (fail-silent).
const TRANSCRIPT_MAX_FILE_BYTES: u64 = 64 * 1024 * 1024; // 64 MiB

// --- Size bounds (enforced Rust-side BEFORE sending; Go re-enforces a ceiling) ---

/// Drop oldest transcript lines until the serialized array is under this size.
const TRANSCRIPT_SOFT_CAP_BYTES: usize = 4 * 1024 * 1024; // 4 MiB
/// Per-line cap for a single string field before its body is replaced.
const PER_FIELD_CAP_BYTES: usize = 64 * 1024; // 64 KiB
/// Never send more than this many lines.
const MAX_LINES: usize = 10_000;

// =============================================================================
// CLI args
// =============================================================================

#[derive(Parser, Debug)]
pub struct CaptureArgs {
    /// Runtime/platform tag -> wire `runtimeType`.
    #[arg(long, default_value = "claude-code")]
    pub platform: String,

    /// Hook event name; overrides stdin `hook_event_name` only when stdin lacks it.
    #[arg(long, default_value = "Stop")]
    pub hook_event: String,

    /// Org override; falls back to LocalConfig.default_org.
    #[arg(long)]
    pub org: Option<String>,

    /// Accepted for symmetry with other hook commands; capture always pushes.
    #[arg(long)]
    pub push: bool,

    /// Transcript path override; else taken from stdin `transcript_path`.
    #[arg(long)]
    pub transcript: Option<PathBuf>,

    /// Print the result/body JSON for debugging.
    #[arg(long, default_value_t = false)]
    pub json: bool,
}

/// Claude Code Stop-hook stdin shape (snake_case to match the host).
#[derive(Deserialize, Debug, Default)]
struct HookInput {
    #[serde(default)]
    session_id: Option<String>,
    #[serde(default)]
    transcript_path: Option<String>,
    #[serde(default)]
    cwd: Option<String>,
    #[serde(default)]
    hook_event_name: Option<String>,
}

// =============================================================================
// Entry point
// =============================================================================

/// Best-effort capture. ALWAYS returns Ok(()) — never blocks the host agent.
pub async fn run(client: ApiClient, args: CaptureArgs) -> Result<()> {
    // Read stdin to a string (wrapped — IO errors must not propagate).
    let raw_stdin = read_stdin();

    // Build the body; if anything is missing/unreadable, `build_body` returns None.
    let body = match build_body(&raw_stdin, &args) {
        Some(b) => b,
        None => return Ok(()), // fail-silent, exit 0
    };

    if args.json {
        // Debug aid only — does not affect exit code or the POST.
        if let Ok(s) = serde_json::to_string(&body) {
            eprintln!("{}", s);
        }
    }

    // Fire the POST via the DEDICATED short-timeout path so a stalled/blackholed
    // connection can NEVER hang the host Claude session. Swallow ANY error
    // (network, non-2xx, connect/request timeout).
    match client
        .post_bounded::<Value>(
            INGEST_PATH,
            Some(&body),
            CAPTURE_CONNECT_TIMEOUT,
            CAPTURE_REQUEST_TIMEOUT,
        )
        .await
    {
        Ok(resp) => {
            if args.json {
                if let Ok(s) = serde_json::to_string(&resp) {
                    eprintln!("{}", s);
                }
            }
        }
        Err(e) => {
            if args.json {
                eprintln!("capture-session: ingest failed (ignored): {}", e);
            }
        }
    }

    Ok(())
}

/// Read all of stdin into a String. Never panics; returns empty string on error.
fn read_stdin() -> String {
    use std::io::Read;
    let mut buf = String::new();
    let _ = std::io::stdin().read_to_string(&mut buf);
    buf
}

// =============================================================================
// Body construction (pure — unit-testable)
// =============================================================================

/// Build the wire-contract body from raw stdin + args, or None if we should
/// ship nothing (fail-silent). Pure/deterministic so it can be unit-tested.
fn build_body(raw_stdin: &str, args: &CaptureArgs) -> Option<Value> {
    // 1. Parse hook stdin. Empty/unparseable is OK *iff* --transcript is given.
    let hook: HookInput = serde_json::from_str(raw_stdin.trim()).unwrap_or_default();

    // 2. Resolve transcript path: --transcript wins, else stdin.transcript_path.
    let transcript_path: PathBuf = match &args.transcript {
        Some(p) => p.clone(),
        None => match &hook.transcript_path {
            Some(p) if !p.is_empty() => PathBuf::from(p),
            _ => return None, // nothing to capture
        },
    };

    // 3. Stat the file BEFORE reading it into RAM. Bail silently if it's not a
    //    regular file (FIFO/device/socket could block or stream forever) or if
    //    it exceeds the hard byte ceiling (multi-GB transcript -> OOM). The
    //    MAX_LINES / soft byte caps only apply AFTER the full parse, so they
    //    cannot protect against an oversized read; this stat is the real guard.
    let meta = std::fs::metadata(&transcript_path).ok()?;
    if !meta.is_file() {
        return None; // not a regular file -> ship nothing
    }
    if meta.len() > TRANSCRIPT_MAX_FILE_BYTES {
        return None; // over ceiling -> ship nothing
    }

    // Read + parse + bound + redact the transcript.
    let raw_transcript = std::fs::read_to_string(&transcript_path).ok()?;
    let parsed = parse_jsonl(&raw_transcript);
    if parsed.is_empty() {
        // Whole transcript unreadable/unparseable -> exit 0 silently.
        return None;
    }

    let mut redactions: usize = 0;
    // Redact + per-field cap each line.
    let mut lines: Vec<Value> = parsed
        .into_iter()
        .map(|mut v| {
            redact_value(&mut v, &mut redactions);
            cap_fields(&mut v);
            v
        })
        .collect();

    // Bound: line count, then byte size (drop oldest, always keep final line).
    let (bounded, truncated) = bound_transcript(&mut lines);
    let transcript_lines = bounded.len();

    // 5. Outcome hint from the last (terminal) line.
    let outcome = outcome_hint(bounded.last());

    // 4. Resolve identity fields.
    let session_id = resolve_session_id(&hook, &transcript_path);
    let runtime_type = args.platform.clone();
    let hook_event = hook
        .hook_event_name
        .clone()
        .unwrap_or_else(|| args.hook_event.clone());
    let org = args
        .org
        .clone()
        .or_else(|| LocalConfig::load().ok().and_then(|c| c.default_org))
        .unwrap_or_default();

    let ts = now_rfc3339();

    // meta: omit cwd when absent (per contract "may be omitted").
    let mut meta = serde_json::Map::new();
    meta.insert("hookEvent".into(), Value::String(hook_event));
    if let Some(cwd) = &hook.cwd {
        if !cwd.is_empty() {
            meta.insert("cwd".into(), Value::String(cwd.clone()));
        }
    }
    meta.insert("cliVersion".into(), Value::String(CLI_VERSION.to_string()));
    meta.insert("redactions".into(), Value::from(redactions));

    // 6. Build the body exactly per wire contract (all camelCase).
    Some(serde_json::json!({
        "schemaVersion": SCHEMA_VERSION,
        "runtimeType": runtime_type,
        "sessionId": session_id,
        "orgId": org,                  // advisory only; server forces from claim
        "ts": ts,
        "outcome": outcome,
        "transcript": bounded,
        "transcriptFormat": TRANSCRIPT_FORMAT,
        "transcriptLines": transcript_lines,
        "truncated": truncated,
        "meta": Value::Object(meta),
    }))
}

/// Parse JSONL: one JSON object per line; unparseable/blank lines are skipped.
fn parse_jsonl(raw: &str) -> Vec<Value> {
    raw.lines()
        .filter(|l| !l.trim().is_empty())
        .filter_map(|l| serde_json::from_str::<Value>(l).ok())
        .collect()
}

/// Resolve sessionId: stdin.session_id -> transcript filename stem -> uuid.
fn resolve_session_id(hook: &HookInput, transcript_path: &PathBuf) -> String {
    if let Some(sid) = &hook.session_id {
        if !sid.is_empty() {
            return sid.clone();
        }
    }
    if let Some(stem) = transcript_path.file_stem().and_then(|s| s.to_str()) {
        if !stem.is_empty() {
            return stem.to_string();
        }
    }
    uuid::Uuid::new_v4().to_string()
}

/// Current capture time as RFC3339 (UTC, second precision, trailing Z).
fn now_rfc3339() -> String {
    chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string()
}

// =============================================================================
// Outcome hint
// =============================================================================

/// Best-effort terminal-outcome hint. The server does NOT validate this (raw is
/// authoritative); it's only a convenience for the future adapter dispatch.
///
/// Rules: a final line whose `type == "error"`, or a "complete"-ish line whose
/// stop/end reason is not a successful one, maps to "error"; otherwise "complete".
fn outcome_hint(last: Option<&Value>) -> &'static str {
    let Some(v) = last else { return "complete" };

    // type == "error" -> error.
    if let Some(t) = v.get("type").and_then(|t| t.as_str()) {
        if t.eq_ignore_ascii_case("error") {
            return "error";
        }
    }

    // Inspect common reason fields for a non-successful terminal reason.
    let reason = v
        .get("stop_reason")
        .or_else(|| v.get("stopReason"))
        .or_else(|| v.pointer("/message/stop_reason"))
        .or_else(|| v.get("reason"))
        .and_then(|r| r.as_str());

    if let Some(r) = reason {
        let r_l = r.to_ascii_lowercase();
        // Successful terminal reasons for Claude-style transcripts.
        let ok = r_l == "end_turn"
            || r_l == "stop_sequence"
            || r_l == "tool_use"
            || r_l == "complete"
            || r_l == "completed"
            || r_l == "success";
        if !ok {
            return "error";
        }
    }

    "complete"
}

// =============================================================================
// Size bounding
// =============================================================================

/// Apply line-count + byte-size bounds in place. Returns (kept_lines, truncated).
/// Always keeps the final (terminal-outcome) line. Drops OLDEST first.
fn bound_transcript(lines: &mut Vec<Value>) -> (Vec<Value>, bool) {
    let mut truncated = false;

    // (a) Hard line cap: keep newest MAX_LINES.
    if lines.len() > MAX_LINES {
        let start = lines.len() - MAX_LINES;
        *lines = lines.split_off(start);
        truncated = true;
    }

    // (b) Byte cap: drop oldest until serialized array < soft cap, but always
    //     keep at least the final line.
    while lines.len() > 1 && serialized_len(lines) > TRANSCRIPT_SOFT_CAP_BYTES {
        lines.remove(0); // drop oldest
        truncated = true;
    }

    (std::mem::take(lines), truncated)
}

/// Serialized byte length of the transcript array (best-effort; 0 on error).
fn serialized_len(lines: &[Value]) -> usize {
    serde_json::to_vec(lines).map(|v| v.len()).unwrap_or(0)
}

// =============================================================================
// Per-field cap
// =============================================================================

/// Replace oversized `text` / `tool_result.content` string bodies with a
/// truncation marker. The adapter only needs structure when
/// include_raw_content=False, so dropping huge bodies is safe.
fn cap_fields(v: &mut Value) {
    match v {
        Value::Object(map) => {
            for (k, child) in map.iter_mut() {
                let is_capped_field = k == "text" || k == "content";
                if is_capped_field {
                    if let Value::String(s) = child {
                        if s.len() > PER_FIELD_CAP_BYTES {
                            let n = s.len();
                            *s = format!("[[truncated {} bytes]]", n);
                            continue;
                        }
                    }
                }
                cap_fields(child);
            }
        }
        Value::Array(arr) => {
            for child in arr.iter_mut() {
                cap_fields(child);
            }
        }
        _ => {}
    }
}

// =============================================================================
// Redaction (best-effort secret hygiene; fail-open, never fail-closed)
// =============================================================================

/// Recursively redact secret-shaped substrings inside every string value.
/// Increments `count` for each string that contained at least one secret.
fn redact_value(v: &mut Value, count: &mut usize) {
    match v {
        Value::String(s) => {
            let (redacted, hits) = redact_string(s);
            if hits > 0 {
                *s = redacted;
                *count += hits;
            }
        }
        Value::Array(arr) => {
            for child in arr.iter_mut() {
                redact_value(child, count);
            }
        }
        Value::Object(map) => {
            for (_, child) in map.iter_mut() {
                redact_value(child, count);
            }
        }
        _ => {}
    }
}

const REDACTED: &str = "[REDACTED]";

/// Redact secret-shaped tokens in a single string. Returns (new_string, hits).
///
/// This is a hand-rolled scanner (no regex crate dependency) covering the
/// contract's token shapes:
///   sk-[A-Za-z0-9]{16,}, gh[pousr]_[A-Za-z0-9]{20,}, AKIA[0-9A-Z]{16},
///   JWT eyJ<b64url>.<b64url>.<b64url>, xox[baprs]-[A-Za-z0-9-]{10,},
///   AIza[0-9A-Za-z_-]{30,}, and key=value secrets
///   (password|secret|api[_-]?key|token) "?[:=] "?<6+ non-space chars>.
fn redact_string(s: &str) -> (String, usize) {
    let mut hits = 0usize;
    let mut out = String::with_capacity(s.len());

    // First pass: prefix-anchored token shapes scanned left-to-right.
    let bytes = s.as_bytes();
    let n = bytes.len();
    let mut i = 0usize;
    while i < n {
        if let Some(consumed) = match_token_at(s, i) {
            out.push_str(REDACTED);
            hits += 1;
            i += consumed;
        } else {
            // Push one UTF-8 char and advance past it.
            let ch_len = utf8_char_len(bytes[i]);
            let end = (i + ch_len).min(n);
            out.push_str(&s[i..end]);
            i = end;
        }
    }

    // Second pass: key=value secrets (password/secret/api_key/token = ...).
    let (out2, kv_hits) = redact_kv_secrets(&out);
    hits += kv_hits;

    (out2, hits)
}

/// Number of bytes in a UTF-8 sequence given its leading byte.
fn utf8_char_len(b: u8) -> usize {
    if b < 0x80 {
        1
    } else if b >> 5 == 0b110 {
        2
    } else if b >> 4 == 0b1110 {
        3
    } else if b >> 3 == 0b11110 {
        4
    } else {
        1
    }
}

/// If a known secret token starts at byte offset `i`, return its byte length.
fn match_token_at(s: &str, i: usize) -> Option<usize> {
    let rest = &s[i..];

    // Must be at a token boundary: previous char not part of an identifier.
    if i > 0 {
        let prev = s.as_bytes()[i - 1];
        if is_token_char(prev) {
            return None;
        }
    }

    // sk-[A-Za-z0-9]{16,}
    if let Some(stripped) = rest.strip_prefix("sk-") {
        let run = alnum_run(stripped);
        if run >= 16 {
            return Some(3 + run);
        }
    }

    // gh[pousr]_[A-Za-z0-9]{20,}
    if rest.len() >= 4 && rest.as_bytes()[0] == b'g' && rest.as_bytes()[1] == b'h' {
        let third = rest.as_bytes()[2];
        if matches!(third, b'p' | b'o' | b'u' | b's' | b'r') && rest.as_bytes()[3] == b'_' {
            let run = alnum_run(&rest[4..]);
            if run >= 20 {
                return Some(4 + run);
            }
        }
    }

    // AKIA[0-9A-Z]{16,} — redact the FULL matched run, not a hardcoded 16 (a
    // longer AKIA-prefixed run otherwise leaks its trailing characters).
    if let Some(stripped) = rest.strip_prefix("AKIA") {
        let run = upper_alnum_run(stripped);
        if run >= 16 {
            return Some(4 + run);
        }
    }

    // Stripe live keys: (sk|rk|pk)_live_[A-Za-z0-9]{8,}
    for prefix in ["sk_live_", "rk_live_", "pk_live_"] {
        if let Some(stripped) = rest.strip_prefix(prefix) {
            let run = alnum_run(stripped);
            if run >= 8 {
                return Some(prefix.len() + run);
            }
        }
    }

    // PEM blocks: -----BEGIN [A-Z ]*PRIVATE KEY----- ... -----END ...-----
    if rest.starts_with("-----BEGIN ") {
        if let Some(len) = pem_block_len(rest) {
            return Some(len);
        }
    }

    // Authorization: Bearer <token>  /  bare  Bearer <token>
    if let Some(len) = bearer_len(rest) {
        return Some(len);
    }

    // JWT: eyJ<b64url>.<b64url>.<b64url>
    if rest.starts_with("eyJ") {
        if let Some(len) = jwt_len(rest) {
            return Some(len);
        }
    }

    // xox[baprs]-[A-Za-z0-9-]{10,}
    if rest.len() >= 5 && rest.as_bytes()[0] == b'x' && rest.as_bytes()[1] == b'o' && rest.as_bytes()[2] == b'x' {
        let fourth = rest.as_bytes()[3];
        if matches!(fourth, b'b' | b'a' | b'p' | b'r' | b's') && rest.as_bytes()[4] == b'-' {
            let run = alnum_dash_run(&rest[5..]);
            if run >= 10 {
                return Some(5 + run);
            }
        }
    }

    // AIza[0-9A-Za-z_-]{30,}
    if let Some(stripped) = rest.strip_prefix("AIza") {
        let run = alnum_underscore_dash_run(stripped);
        if run >= 30 {
            return Some(4 + run);
        }
    }

    None
}

/// True if `b` can be part of an identifier/token (so we don't redact mid-word).
fn is_token_char(b: u8) -> bool {
    b.is_ascii_alphanumeric() || b == b'_' || b == b'-'
}

/// Length of a run of [A-Za-z0-9] at the start of `s` (in bytes).
fn alnum_run(s: &str) -> usize {
    s.bytes().take_while(|b| b.is_ascii_alphanumeric()).count()
}

/// Length of a run of [0-9A-Z] at the start of `s`.
fn upper_alnum_run(s: &str) -> usize {
    s.bytes()
        .take_while(|b| b.is_ascii_digit() || b.is_ascii_uppercase())
        .count()
}

/// Length of a run of [A-Za-z0-9-] at the start of `s`.
fn alnum_dash_run(s: &str) -> usize {
    s.bytes()
        .take_while(|b| b.is_ascii_alphanumeric() || *b == b'-')
        .count()
}

/// Length of a run of [A-Za-z0-9_-] at the start of `s`.
fn alnum_underscore_dash_run(s: &str) -> usize {
    s.bytes()
        .take_while(|b| b.is_ascii_alphanumeric() || *b == b'_' || *b == b'-')
        .count()
}

/// Length of a run of base64url chars [A-Za-z0-9_-] at the start of `s`.
fn b64url_run(s: &str) -> usize {
    s.bytes()
        .take_while(|b| b.is_ascii_alphanumeric() || *b == b'_' || *b == b'-')
        .count()
}

/// Match a `Bearer <token>` (optionally the whole `Authorization: ` is left
/// verbatim; only the literal `Bearer ` + token run is redacted) starting at
/// `rest`. Returns the byte length of `Bearer <ws><token>` so the token is
/// fully replaced. The token is a run of [A-Za-z0-9._-] (covers JWTs/opaque
/// tokens), min length 8 to avoid false positives like `Bearer x`.
fn bearer_len(rest: &str) -> Option<usize> {
    let after = rest.strip_prefix("Bearer ").or_else(|| rest.strip_prefix("bearer "))?;
    // length of the literal "Bearer " prefix (7 bytes either case).
    let prefix_len = 7;
    // skip any extra whitespace between the scheme and the token.
    let ws = after.bytes().take_while(|b| *b == b' ' || *b == b'\t').count();
    let token = &after[ws..];
    let run = bearer_token_run(token);
    if run >= 8 {
        Some(prefix_len + ws + run)
    } else {
        None
    }
}

/// Length of a run of [A-Za-z0-9._-] at the start of `s` (Bearer-token chars).
fn bearer_token_run(s: &str) -> usize {
    s.bytes()
        .take_while(|b| b.is_ascii_alphanumeric() || matches!(*b, b'.' | b'_' | b'-'))
        .count()
}

/// Match a PEM private-key block starting at `rest`, which is already known to
/// begin with "-----BEGIN ". Matches `-----BEGIN [A-Z ]*PRIVATE KEY-----` then
/// consumes everything through the matching `-----END ...-----` footer. Returns
/// the total byte length of the whole block (header..footer inclusive), or None
/// if it isn't a PRIVATE KEY block or the footer is absent.
fn pem_block_len(rest: &str) -> Option<usize> {
    let header_body = rest.strip_prefix("-----BEGIN ")?;
    // Label is [A-Z ]* up to the closing "-----"; must contain "PRIVATE KEY".
    let label_end = header_body.find("-----")?;
    let label = &header_body[..label_end];
    if !label.bytes().all(|b| b.is_ascii_uppercase() || b == b' ') {
        return None;
    }
    if !label.contains("PRIVATE KEY") {
        return None;
    }
    // Find the END footer anywhere after the header and consume through its
    // closing "-----".
    let footer_marker = "-----END ";
    let after_header_idx = "-----BEGIN ".len() + label_end + "-----".len();
    let search_from = &rest[after_header_idx..];
    let end_rel = search_from.find(footer_marker)?;
    let footer_start = after_header_idx + end_rel + footer_marker.len();
    let footer_body = &rest[footer_start..];
    let footer_close = footer_body.find("-----")?;
    Some(footer_start + footer_close + "-----".len())
}

/// Match a JWT (three base64url segments separated by '.') starting at `rest`,
/// which is already known to begin with "eyJ". Returns total byte length.
fn jwt_len(rest: &str) -> Option<usize> {
    let seg1 = b64url_run(rest);
    if seg1 == 0 || rest.as_bytes().get(seg1) != Some(&b'.') {
        return None;
    }
    let after1 = &rest[seg1 + 1..];
    let seg2 = b64url_run(after1);
    if seg2 == 0 || after1.as_bytes().get(seg2) != Some(&b'.') {
        return None;
    }
    let after2 = &after1[seg2 + 1..];
    let seg3 = b64url_run(after2);
    if seg3 == 0 {
        return None;
    }
    Some(seg1 + 1 + seg2 + 1 + seg3)
}

/// Redact `(password|secret|api[_-]?key|token) [:=] <value>` style secrets.
/// Case-insensitive on the key; value is 6+ non-space, non-quote chars.
fn redact_kv_secrets(s: &str) -> (String, usize) {
    const KEYS: &[&str] = &["password", "secret", "api_key", "api-key", "apikey", "token"];

    let lower = s.to_ascii_lowercase();
    let bytes = s.as_bytes();
    let n = bytes.len();

    let mut out = String::with_capacity(s.len());
    let mut hits = 0usize;
    let mut i = 0usize;

    'outer: while i < n {
        for key in KEYS {
            if lower[i..].starts_with(key) {
                // Key must be at a word boundary on the left.
                if i > 0 && is_token_char(bytes[i - 1]) {
                    continue;
                }
                let j = i + key.len();
                // Copy the key verbatim.
                let key_str = &s[i..j];
                // Optional closing quote then separator.
                let mut k = j;
                // skip optional `"` right after the key
                if k < n && (bytes[k] == b'"' || bytes[k] == b'\'') {
                    k += 1;
                }
                // skip whitespace
                while k < n && (bytes[k] == b' ' || bytes[k] == b'\t') {
                    k += 1;
                }
                // require a separator : or =
                if k < n && (bytes[k] == b':' || bytes[k] == b'=') {
                    k += 1;
                    // skip whitespace
                    while k < n && (bytes[k] == b' ' || bytes[k] == b'\t') {
                        k += 1;
                    }
                    // optional opening quote
                    if k < n && (bytes[k] == b'"' || bytes[k] == b'\'') {
                        k += 1;
                    }
                    // value: 6+ chars that are not whitespace or quote
                    let val_start = k;
                    while k < n
                        && bytes[k] != b' '
                        && bytes[k] != b'\t'
                        && bytes[k] != b'"'
                        && bytes[k] != b'\''
                        && bytes[k] != b','
                        && bytes[k] != b'}'
                        && bytes[k] != b'\n'
                    {
                        k += 1;
                    }
                    let val_len = k - val_start;
                    if val_len >= 6 {
                        // Emit everything between key and value verbatim, then REDACTED.
                        out.push_str(key_str);
                        out.push_str(&s[j..val_start]);
                        out.push_str(REDACTED);
                        hits += 1;
                        i = k;
                        continue 'outer;
                    }
                }
                // Not a secret assignment — fall through, copy key verbatim.
                out.push_str(key_str);
                i = j;
                continue 'outer;
            }
        }
        let ch_len = utf8_char_len(bytes[i]);
        let end = (i + ch_len).min(n);
        out.push_str(&s[i..end]);
        i = end;
    }

    (out, hits)
}

// =============================================================================
// Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn args_with_transcript(path: PathBuf) -> CaptureArgs {
        CaptureArgs {
            platform: "claude-code".into(),
            hook_event: "Stop".into(),
            org: Some("acme".into()),
            push: true,
            transcript: Some(path),
            json: false,
        }
    }

    // --- Hook-stdin parsing -------------------------------------------------

    #[test]
    fn parses_snake_case_hook_stdin() {
        let raw = r#"{"session_id":"sess-123","transcript_path":"/tmp/x.jsonl","cwd":"/work","hook_event_name":"Stop"}"#;
        let hook: HookInput = serde_json::from_str(raw).unwrap();
        assert_eq!(hook.session_id.as_deref(), Some("sess-123"));
        assert_eq!(hook.transcript_path.as_deref(), Some("/tmp/x.jsonl"));
        assert_eq!(hook.cwd.as_deref(), Some("/work"));
        assert_eq!(hook.hook_event_name.as_deref(), Some("Stop"));
    }

    #[test]
    fn empty_stdin_without_transcript_flag_ships_nothing() {
        let args = CaptureArgs {
            platform: "claude-code".into(),
            hook_event: "Stop".into(),
            org: None,
            push: false,
            transcript: None,
            json: false,
        };
        assert!(build_body("", &args).is_none());
    }

    #[test]
    fn unparseable_stdin_without_transcript_flag_ships_nothing() {
        let args = CaptureArgs {
            platform: "claude-code".into(),
            hook_event: "Stop".into(),
            org: None,
            push: false,
            transcript: None,
            json: false,
        };
        assert!(build_body("not json at all {{{", &args).is_none());
    }

    #[test]
    fn missing_transcript_file_ships_nothing() {
        let args = args_with_transcript(PathBuf::from("/no/such/file/at/all.jsonl"));
        assert!(build_body("{}", &args).is_none());
    }

    // --- Body shape ---------------------------------------------------------

    #[test]
    fn builds_wire_contract_body() {
        let mut f = tempfile::NamedTempFile::new().unwrap();
        writeln!(f, r#"{{"type":"user","message":{{"role":"user","content":"hi"}}}}"#).unwrap();
        writeln!(f, r#"{{"type":"assistant","stop_reason":"end_turn","message":{{"role":"assistant","content":"hello"}}}}"#).unwrap();
        let path = f.path().to_path_buf();

        let raw = r#"{"session_id":"sess-1","transcript_path":"ignored","cwd":"/w","hook_event_name":"Stop"}"#;
        let args = args_with_transcript(path);
        let body = build_body(raw, &args).expect("body");

        assert_eq!(body["schemaVersion"], "gal-runtime-record/v1");
        assert_eq!(body["runtimeType"], "claude-code");
        assert_eq!(body["sessionId"], "sess-1");
        assert_eq!(body["orgId"], "acme");
        assert_eq!(body["transcriptFormat"], "claude-code-jsonl/v1");
        assert_eq!(body["transcriptLines"], 2);
        assert_eq!(body["truncated"], false);
        assert_eq!(body["outcome"], "complete");
        assert_eq!(body["meta"]["hookEvent"], "Stop");
        assert_eq!(body["meta"]["cwd"], "/w");
        assert!(body["meta"]["cliVersion"].as_str().unwrap().starts_with("gal-cli-oss/"));
        assert!(body["ts"].as_str().unwrap().ends_with('Z'));
        assert!(body["transcript"].is_array());
    }

    #[test]
    fn session_id_falls_back_to_filename_stem() {
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("abc-session-id.jsonl");
        std::fs::write(&path, "{\"type\":\"assistant\"}\n").unwrap();
        let hook = HookInput::default();
        assert_eq!(resolve_session_id(&hook, &path), "abc-session-id");
    }

    // --- Transcript bounding ------------------------------------------------

    #[test]
    fn bounds_line_count_keeps_newest() {
        let mut lines: Vec<Value> = (0..(MAX_LINES + 50))
            .map(|i| serde_json::json!({"n": i}))
            .collect();
        let (kept, truncated) = bound_transcript(&mut lines);
        assert_eq!(kept.len(), MAX_LINES);
        assert!(truncated);
        // newest kept: last element should be n = MAX_LINES + 49
        assert_eq!(kept.last().unwrap()["n"], (MAX_LINES + 49) as i64);
        // oldest dropped: first kept should be n = 50
        assert_eq!(kept.first().unwrap()["n"], 50);
    }

    #[test]
    fn bounds_byte_size_drops_oldest_keeps_final() {
        // Each line ~ > 0.5 MiB so a handful exceed the 4 MiB soft cap.
        let big = "x".repeat(600 * 1024);
        let mut lines: Vec<Value> = (0..12)
            .map(|i| serde_json::json!({"i": i, "blob": big}))
            .collect();
        let last_i = 11;
        let (kept, truncated) = bound_transcript(&mut lines);
        assert!(truncated);
        assert!(kept.len() < 12, "should have dropped some lines");
        // Final (terminal) line must always be kept.
        assert_eq!(kept.last().unwrap()["i"], last_i);
        assert!(serialized_len(&kept) <= TRANSCRIPT_SOFT_CAP_BYTES);
    }

    #[test]
    fn keeps_final_line_even_when_single_line_huge() {
        let big = "y".repeat(5 * 1024 * 1024);
        let mut lines = vec![serde_json::json!({"i": 0, "blob": big})];
        let (kept, _truncated) = bound_transcript(&mut lines);
        // Never drop the only/final line.
        assert_eq!(kept.len(), 1);
    }

    #[test]
    fn per_field_cap_replaces_huge_text_body() {
        let huge = "z".repeat(PER_FIELD_CAP_BYTES + 10);
        let mut v = serde_json::json!({"type":"assistant","text": huge});
        cap_fields(&mut v);
        let t = v["text"].as_str().unwrap();
        assert!(t.starts_with("[[truncated "));
        assert!(t.ends_with(" bytes]]"));
    }

    #[test]
    fn per_field_cap_replaces_nested_content() {
        let huge = "c".repeat(PER_FIELD_CAP_BYTES + 1);
        let mut v = serde_json::json!({
            "type":"user",
            "message": {"tool_result": {"content": huge}}
        });
        cap_fields(&mut v);
        let t = v["message"]["tool_result"]["content"].as_str().unwrap();
        assert!(t.starts_with("[[truncated "));
    }

    // --- Redaction ----------------------------------------------------------

    #[test]
    fn redacts_openai_key() {
        let (out, hits) = redact_string("here is sk-ABCD1234EFGH5678ijkl done");
        assert!(out.contains(REDACTED), "got: {}", out);
        assert!(!out.contains("sk-ABCD1234"), "got: {}", out);
        assert_eq!(hits, 1);
    }

    #[test]
    fn redacts_github_token() {
        let (out, hits) = redact_string("token ghp_0123456789abcdefghijABCDEFG end");
        assert!(out.contains(REDACTED));
        assert!(!out.contains("ghp_0123456789"));
        assert_eq!(hits, 1);
    }

    #[test]
    fn redacts_aws_access_key() {
        let (out, hits) = redact_string("AKIAIOSFODNN7EXAMPLE here");
        assert!(out.contains(REDACTED));
        assert!(!out.contains("AKIAIOSFODNN7EXAMPLE"));
        assert_eq!(hits, 1);
    }

    #[test]
    fn redacts_jwt() {
        let jwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c";
        let (out, hits) = redact_string(&format!("auth {} ok", jwt));
        assert!(out.contains(REDACTED));
        assert!(!out.contains("eyJhbGci"));
        assert_eq!(hits, 1);
    }

    #[test]
    fn redacts_slack_token() {
        let (out, hits) = redact_string("xoxb-1234567890-abcdefghijk here");
        assert!(out.contains(REDACTED));
        assert!(!out.contains("xoxb-1234567890"));
        assert_eq!(hits, 1);
    }

    #[test]
    fn redacts_google_api_key() {
        let (out, hits) = redact_string("AIzaSyA1234567890abcdefghij1234567890XY done");
        assert!(out.contains(REDACTED));
        assert!(!out.contains("AIzaSyA1234567890"));
        assert_eq!(hits, 1);
    }

    #[test]
    fn redacts_kv_secret() {
        let (out, hits) = redact_string(r#"config password: hunter2secret rest"#);
        assert!(out.contains(REDACTED), "got: {}", out);
        assert!(!out.contains("hunter2secret"), "got: {}", out);
        assert_eq!(hits, 1);
    }

    #[test]
    fn redacts_kv_token_equals() {
        let (out, hits) = redact_string(r#"token=abcdef123456 trailing"#);
        assert!(out.contains(REDACTED), "got: {}", out);
        assert_eq!(hits, 1);
    }

    #[test]
    fn leaves_clean_text_untouched() {
        let input = "this is a perfectly normal sentence with no secrets";
        let (out, hits) = redact_string(input);
        assert_eq!(out, input);
        assert_eq!(hits, 0);
    }

    #[test]
    fn redact_value_recurses_and_counts() {
        let mut v = serde_json::json!({
            "type": "assistant",
            "message": {
                "content": "my key is sk-ABCD1234EFGH5678ijkl",
                "nested": ["AKIAIOSFODNN7EXAMPLE", "clean string"]
            }
        });
        let mut count = 0usize;
        redact_value(&mut v, &mut count);
        assert_eq!(count, 2);
        assert!(v["message"]["content"].as_str().unwrap().contains(REDACTED));
        assert!(v["message"]["nested"][0].as_str().unwrap().contains(REDACTED));
        assert_eq!(v["message"]["nested"][1], "clean string");
    }

    #[test]
    fn redaction_reflected_in_body_meta() {
        let mut f = tempfile::NamedTempFile::new().unwrap();
        writeln!(
            f,
            r#"{{"type":"assistant","stop_reason":"end_turn","message":{{"content":"secret sk-ABCD1234EFGH5678ijkl here"}}}}"#
        )
        .unwrap();
        let args = args_with_transcript(f.path().to_path_buf());
        let body = build_body("{}", &args).expect("body");
        assert_eq!(body["meta"]["redactions"], 1);
        let s = serde_json::to_string(&body).unwrap();
        assert!(!s.contains("sk-ABCD1234EFGH5678ijkl"));
    }

    // --- Outcome hint -------------------------------------------------------

    #[test]
    fn outcome_error_on_error_type() {
        let v = serde_json::json!({"type":"error","message":"boom"});
        assert_eq!(outcome_hint(Some(&v)), "error");
    }

    #[test]
    fn outcome_error_on_bad_reason() {
        let v = serde_json::json!({"type":"assistant","stop_reason":"max_tokens"});
        assert_eq!(outcome_hint(Some(&v)), "error");
    }

    #[test]
    fn outcome_complete_on_end_turn() {
        let v = serde_json::json!({"type":"assistant","stop_reason":"end_turn"});
        assert_eq!(outcome_hint(Some(&v)), "complete");
    }

    #[test]
    fn outcome_complete_on_no_signal() {
        let v = serde_json::json!({"type":"assistant"});
        assert_eq!(outcome_hint(Some(&v)), "complete");
        assert_eq!(outcome_hint(None), "complete");
    }

    // --- Errors swallowed (exit 0) -----------------------------------------

    #[tokio::test]
    async fn run_with_no_stdin_and_no_transcript_returns_ok() {
        // No transcript file, empty stdin -> must exit Ok (fail-silent).
        let client = ApiClient::new("http://127.0.0.1:1", None).unwrap();
        let args = CaptureArgs {
            platform: "claude-code".into(),
            hook_event: "Stop".into(),
            org: None,
            push: false,
            transcript: None,
            json: false,
        };
        // build_body returns None first, so no network call is attempted.
        let res = run(client, args).await;
        assert!(res.is_ok());
    }

    #[tokio::test]
    async fn run_swallows_network_error() {
        // Valid transcript so a POST is attempted, but to an unreachable host.
        let mut f = tempfile::NamedTempFile::new().unwrap();
        writeln!(f, r#"{{"type":"assistant","stop_reason":"end_turn"}}"#).unwrap();
        // Port 1 is unreachable -> reqwest errors -> must be swallowed.
        let client = ApiClient::new("http://127.0.0.1:1", Some("tok".into())).unwrap();
        let args = args_with_transcript(f.path().to_path_buf());
        let res = run(client, args).await;
        assert!(res.is_ok(), "network error must be swallowed (exit 0)");
    }

    // --- FIX 1: hang-prone connection still returns Ok within the timeout ----

    #[tokio::test]
    async fn run_does_not_hang_on_blackholed_connection() {
        // 10.255.255.1 is an RFC1918 address that, when unrouted, neither
        // accepts nor refuses the connection — the TCP handshake stalls
        // indefinitely. Without connect/request timeouts on the client this
        // await would block forever (freezing the host Claude session). The
        // bounded capture client must make the whole `run` return within its
        // configured request timeout. We wrap in a generous outer bound: if the
        // inner timeouts work, this completes well under it.
        let mut f = tempfile::NamedTempFile::new().unwrap();
        writeln!(f, r#"{{"type":"assistant","stop_reason":"end_turn"}}"#).unwrap();
        let client =
            ApiClient::new("http://10.255.255.1:80", Some("tok".into())).unwrap();
        let args = args_with_transcript(f.path().to_path_buf());

        // Outer bound = configured request timeout + slack. If the call hangs,
        // this elapses and the test fails instead of hanging the suite forever.
        let outer = CAPTURE_REQUEST_TIMEOUT + std::time::Duration::from_secs(7);
        let started = std::time::Instant::now();
        let res = tokio::time::timeout(outer, run(client, args)).await;
        let elapsed = started.elapsed();

        assert!(
            res.is_ok(),
            "capture must not hang past the bounded timeout (elapsed {:?})",
            elapsed
        );
        // The inner request timeout (8s) should fire well before the outer bound.
        assert!(
            elapsed < outer,
            "capture returned but took too long: {:?}",
            elapsed
        );
        // And it must be Ok(()) — the timeout error is swallowed (fail-silent).
        assert!(res.unwrap().is_ok(), "timeout must be swallowed (exit 0)");
    }

    // --- FIX 2: over-ceiling transcript bails to ship-nothing ----------------

    #[test]
    fn oversized_transcript_file_ships_nothing() {
        // A file whose reported size exceeds the hard ceiling must bail BEFORE
        // read_to_string (which would otherwise OOM on a multi-GB transcript).
        // We don't actually allocate 64 MiB+; we set the file length sparsely.
        let dir = tempfile::tempdir().unwrap();
        let path = dir.path().join("huge.jsonl");
        let f = std::fs::File::create(&path).unwrap();
        // Sparse: report a length just over the ceiling without writing bytes.
        f.set_len(TRANSCRIPT_MAX_FILE_BYTES + 1).unwrap();
        drop(f);

        let args = args_with_transcript(path);
        assert!(
            build_body("{}", &args).is_none(),
            "over-ceiling transcript must ship nothing"
        );
    }

    #[test]
    fn under_ceiling_transcript_is_processed() {
        // A normal small transcript still works after the size guard.
        let mut f = tempfile::NamedTempFile::new().unwrap();
        writeln!(f, r#"{{"type":"assistant","stop_reason":"end_turn"}}"#).unwrap();
        let args = args_with_transcript(f.path().to_path_buf());
        assert!(build_body("{}", &args).is_some());
    }

    // --- FIX 3: AKIA full-run + new patterns ---------------------------------

    #[test]
    fn redacts_long_akia_run_without_leaking_tail() {
        // AKIA + 20 uppercase/digit chars: the old `Some(4 + 16)` left the last
        // 4 chars in the clear. Must now redact the full run.
        let key = "AKIAABCDEFGHIJ1234567890"; // AKIA + 20
        let (out, hits) = redact_string(&format!("aws {} tail", key));
        assert_eq!(hits, 1, "got: {}", out);
        assert!(out.contains(REDACTED), "got: {}", out);
        assert!(!out.contains("567890"), "leaked AKIA tail: {}", out);
        assert!(!out.contains("AKIA"), "got: {}", out);
    }

    #[test]
    fn redacts_authorization_bearer() {
        let (out, hits) =
            redact_string("Authorization: Bearer abc123DEF456ghi789 trailing");
        assert!(out.contains(REDACTED), "got: {}", out);
        assert!(!out.contains("abc123DEF456ghi789"), "got: {}", out);
        assert_eq!(hits, 1);
    }

    #[test]
    fn redacts_bare_bearer_token() {
        let (out, hits) = redact_string("Bearer eyJabc.defGHI.jklMNO0123 done");
        assert!(out.contains(REDACTED), "got: {}", out);
        assert!(!out.contains("eyJabc.defGHI.jklMNO0123"), "got: {}", out);
        assert_eq!(hits, 1);
    }

    #[test]
    fn redacts_stripe_live_keys() {
        for prefix in ["sk_live_", "rk_live_", "pk_live_"] {
            let key = format!("{}{}", prefix, "0123456789abcdefABCD");
            let (out, hits) = redact_string(&format!("stripe {} end", key));
            assert_eq!(hits, 1, "prefix {} got: {}", prefix, out);
            assert!(out.contains(REDACTED), "prefix {} got: {}", prefix, out);
            assert!(!out.contains(&key), "leaked {}: {}", prefix, out);
        }
    }

    #[test]
    fn redacts_pem_private_key_block() {
        let pem = "-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA1234567890\nabcdEFGHijklMNOP\n-----END RSA PRIVATE KEY-----";
        let (out, hits) = redact_string(&format!("key:\n{}\nrest", pem));
        assert!(out.contains(REDACTED), "got: {}", out);
        assert!(!out.contains("MIIEowIBAA"), "leaked PEM body: {}", out);
        assert!(!out.contains("BEGIN RSA PRIVATE KEY"), "got: {}", out);
        assert_eq!(hits, 1);
        // surrounding context preserved
        assert!(out.starts_with("key:\n"), "got: {}", out);
        assert!(out.ends_with("\nrest"), "got: {}", out);
    }

    #[test]
    fn pem_non_private_key_block_is_left_alone() {
        // A CERTIFICATE block is not a private key -> not redacted by the PEM arm.
        let pem = "-----BEGIN CERTIFICATE-----\nMIIBxyz\n-----END CERTIFICATE-----";
        let (out, _hits) = redact_string(pem);
        assert!(out.contains("BEGIN CERTIFICATE"), "got: {}", out);
    }
}
