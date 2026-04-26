use crate::{
    config::{AppConfig, Session, SessionPublic},
    pty::PtySession,
};
use std::{
    collections::HashMap,
    sync::{Mutex, RwLock},
};
use uuid::Uuid;

pub struct AppState {
    pub config: RwLock<AppConfig>,
    pub ptys: Mutex<HashMap<Uuid, PtySession>>,
    pub session_to_ssh_pty: Mutex<HashMap<Uuid, Uuid>>,
    pub session_to_sftp_pty: Mutex<HashMap<Uuid, Uuid>>,
}

impl AppState {
    pub fn new(cfg: AppConfig) -> Self {
        Self {
            config: RwLock::new(cfg),
            ptys: Mutex::new(HashMap::new()),
            session_to_ssh_pty: Mutex::new(HashMap::new()),
            session_to_sftp_pty: Mutex::new(HashMap::new()),
        }
    }

    pub fn get_session(&self, id: Uuid) -> Option<Session> {
        let cfg = self.config.read().ok()?;
        cfg.sessions.iter().find(|s| s.id == id).cloned()
    }

    pub fn list_sessions_public(&self) -> Vec<SessionPublic> {
        let cfg = self.config.read().unwrap();
        cfg.sessions.iter().map(SessionPublic::from).collect()
    }
}

