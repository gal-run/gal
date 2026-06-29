#![allow(dead_code)]

use anyhow::{anyhow, Context, Result};
use reqwest::{
    header::{self, HeaderMap, HeaderValue},
    Client, Response, StatusCode,
};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

// ---------------------------------------------------------------------------
// Rich canonical types live in the `types` module (`crate::types::*`).
// This module keeps simpler API wire-format types for backward compatibility
// with the existing command implementations. New code should use the rich
// types from `crate::types` directly.
// ---------------------------------------------------------------------------
// Local CLI Config — ~/.gal/config.json
//
// NOTE: This is distinct from the rich GalConfig in types.rs (which represents
// the .gal/config.yaml approved-config schema). This type manages the CLI's own
// local auth and preference storage.
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize)]
pub struct LocalConfig {
    #[serde(rename = "authToken")]
    pub auth_token: Option<String>,
    #[serde(rename = "apiUrl")]
    pub api_url: Option<String>,
    #[serde(rename = "defaultOrg")]
    pub default_org: Option<String>,
    #[serde(rename = "apiKey", default)]
    pub api_key: Option<String>,
}

impl LocalConfig {
    /// Load config from ~/.gal/config.json
    pub fn load() -> Result<Self> {
        let path = Self::path();
        if path.exists() {
            let content = std::fs::read_to_string(&path)
                .with_context(|| format!("Failed to read config at {}", path.display()))?;
            serde_json::from_str(&content)
                .with_context(|| format!("Failed to parse config at {}", path.display()))
        } else {
            Ok(Self {
                auth_token: None,
                api_url: None,
                default_org: None,
                api_key: None,
            })
        }
    }

    /// Save config to ~/.gal/config.json.
    ///
    /// The file holds the bearer token, so on Unix the directory is created
    /// 0700 and the file is written 0600 (owner-only) — never world-readable.
    pub fn save(&self) -> Result<()> {
        let path = Self::path();
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .context("Failed to create ~/.gal directory")?;
            #[cfg(unix)]
            {
                use std::os::unix::fs::PermissionsExt;
                let _ = std::fs::set_permissions(parent, std::fs::Permissions::from_mode(0o700));
            }
        }
        let content = serde_json::to_string_pretty(self)?;
        std::fs::write(&path, &content)
            .with_context(|| format!("Failed to write config at {}", path.display()))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            std::fs::set_permissions(&path, std::fs::Permissions::from_mode(0o600))
                .with_context(|| format!("Failed to set 0600 perms on {}", path.display()))?;
        }
        Ok(())
    }

    fn path() -> PathBuf {
        let home = dirs::home_dir().expect("Could not determine home directory");
        home.join(".gal").join("config.json")
    }
}

// ---------------------------------------------------------------------------
// API response types
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize, Deserialize)]
pub struct UserResponse {
    pub login: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub email: Option<String>,
    #[serde(default, rename = "avatarUrl")]
    pub avatar_url: Option<String>,
    #[serde(default)]
    pub organizations: Option<Vec<String>>,
}

