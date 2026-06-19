use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use crate::{RunRecord, SuperAgentService};

const STATE_PATH_ENV: &str = "SUPER_AGENT_STATE_PATH";

#[derive(Debug)]
pub struct ServiceRuntime {
    state_path: PathBuf,
    service: Mutex<SuperAgentService>,
}

impl ServiceRuntime {
    pub fn load_default() -> Result<Self, String> {
        Self::from_path(default_state_path())
    }

    pub fn from_path(state_path: impl Into<PathBuf>) -> Result<Self, String> {
        let state_path = state_path.into();
        let service = load_service(&state_path)?;
        Ok(Self {
            state_path,
            service: Mutex::new(service),
        })
    }

    pub fn new_in_memory() -> Self {
        Self {
            state_path: PathBuf::from(":memory:"),
            service: Mutex::new(SuperAgentService::default()),
        }
    }

    pub fn state_path(&self) -> &Path {
        &self.state_path
    }

    pub fn execute(
        &self,
        intent: impl Into<String>,
        require_consent: bool,
    ) -> Result<RunRecord, String> {
        let mut service = self.service.lock().map_err(|err| err.to_string())?;
        let run = service.execute(intent, require_consent);
        self.persist(&service)?;
        Ok(run)
    }

    pub fn status(&self, run_id: &str) -> Result<Option<RunRecord>, String> {
        let service = self.service.lock().map_err(|err| err.to_string())?;
        Ok(service.status(run_id).cloned())
    }

    pub fn approve(&self, run_id: &str) -> Result<Option<RunRecord>, String> {
        let mut service = self.service.lock().map_err(|err| err.to_string())?;
        let run = service.approve(run_id);
        if run.is_some() {
            self.persist(&service)?;
        }
        Ok(run)
    }

    pub fn halt(&self, run_id: &str) -> Result<Option<RunRecord>, String> {
        let mut service = self.service.lock().map_err(|err| err.to_string())?;
        let run = service.halt(run_id);
        if run.is_some() {
            self.persist(&service)?;
        }
        Ok(run)
    }

    fn persist(&self, service: &SuperAgentService) -> Result<(), String> {
        if self.state_path == Path::new(":memory:") {
            return Ok(());
        }
        if let Some(parent) = self.state_path.parent() {
            fs::create_dir_all(parent).map_err(|err| err.to_string())?;
        }
        let bytes = serde_json::to_vec_pretty(service).map_err(|err| err.to_string())?;
        fs::write(&self.state_path, bytes).map_err(|err| err.to_string())
    }
}

pub fn default_state_path() -> PathBuf {
    std::env::var_os(STATE_PATH_ENV)
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from(".super-agent").join("state.json"))
}

fn load_service(state_path: &Path) -> Result<SuperAgentService, String> {
    let Ok(bytes) = fs::read(state_path) else {
        return Ok(SuperAgentService::default());
    };
    serde_json::from_slice(&bytes).map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use std::time::{SystemTime, UNIX_EPOCH};

    use super::*;

    fn temp_state_path() -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system time should be after unix epoch")
            .as_nanos();
        std::env::temp_dir().join(format!("super-agent-runtime-{unique}.json"))
    }

    #[test]
    fn runtime_persists_runs_between_instances() {
        let path = temp_state_path();
        let runtime = ServiceRuntime::from_path(&path).expect("runtime should load");
        let run = runtime
            .execute("review and deploy the service", false)
            .expect("execute should succeed");

        let reloaded = ServiceRuntime::from_path(&path).expect("runtime should reload");
        let persisted = reloaded
            .status(&run.id)
            .expect("status should succeed")
            .expect("run should exist after reload");

        assert_eq!(persisted.id, run.id);

        let _ = fs::remove_file(path);
    }
}