/// Wrapper for the legacy `/auth/me` envelope, which nests the user under
/// `{ "user": { ... } }` (the prod Express monolith), unlike the flat
/// `/users/me` shape.
#[derive(Debug, Deserialize)]
pub struct AuthMeResponse {
    pub user: UserResponse,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CredentialSyncResponse {
    pub success: bool,
    #[serde(default)]
    pub error: Option<String>,
    #[serde(default)]
    pub token_prefix: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CredentialStatus {
    pub provider: String,
    pub exists: bool,
    pub status: String,
    #[serde(default)]
    pub token_prefix: Option<String>,
    #[serde(default)]
    pub updated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CredentialsListResponse {
    pub credentials: Vec<CredentialStatus>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ValidateCredentialResponse {
    pub valid: bool,
    #[serde(default)]
    pub status: Option<String>,
    #[serde(default)]
    pub error: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct CreateSessionRequest {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub org: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub project_context: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub branch: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub runner_label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub agent: Option<String>,
    #[serde(rename = "initialPrompt", skip_serializing_if = "Option::is_none")]
    pub initial_prompt: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub dispatch_backend: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Session {
    pub id: String,
    pub status: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub project_context: Option<String>,
    #[serde(default)]
    pub branch: Option<String>,
    #[serde(default)]
    pub agent: Option<String>,
    #[serde(default)]
    pub runner_label: Option<String>,
    #[serde(default)]
    pub workflow_run_id: Option<i64>,
    #[serde(default)]
    pub agent_session_id: Option<String>,
    #[serde(default)]
    pub error_message: Option<String>,
    #[serde(default)]
    pub created_at: Option<String>,
    #[serde(default)]
    pub started_at: Option<String>,
    #[serde(default)]
    pub terminated_at: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ListSessionsResponse {
    pub sessions: Vec<Session>,
    #[serde(default)]
    pub next_cursor: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkItem {
    pub id: String,
    pub command: String,
    pub status: String,
    pub priority: i64,
    #[serde(default)]
    pub sdlc_phase: Option<i64>,
    #[serde(default)]
    pub parent_issue_id: Option<String>,
    #[serde(default)]
    pub claimed_by: Option<String>,
    #[serde(default)]
    pub source: Option<serde_json::Value>,
    #[serde(default)]
    pub context: Option<String>,
    #[serde(default)]
    pub result: Option<serde_json::Value>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AddToQueueRequest {
    pub command: String,
    pub priority: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source: Option<serde_json::Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preferred_agent: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct AddToQueueResponse {
    pub work_item: WorkItem,
    #[serde(default)]
    pub duplicate: Option<serde_json::Value>,
    #[serde(default)]
    pub queue_position: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct QueueStats {
    pub pending: i64,
    pub active: i64,
    pub completed_today: i64,
    pub failed_today: i64,
    #[serde(default)]
    pub consumer_healthy: bool,
    #[serde(default)]
    pub daily_cost_usd: f64,
    #[serde(default)]
    pub daily_budget_usd: f64,
    #[serde(default)]
    pub queue_depth: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct GrantPlanResponse {
    pub organization: String,
    pub plan_tier: String,
    pub seat_limit: i64,
    pub granted_by: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct OrgSummary {
    pub name: String,
    pub plan_tier: String,
    pub seat_limit: i64,
    pub total_configs: i64,
    #[serde(default)]
    pub manual_grant: Option<serde_json::Value>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct ListOrganizationsResponse {
    pub organizations: Vec<OrgSummary>,
    pub total: i64,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct WorkflowTestRequest {
    pub file_name: String,
    #[serde(rename = "type")]
    pub test_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub platform: Option<String>,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub test_cases: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_iterations: Option<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct EnqueueIssuesRequest {
    pub owner: String,
    pub repo: String,
    pub issue_numbers: Vec<i64>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FeatureFlagsResponse {
    #[serde(default)]
    pub org_audience_tier_map: Option<serde_json::Value>,
    #[serde(default)]
    pub org_plan_map: Option<serde_json::Value>,
}

// ---------------------------------------------------------------------------
// ApiClient
// ---------------------------------------------------------------------------

#[derive(Clone)]
pub struct ApiClient {
    client: Client,
    pub base_url: String,
    auth_token: Option<String>,
}

impl ApiClient {
    pub fn new(base_url: &str, token: Option<String>) -> Result<Self> {
        let auth_token = token.or_else(|| {
            LocalConfig::load().ok().and_then(|c| c.auth_token)
        });

        let client = Client::builder()
            .user_agent("gal-cli-oss/0.1.0")
            .build()
            .context("Failed to build HTTP client")?;

        Ok(Self {
            client,
            base_url: base_url.trim_end_matches('/').to_string(),
            auth_token,
        })
    }

    pub fn set_token(&mut self, token: String) {
        self.auth_token = Some(token);
    }

    pub fn has_token(&self) -> bool {
        self.auth_token.is_some()
    }

    fn headers(&self) -> Result<HeaderMap> {
        let mut headers = HeaderMap::new();
        headers.insert(
            header::CONTENT_TYPE,
            HeaderValue::from_static("application/json"),
        );
        if let Some(ref token) = self.auth_token {
            let auth_value = format!("Bearer {}", token);
            headers.insert(
                header::AUTHORIZATION,
                HeaderValue::from_str(&auth_value)
                    .map_err(|_| anyhow!("Invalid auth token"))?,
            );
        }
        Ok(headers)
    }

    pub(crate) async fn get<T: serde::de::DeserializeOwned>(&self, path: &str) -> Result<T> {
        let url = format!("{}{}", self.base_url, path);
        let response = self
            .client
            .get(&url)
            .headers(self.headers()?)
            .send()
            .await
            .with_context(|| format!("GET {} failed", url))?;
        Self::handle_response(response).await
    }

    pub(crate) async fn post<T: serde::de::DeserializeOwned>(
        &self,
        path: &str,
        body: Option<&serde_json::Value>,
    ) -> Result<T> {
        let url = format!("{}{}", self.base_url, path);
        let mut req = self.client.post(&url).headers(self.headers()?);
        if let Some(b) = body {
            req = req.json(b);
        }
        let response = req
            .send()
            .await
            .with_context(|| format!("POST {} failed", url))?;
        Self::handle_response(response).await
    }

    /// POST using a DEDICATED short-timeout client. Intended for the Stop-hook
    /// `capture-session` path, which runs inside the host Claude session and must
    /// NEVER hang: a blackholed/stalled TCP connection on the shared `self.client`
    /// (which has no timeouts) would block the await forever. The bounded client
    /// here guarantees the await returns (Err) within `total` even against an
    /// unroutable/non-responding peer. Auth headers and base-url resolution are
    /// reused unchanged; only the timeout behavior differs from `post`.
    pub(crate) async fn post_bounded<T: serde::de::DeserializeOwned>(
        &self,
        path: &str,
        body: Option<&serde_json::Value>,
        connect: std::time::Duration,
        total: std::time::Duration,
    ) -> Result<T> {
        let client = Client::builder()
            .user_agent("gal-cli-oss/0.1.0")
            .connect_timeout(connect)
            .timeout(total)
            .build()
            .context("Failed to build bounded HTTP client")?;

        let url = format!("{}{}", self.base_url, path);
        let mut req = client.post(&url).headers(self.headers()?);
        if let Some(b) = body {
            req = req.json(b);
        }
        let response = req
            .send()
            .await
            .with_context(|| format!("POST {} failed", url))?;
        Self::handle_response(response).await
    }

    pub(crate) async fn put<T: serde::de::DeserializeOwned>(
        &self,
        path: &str,
        body: Option<&serde_json::Value>,
    ) -> Result<T> {
        let url = format!("{}{}", self.base_url, path);
        let mut req = self.client.put(&url).headers(self.headers()?);
        if let Some(b) = body {
            req = req.json(b);
        }
        let response = req
            .send()
            .await
            .with_context(|| format!("PUT {} failed", url))?;
        Self::handle_response(response).await
    }

    pub(crate) async fn patch<T: serde::de::DeserializeOwned>(
        &self,
        path: &str,
        body: Option<&serde_json::Value>,
    ) -> Result<T> {
        let url = format!("{}{}", self.base_url, path);
        let mut req = self.client.patch(&url).headers(self.headers()?);
        if let Some(b) = body {
            req = req.json(b);
        }
        let response = req
            .send()
            .await
            .with_context(|| format!("PATCH {} failed", url))?;
        Self::handle_response(response).await
    }

    pub(crate) async fn delete(&self, path: &str) -> Result<()> {
        let url = format!("{}{}", self.base_url, path);
        let response = self
            .client
            .delete(&url)
            .headers(self.headers()?)
            .send()
            .await
            .with_context(|| format!("DELETE {} failed", url))?;
        let status = response.status();
        if status.is_success() || status == StatusCode::NO_CONTENT {
            Ok(())
        } else {
            let body = response.text().await.unwrap_or_default();
            Err(anyhow!("DELETE {} returned {}: {}", url, status, body))
        }
    }

    async fn handle_response<T: serde::de::DeserializeOwned>(
        response: Response,
    ) -> Result<T> {
        let status = response.status();
        if status.is_success() || status == StatusCode::NO_CONTENT {
            if status == StatusCode::NO_CONTENT {
                // Return a default for 204
                return serde_json::from_str("null")
                    .map_err(|_| anyhow!("Failed to parse empty response"));
            }
            let bytes = response.bytes().await?;
            if bytes.is_empty() || bytes.as_ref() == b"null" {
                return serde_json::from_str("null")
                    .map_err(|_| anyhow!("Failed to parse null response"));
            }
            let value: T = serde_json::from_slice(&bytes)
                .with_context(|| {
                    format!(
                        "Failed to parse response: {}",
                        String::from_utf8_lossy(&bytes).chars().take(200).collect::<String>()
                    )
                })?;
            Ok(value)
        } else {
            let body = response.text().await.unwrap_or_default();
            // Try to extract error message from JSON response
            if let Ok(err_val) = serde_json::from_str::<serde_json::Value>(&body) {
                if let Some(msg) = err_val.get("error").and_then(|v| v.as_str()) {
                    return Err(anyhow!("API error ({}): {}", status, msg));
                }
                if let Some(msg) = err_val.get("message").and_then(|v| v.as_str()) {
                    return Err(anyhow!("API error ({}): {}", status, msg));
                }
            }
            Err(anyhow!(
                "API error ({}): {}",
                status,
                body.chars().take(200).collect::<String>()
            ))
        }
    }

    // ─── Auth ───────────────────────────────────────────────────────

    pub async fn get_current_user(&self) -> Result<UserResponse> {
        // Prod serves the legacy `/auth/me` endpoint (nested `{ user: { .. } }`
        // envelope), not a flat `/users/me`. Fetch the wrapper and unwrap it.
        let resp: AuthMeResponse = self.get("/auth/me").await?;
        Ok(resp.user)
    }

    pub async fn get_feature_flags(&self) -> Result<FeatureFlagsResponse> {
        self.get("/feature-flags").await
    }

    pub async fn get_credentials(&self) -> Result<CredentialsListResponse> {
        self.get("/credentials").await
    }

    pub async fn sync_credentials(
        &self,
        provider: &str,
        fields: &serde_json::Value,
    ) -> Result<CredentialSyncResponse> {
        self.post(&format!("/credentials/{}", provider), Some(fields))
            .await
    }

    pub async fn validate_credential(
        &self,
        provider: &str,
    ) -> Result<ValidateCredentialResponse> {
        self.post(
            &format!("/credentials/{}/validate", provider),
            Some(&serde_json::json!({})),
        )
        .await
    }

    // ─── Organizations ──────────────────────────────────────────────

    pub async fn get_organizations(
        &self,
    ) -> Result<Vec<serde_json::Value>> {
        self.get("/organizations").await
    }

    // ─── Sessions ───────────────────────────────────────────────────

    pub async fn create_session(
        &self,
        request: &CreateSessionRequest,
    ) -> Result<Session> {
        let body = serde_json::to_value(request)?;
        self.post("/sessions", Some(&body)).await
    }

    pub async fn list_sessions(
        &self,
        status: Option<&str>,
        limit: Option<i64>,
        cursor: Option<&str>,
    ) -> Result<ListSessionsResponse> {
        let mut path = "/sessions".to_string();
        let mut params: Vec<String> = Vec::new();
        if let Some(s) = status {
            params.push(format!("status={}", urlencoding(s)));
        }
        if let Some(l) = limit {
            params.push(format!("limit={}", l));
        }
        if let Some(c) = cursor {
            params.push(format!("cursor={}", urlencoding(c)));
        }
        if !params.is_empty() {
            path.push('?');
            path.push_str(&params.join("&"));
        }
        self.get(&path).await
    }

    pub async fn get_session(&self, id: &str) -> Result<Session> {
        self.get(&format!("/sessions/{}", id)).await
    }

    pub async fn terminate_session(
        &self,
        id: &str,
        reason: Option<&str>,
    ) -> Result<Session> {
        let body = serde_json::json!({ "reason": reason });
        self.post(&format!("/sessions/{}/terminate", id), Some(&body))
            .await
    }

    pub async fn resume_session(
        &self,
        id: &str,
        prompt: &str,
        dispatch_backend: Option<&str>,
    ) -> Result<serde_json::Value> {
        let body = serde_json::json!({
            "prompt": prompt,
            "dispatchBackend": dispatch_backend,
        });
        self.post(&format!("/sessions/{}/resume", id), Some(&body))
            .await
    }

    pub async fn send_directive(
        &self,
        from_id: &str,
        directive: &serde_json::Value,
    ) -> Result<serde_json::Value> {
        self.post(
            &format!("/sessions/{}/directive", from_id),
            Some(directive),
        )
        .await
    }

    // ─── Queue ──────────────────────────────────────────────────────

    pub async fn add_to_queue(
        &self,
        request: &AddToQueueRequest,
    ) -> Result<AddToQueueResponse> {
        let body = serde_json::to_value(request)?;
        self.post("/queue", Some(&body)).await
    }

    pub async fn list_queue(
        &self,
        status: Option<&str>,
        limit: Option<i64>,
    ) -> Result<Vec<WorkItem>> {
        let mut path = "/queue".to_string();
        let mut params: Vec<String> = Vec::new();
        if let Some(s) = status {
            params.push(format!("status={}", urlencoding(s)));
        }
        if let Some(l) = limit {
            params.push(format!("limit={}", l));
        }
        if !params.is_empty() {
            path.push('?');
            path.push_str(&params.join("&"));
        }
        self.get(&path).await
    }

    pub async fn get_queue_stats(&self) -> Result<QueueStats> {
        self.get("/queue/status").await
    }

    pub async fn cancel_queue_item(&self, id: &str) -> Result<serde_json::Value> {
        self.post(
            &format!("/queue/{}/cancel", id),
            Some(&serde_json::json!({})),
        )
        .await
    }

    pub async fn enqueue_issues(
        &self,
        owner: &str,
        repo: &str,
        issue_numbers: &[i64],
    ) -> Result<serde_json::Value> {
        let body = serde_json::json!({
            "owner": owner,
            "repo": repo,
            "issueNumbers": issue_numbers,
        });
        self.post("/queue/enqueue", Some(&body)).await
    }

    // ─── Workflow Test ──────────────────────────────────────────────

    pub async fn test_workflow(
        &self,
        _org: &str,
        request: &WorkflowTestRequest,
    ) -> Result<serde_json::Value> {
        let body = serde_json::to_value(request)?;
        self.post(
            "/sdlc/workflow-test",
            Some(&body),
        )
        .await
    }

    pub async fn test_workflow_batch(
        &self,
        _org: &str,
        requests: &[WorkflowTestRequest],
    ) -> Result<serde_json::Value> {
        let body = serde_json::json!({ "requests": requests });
        self.post(
            "/sdlc/workflow-test/batch",
            Some(&body),
        )
        .await
    }

    // ─── Admin ──────────────────────────────────────────────────────

    pub async fn grant_plan(
        &self,
        org: &str,
        plan: &str,
        reason: &str,
    ) -> Result<GrantPlanResponse> {
        let body = serde_json::json!({
            "plan": plan,
            "reason": reason,
        });
        self.post(
            &format!("/admin/organizations/{}/grant-plan", org),
            Some(&body),
        )
        .await
    }

    pub async fn list_organizations_admin(
        &self,
    ) -> Result<ListOrganizationsResponse> {
        self.get("/admin/organizations").await
    }

    // ─── Health ─────────────────────────────────────────────────────

    pub async fn test_connection(&self) -> Result<bool> {
        match self.get::<serde_json::Value>("/health").await {
            Ok(_) => Ok(true),
            Err(_) => Ok(false),
        }
    }

    // ─── Config / Approved Config ───────────────────────────────────

    pub async fn get_approved_config(
        &self,
        org: &str,
        platform: &str,
    ) -> Result<serde_json::Value> {
        self.get(&format!(
            "/approved-config?org={}&platform={}",
            org, platform
        ))
        .await
    }

    // ─── Proposals ──────────────────────────────────────────────────

    pub async fn create_proposal(
        &self,
        scope: &str,
        org: &str,
        repo: Option<&str>,
        description: Option<&str>,
        content: &serde_json::Value,
    ) -> Result<serde_json::Value> {
        let body = serde_json::json!({
            "scope": scope,
            "org": org,
            "repo": repo,
            "description": description,
            "content": content,
        });
        self.post("/proposals", Some(&body)).await
    }

    // ─── Invites ────────────────────────────────────────────────────

    pub async fn validate_invite(&self, code: &str) -> Result<serde_json::Value> {
        self.get(&format!("/invites/{}/validate", code)).await
    }

    pub async fn accept_invite(
        &self,
        code: &str,
        email: &str,
        machine_id: &str,
        hostname: &str,
    ) -> Result<serde_json::Value> {
        let body = serde_json::json!({
            "email": email,
            "machineId": machine_id,
            "hostname": hostname,
        });
        self.post(&format!("/invites/{}/accept", code), Some(&body))
            .await
    }

    // ─── Sync ───────────────────────────────────────────────────────

    pub async fn sync_pull_config(
        &self,
        org: &str,
        platform: Option<&str>,
    ) -> Result<serde_json::Value> {
        let mut body = serde_json::json!({"org": org});
        let mut path = "/config-repo/sync/pull".to_string();
        if let Some(p) = platform {
            path.push_str(&format!("?platform={}", p));
            body["platform"] = serde_json::json!(p);
        }
        self.post(&path, Some(&body)).await
    }

    pub async fn sync_push_learnings(
        &self,
        _org: &str,
        learnings: &serde_json::Value,
    ) -> Result<serde_json::Value> {
        self.post(
            "/learning",
            Some(learnings),
        )
        .await
    }
}

fn urlencoding(s: &str) -> String {
    url::form_urlencoded::byte_serialize(s.as_bytes()).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_legacy_auth_me_envelope() {
        // Prod `/auth/me` returns a nested `{ user: { .. } }` envelope with the
        // camelCase `avatarUrl` field. Ensure both deserialize correctly.
        let json = r#"{"user":{"login":"octocat","name":"Octo","email":"o@x.com","avatarUrl":"http://a","organizations":["acme"]}}"#;
        let resp: AuthMeResponse = serde_json::from_str(json).expect("should deserialize");
        assert_eq!(resp.user.login, "octocat");
        assert_eq!(resp.user.organizations, Some(vec!["acme".to_string()]));
        assert_eq!(resp.user.avatar_url, Some("http://a".to_string()));
    }
}
