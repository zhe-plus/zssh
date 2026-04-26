mod config;
mod dpapi;
mod pty;
mod sftp;
mod ssh;
mod state;
mod store;

use crate::{
    config::{
        Auth, Group, Session, SessionPublic, Settings, UpsertAuthInput, UpsertGroupInput, UpsertSessionInput,
    },
    dpapi::{protect_string, unprotect_string},
    pty::{pty_kill, pty_resize, pty_write, spawn_pty, PtyKind},
    sftp::{sftp_cd, sftp_get, sftp_ls, sftp_mkdir, sftp_pwd, sftp_put, sftp_rename, sftp_rm, RemoteEntry},
    ssh::ssh_pwd,
    state::AppState,
    store::{known_hosts_path, load_config, save_config},
};
use anyhow::{anyhow, Result};
use portable_pty::CommandBuilder;
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::menu::{MenuBuilder, MenuItemBuilder, SubmenuBuilder};
use tauri::{AppHandle, Emitter, Manager, State};
use uuid::Uuid;

pub use crate::pty::strip_ansi_and_osc;

fn debug_enabled() -> bool {
    cfg!(debug_assertions) && std::env::var_os("ZSSH_DEBUG").is_some()
}

fn now_epoch_seconds() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn sh_quote(s: &str) -> String {
    let mut out = String::from("'");
    for c in s.chars() {
        if c == '\'' {
            out.push_str("'\\''");
        } else {
            out.push(c);
        }
    }
    out.push('\'');
    out
}

fn build_ssh_command(app: &AppHandle, s: &Session, start_dir: Option<&str>) -> Result<CommandBuilder> {
    let known_hosts = known_hosts_path(app)?;
    let mut cmd = CommandBuilder::new("ssh");
    if cfg!(debug_assertions) && std::env::var_os("ZSSH_SSH_VERBOSE").is_some() {
        cmd.arg("-vvv");
    }
    if start_dir.is_some() {
        cmd.arg("-tt");
    }
    cmd.arg("-p");
    cmd.arg(s.port.to_string());
    cmd.arg("-o");
    cmd.arg(format!("UserKnownHostsFile={}", known_hosts.display()));
    cmd.arg("-o");
    cmd.arg("StrictHostKeyChecking=ask");

    if let Some(timeout) = s.connection.connect_timeout_seconds {
        cmd.arg("-o");
        cmd.arg(format!("ConnectTimeout={timeout}"));
    }
    if let Some(keep_alive) = s.connection.keep_alive_interval_seconds {
        cmd.arg("-o");
        cmd.arg(format!("ServerAliveInterval={keep_alive}"));
    }

    match &s.auth {
        config::Auth::Password { .. } => {
            cmd.arg("-o");
            cmd.arg("PreferredAuthentications=password");
            cmd.arg("-o");
            cmd.arg("PubkeyAuthentication=no");
        }
        config::Auth::Key {
            private_key_path, ..
        } => {
            cmd.arg("-i");
            cmd.arg(private_key_path);
            cmd.arg("-o");
            cmd.arg("IdentitiesOnly=yes");
        }
    }

    cmd.arg(format!("{}@{}", s.username, s.host));
    if let Some(dir) = start_dir {
        cmd.arg("sh");
        cmd.arg("-lc");
        let q = sh_quote(dir);
        cmd.arg(format!(
            "cd -- {q} 2>/dev/null || cd {q} 2>/dev/null || true; exec ${{SHELL:-sh}}"
        ));
    }
    Ok(cmd)
}

fn build_sftp_command(app: &AppHandle, s: &Session, start_dir: Option<&str>) -> Result<CommandBuilder> {
    let known_hosts = known_hosts_path(app)?;
    let mut cmd = CommandBuilder::new("sftp");
    if cfg!(debug_assertions) && std::env::var_os("ZSSH_SSH_VERBOSE").is_some() {
        cmd.arg("-vvv");
    }
    cmd.arg("-P");
    cmd.arg(s.port.to_string());
    cmd.arg("-o");
    cmd.arg(format!("UserKnownHostsFile={}", known_hosts.display()));
    cmd.arg("-o");
    cmd.arg("StrictHostKeyChecking=ask");

    if let Some(timeout) = s.connection.connect_timeout_seconds {
        cmd.arg("-o");
        cmd.arg(format!("ConnectTimeout={timeout}"));
    }
    if let Some(keep_alive) = s.connection.keep_alive_interval_seconds {
        cmd.arg("-o");
        cmd.arg(format!("ServerAliveInterval={keep_alive}"));
    }

    match &s.auth {
        config::Auth::Password { .. } => {
            cmd.arg("-o");
            cmd.arg("PreferredAuthentications=password");
            cmd.arg("-o");
            cmd.arg("PubkeyAuthentication=no");
        }
        config::Auth::Key {
            private_key_path, ..
        } => {
            cmd.arg("-i");
            cmd.arg(private_key_path);
            cmd.arg("-o");
            cmd.arg("IdentitiesOnly=yes");
        }
    }

    if let Some(dir) = start_dir {
        cmd.arg(format!("{}@{}:{}", s.username, s.host, dir));
    } else {
        cmd.arg(format!("{}@{}", s.username, s.host));
    }
    Ok(cmd)
}

fn session_from_input(input: &UpsertSessionInput) -> Session {
    let auth = match &input.auth {
        UpsertAuthInput::Password { .. } => config::Auth::Password { password_dpapi: None },
        UpsertAuthInput::Key { private_key_path, .. } => config::Auth::Key {
            private_key_path: private_key_path.clone(),
            passphrase_dpapi: None,
        },
    };
    Session {
        id: Uuid::new_v4(),
        name: input.name.clone(),
        host: input.host.clone(),
        port: input.port,
        username: input.username.clone(),
        protocol: input.protocol.clone(),
        auth,
        appearance: input.appearance.clone().unwrap_or_default(),
        connection: input.connection.clone().unwrap_or_default(),
        group_id: None,
        favorite: false,
        sort_index: 0,
        created_at: now_epoch_seconds(),
        updated_at: now_epoch_seconds(),
    }
}

#[tauri::command]
fn groups_list(state: State<'_, AppState>) -> Vec<Group> {
    let cfg = state.config.read().unwrap();
    cfg.groups.clone()
}

#[tauri::command]
fn group_upsert(app: AppHandle, state: State<'_, AppState>, input: UpsertGroupInput) -> Result<Group, String> {
    let mut cfg = state.config.write().unwrap();
    let id = input.id.unwrap_or_else(Uuid::new_v4);
    let name = input.name;
    let sort_index = input.sort_index.unwrap_or(0);

    let mut updated: Option<Group> = None;
    if let Some(g) = cfg.groups.iter_mut().find(|g| g.id == id) {
        g.name = name.clone();
        g.sort_index = sort_index;
        updated = Some(g.clone());
    }
    if let Some(g) = updated {
        cfg.groups.sort_by_key(|g| g.sort_index);
        save_config(&app, &cfg).map_err(|e| e.to_string())?;
        return Ok(g);
    }

    let g = Group {
        id,
        name,
        sort_index,
    };
    cfg.groups.push(g.clone());
    cfg.groups.sort_by_key(|g| g.sort_index);
    save_config(&app, &cfg).map_err(|e| e.to_string())?;
    Ok(g)
}

#[tauri::command]
fn group_delete(app: AppHandle, state: State<'_, AppState>, group_id: Uuid) -> Result<(), String> {
    let mut cfg = state.config.write().unwrap();
    cfg.groups.retain(|g| g.id != group_id);
    for s in cfg.sessions.iter_mut() {
        if s.group_id == Some(group_id) {
            s.group_id = None;
        }
    }
    save_config(&app, &cfg).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn sessions_list(state: State<'_, AppState>) -> Vec<SessionPublic> {
    state.list_sessions_public()
}

#[tauri::command]
fn session_get(state: State<'_, AppState>, session_id: Uuid) -> Option<SessionPublic> {
    let cfg = state.config.read().unwrap();
    cfg.sessions
        .iter()
        .find(|s| s.id == session_id)
        .map(SessionPublic::from)
}

#[tauri::command]
fn session_upsert(app: AppHandle, state: State<'_, AppState>, input: UpsertSessionInput) -> Result<SessionPublic, String> {
    let mut cfg = state.config.write().unwrap();
    let now = now_epoch_seconds();
    let id = input.id.unwrap_or_else(Uuid::new_v4);

    let existing = cfg.sessions.iter().find(|s| s.id == id).cloned();
    let created_at = existing.as_ref().map(|s| s.created_at).unwrap_or(now);
    let updated_at = now;

    let appearance = input.appearance.unwrap_or_else(config::Appearance::default);
    let connection = input.connection.unwrap_or_else(config::ConnectionOptions::default);

    let auth = match input.auth {
        UpsertAuthInput::Password { password } => {
            let prev = match existing.as_ref() {
                Some(Session {
                    auth: config::Auth::Password { password_dpapi },
                    ..
                }) => password_dpapi.clone(),
                _ => None,
            };
            let password_dpapi = match password {
                Some(p) if !p.is_empty() => Some(protect_string(&p).map_err(|e| e.to_string())?),
                Some(_) => None,
                None => prev,
            };
            config::Auth::Password { password_dpapi }
        }
        UpsertAuthInput::Key {
            private_key_path,
            passphrase,
        } => {
            let prev = match existing.as_ref() {
                Some(Session {
                    auth: config::Auth::Key { passphrase_dpapi, .. },
                    ..
                }) => passphrase_dpapi.clone(),
                _ => None,
            };
            let passphrase_dpapi = match passphrase {
                Some(p) if !p.is_empty() => Some(protect_string(&p).map_err(|e| e.to_string())?),
                Some(_) => None,
                None => prev,
            };
            config::Auth::Key {
                private_key_path,
                passphrase_dpapi,
            }
        }
    };

    let sort_index = input.sort_index.unwrap_or(existing.as_ref().map(|s| s.sort_index).unwrap_or(0));

    let s = Session {
        id,
        name: input.name,
        host: input.host,
        port: input.port,
        username: input.username,
        protocol: input.protocol,
        auth,
        appearance,
        connection,
        group_id: input.group_id,
        favorite: input.favorite,
        sort_index,
        created_at,
        updated_at,
    };

    cfg.sessions.retain(|x| x.id != id);
    cfg.sessions.push(s.clone());
    save_config(&app, &cfg).map_err(|e| e.to_string())?;
    Ok(SessionPublic::from(&s))
}

#[tauri::command]
fn session_delete(app: AppHandle, state: State<'_, AppState>, session_id: Uuid) -> Result<(), String> {
    let mut cfg = state.config.write().unwrap();
    cfg.sessions.retain(|s| s.id != session_id);
    save_config(&app, &cfg).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn settings_get(state: State<'_, AppState>) -> config::Settings {
    let cfg = state.config.read().unwrap();
    cfg.settings.clone()
}

#[tauri::command]
fn settings_set(app: AppHandle, state: State<'_, AppState>, settings: config::Settings) -> Result<(), String> {
    let mut cfg = state.config.write().unwrap();
    cfg.settings = settings;
    save_config(&app, &cfg).map_err(|e| e.to_string())?;
    Ok(())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportConfig {
    schema_version: u32,
    settings: Settings,
    groups: Vec<Group>,
    sessions: Vec<ExportSession>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct ExportSession {
    id: Uuid,
    name: String,
    host: String,
    port: u16,
    username: String,
    protocol: config::Protocol,
    auth: ExportAuth,
    appearance: config::Appearance,
    connection: config::ConnectionOptions,
    group_id: Option<Uuid>,
    favorite: bool,
    sort_index: i32,
    created_at: i64,
    updated_at: i64,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
enum ExportAuth {
    Password { password: Option<String> },
    Key { private_key_path: String, passphrase: Option<String> },
}

fn export_from_config(cfg: &config::AppConfig, include_sensitive: bool) -> ExportConfig {
    let sessions = cfg
        .sessions
        .iter()
        .map(|s| {
            let auth = match &s.auth {
                Auth::Password { password_dpapi } => ExportAuth::Password {
                    password: if include_sensitive {
                        password_dpapi.as_ref().and_then(|v| unprotect_string(v).ok())
                    } else {
                        None
                    },
                },
                Auth::Key {
                    private_key_path,
                    passphrase_dpapi,
                } => ExportAuth::Key {
                    private_key_path: private_key_path.clone(),
                    passphrase: if include_sensitive {
                        passphrase_dpapi.as_ref().and_then(|v| unprotect_string(v).ok())
                    } else {
                        None
                    },
                },
            };
            ExportSession {
                id: s.id,
                name: s.name.clone(),
                host: s.host.clone(),
                port: s.port,
                username: s.username.clone(),
                protocol: s.protocol.clone(),
                auth,
                appearance: s.appearance.clone(),
                connection: s.connection.clone(),
                group_id: s.group_id,
                favorite: s.favorite,
                sort_index: s.sort_index,
                created_at: s.created_at,
                updated_at: s.updated_at,
            }
        })
        .collect::<Vec<_>>();

    ExportConfig {
        schema_version: cfg.schema_version,
        settings: cfg.settings.clone(),
        groups: cfg.groups.clone(),
        sessions,
    }
}

fn apply_import(app: &AppHandle, state: &AppState, imported: ExportConfig, mode: &str) -> Result<()> {
    let mut cfg = state.config.write().unwrap();
    if mode == "replace" {
        cfg.schema_version = imported.schema_version.max(1);
        cfg.settings = imported.settings;
        cfg.groups = imported.groups;
        cfg.sessions = vec![];
        for s in imported.sessions {
            let auth = match s.auth {
                ExportAuth::Password { password } => Auth::Password {
                    password_dpapi: password.and_then(|p| protect_string(&p).ok()),
                },
                ExportAuth::Key {
                    private_key_path,
                    passphrase,
                } => Auth::Key {
                    private_key_path,
                    passphrase_dpapi: passphrase.and_then(|p| protect_string(&p).ok()),
                },
            };
            cfg.sessions.push(Session {
                id: s.id,
                name: s.name,
                host: s.host,
                port: s.port,
                username: s.username,
                protocol: s.protocol,
                auth,
                appearance: s.appearance,
                connection: s.connection,
                group_id: s.group_id,
                favorite: s.favorite,
                sort_index: s.sort_index,
                created_at: s.created_at,
                updated_at: s.updated_at,
            });
        }
    } else {
        let mut group_by_id = std::collections::BTreeMap::<Uuid, Group>::new();
        for g in cfg.groups.iter().cloned() {
            group_by_id.insert(g.id, g);
        }
        for g in imported.groups {
            group_by_id.insert(g.id, g);
        }
        cfg.groups = group_by_id.values().cloned().collect();
        cfg.groups.sort_by_key(|g| g.sort_index);

        let mut session_by_id = std::collections::BTreeMap::<Uuid, Session>::new();
        for s in cfg.sessions.iter().cloned() {
            session_by_id.insert(s.id, s);
        }
        for s in imported.sessions {
            let auth = match s.auth {
                ExportAuth::Password { password } => Auth::Password {
                    password_dpapi: password.and_then(|p| protect_string(&p).ok()),
                },
                ExportAuth::Key {
                    private_key_path,
                    passphrase,
                } => Auth::Key {
                    private_key_path,
                    passphrase_dpapi: passphrase.and_then(|p| protect_string(&p).ok()),
                },
            };
            session_by_id.insert(
                s.id,
                Session {
                    id: s.id,
                    name: s.name,
                    host: s.host,
                    port: s.port,
                    username: s.username,
                    protocol: s.protocol,
                    auth,
                    appearance: s.appearance,
                    connection: s.connection,
                    group_id: s.group_id,
                    favorite: s.favorite,
                    sort_index: s.sort_index,
                    created_at: s.created_at,
                    updated_at: s.updated_at,
                },
            );
        }
        cfg.sessions = session_by_id.values().cloned().collect();
        cfg.sessions.sort_by_key(|s| s.sort_index);
    }
    save_config(app, &cfg)?;
    Ok(())
}

#[tauri::command]
fn config_export_cmd(state: State<'_, AppState>, include_sensitive: bool) -> Result<String, String> {
    let cfg = state.config.read().unwrap();
    let out = export_from_config(&cfg, include_sensitive);
    serde_json::to_string_pretty(&out).map_err(|e| e.to_string())
}

#[tauri::command]
fn config_export_to_path_cmd(state: State<'_, AppState>, include_sensitive: bool, path: String) -> Result<(), String> {
    let cfg = state.config.read().unwrap();
    let out = export_from_config(&cfg, include_sensitive);
    let json = serde_json::to_string_pretty(&out).map_err(|e| e.to_string())?;
    std::fs::write(path, json).map_err(|e| e.to_string())
}

#[tauri::command]
fn config_import_from_path_cmd(app: AppHandle, state: State<'_, AppState>, path: String, mode: String) -> Result<(), String> {
    let json = std::fs::read_to_string(path).map_err(|e| e.to_string())?;
    let imported: ExportConfig = serde_json::from_str(&json).map_err(|e| e.to_string())?;
    apply_import(&app, &state, imported, &mode).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct PtyStartResult {
    pty_id: Uuid,
}

#[tauri::command]
fn pty_start_ssh(app: AppHandle, state: State<'_, AppState>, session_id: Uuid, cols: u16, rows: u16, start_dir: Option<String>) -> Result<PtyStartResult, String> {
    if debug_enabled() {
        eprintln!("[zssh] pty_start_ssh session_id={session_id} cols={cols} rows={rows}");
    }
    let s = state.get_session(session_id).ok_or_else(|| "Session not found".to_string())?;
    if !matches!(s.protocol, config::Protocol::Ssh) {
        return Err("Only SSH is supported in MVP".to_string());
    }
    if debug_enabled() {
        eprintln!(
            "[zssh] pty_start_ssh target={}@{}:{} auth={}",
            s.username,
            s.host,
            s.port,
            match &s.auth {
                config::Auth::Password { .. } => "password",
                config::Auth::Key { .. } => "key",
            }
        );
    }

    let password = match &s.auth {
        config::Auth::Password { password_dpapi } => password_dpapi.as_ref().and_then(|v| match unprotect_string(v) {
            Ok(x) => Some(x),
            Err(e) => {
                if debug_enabled() {
                    eprintln!("[zssh] pty_start_ssh unprotect password failed: {e}");
                }
                None
            }
        }),
        _ => None,
    };

    let passphrase = match &s.auth {
        config::Auth::Key { passphrase_dpapi, .. } => passphrase_dpapi.as_ref().and_then(|v| match unprotect_string(v) {
            Ok(x) => Some(x),
            Err(e) => {
                if debug_enabled() {
                    eprintln!("[zssh] pty_start_ssh unprotect passphrase failed: {e}");
                }
                None
            }
        }),
        _ => None,
    };

    let cmd = build_ssh_command(&app, &s, start_dir.as_deref()).map_err(|e| e.to_string())?;
    let pty = spawn_pty(
        app.clone(),
        PtyKind::Ssh,
        cmd,
        cols,
        rows,
        s.appearance.encoding.clone(),
        password,
        passphrase,
    )
    .map_err(|e| e.to_string())?;

    state.ptys.lock().unwrap().insert(pty.id, pty.clone());
    state.session_to_ssh_pty.lock().unwrap().insert(session_id, pty.id);
    if debug_enabled() {
        eprintln!("[zssh] pty_start_ssh ok pty_id={}", pty.id);
    }
    Ok(PtyStartResult { pty_id: pty.id })
}

#[tauri::command]
fn pty_start_sftp(app: AppHandle, state: State<'_, AppState>, session_id: Uuid, cols: u16, rows: u16, start_dir: Option<String>) -> Result<PtyStartResult, String> {
    if debug_enabled() {
        eprintln!("[zssh] pty_start_sftp session_id={session_id} cols={cols} rows={rows}");
    }
    let s = state.get_session(session_id).ok_or_else(|| "Session not found".to_string())?;
    if !matches!(s.protocol, config::Protocol::Ssh) {
        return Err("Only SSH is supported in MVP".to_string());
    }
    if debug_enabled() {
        eprintln!(
            "[zssh] pty_start_sftp target={}@{}:{} auth={}",
            s.username,
            s.host,
            s.port,
            match &s.auth {
                config::Auth::Password { .. } => "password",
                config::Auth::Key { .. } => "key",
            }
        );
    }

    let password = match &s.auth {
        config::Auth::Password { password_dpapi } => password_dpapi.as_ref().and_then(|v| match unprotect_string(v) {
            Ok(x) => Some(x),
            Err(e) => {
                if debug_enabled() {
                    eprintln!("[zssh] pty_start_sftp unprotect password failed: {e}");
                }
                None
            }
        }),
        _ => None,
    };

    let passphrase = match &s.auth {
        config::Auth::Key { passphrase_dpapi, .. } => passphrase_dpapi.as_ref().and_then(|v| match unprotect_string(v) {
            Ok(x) => Some(x),
            Err(e) => {
                if debug_enabled() {
                    eprintln!("[zssh] pty_start_sftp unprotect passphrase failed: {e}");
                }
                None
            }
        }),
        _ => None,
    };

    let cmd = build_sftp_command(&app, &s, start_dir.as_deref()).map_err(|e| e.to_string())?;
    let pty = spawn_pty(
        app.clone(),
        PtyKind::Sftp,
        cmd,
        cols,
        rows,
        s.appearance.encoding.clone(),
        password,
        passphrase,
    )
    .map_err(|e| e.to_string())?;

    state.ptys.lock().unwrap().insert(pty.id, pty.clone());
    state.session_to_sftp_pty.lock().unwrap().insert(session_id, pty.id);
    if debug_enabled() {
        eprintln!("[zssh] pty_start_sftp ok pty_id={}", pty.id);
    }
    Ok(PtyStartResult { pty_id: pty.id })
}

#[tauri::command]
fn pty_start_ssh_inline(app: AppHandle, state: State<'_, AppState>, session: UpsertSessionInput, cols: u16, rows: u16, start_dir: Option<String>) -> Result<PtyStartResult, String> {
    let s = session_from_input(&session);
    if !matches!(s.protocol, config::Protocol::Ssh) {
        return Err("Only SSH is supported in MVP".to_string());
    }
    let (password, passphrase) = match &session.auth {
        UpsertAuthInput::Password { password } => (password.clone(), None),
        UpsertAuthInput::Key { passphrase, .. } => (None, passphrase.clone()),
    };
    let cmd = build_ssh_command(&app, &s, start_dir.as_deref()).map_err(|e| e.to_string())?;
    let pty = spawn_pty(
        app.clone(),
        PtyKind::Ssh,
        cmd,
        cols,
        rows,
        s.appearance.encoding.clone(),
        password,
        passphrase,
    )
    .map_err(|e| e.to_string())?;
    state.ptys.lock().unwrap().insert(pty.id, pty.clone());
    Ok(PtyStartResult { pty_id: pty.id })
}

#[tauri::command]
fn pty_start_sftp_inline(app: AppHandle, state: State<'_, AppState>, session: UpsertSessionInput, cols: u16, rows: u16, start_dir: Option<String>) -> Result<PtyStartResult, String> {
    let s = session_from_input(&session);
    if !matches!(s.protocol, config::Protocol::Ssh) {
        return Err("Only SSH is supported in MVP".to_string());
    }
    let (password, passphrase) = match &session.auth {
        UpsertAuthInput::Password { password } => (password.clone(), None),
        UpsertAuthInput::Key { passphrase, .. } => (None, passphrase.clone()),
    };
    let cmd = build_sftp_command(&app, &s, start_dir.as_deref()).map_err(|e| e.to_string())?;
    let pty = spawn_pty(
        app.clone(),
        PtyKind::Sftp,
        cmd,
        cols,
        rows,
        s.appearance.encoding.clone(),
        password,
        passphrase,
    )
    .map_err(|e| e.to_string())?;
    state.ptys.lock().unwrap().insert(pty.id, pty.clone());
    Ok(PtyStartResult { pty_id: pty.id })
}

#[tauri::command]
fn pty_send(state: State<'_, AppState>, pty_id: Uuid, data: String) -> Result<(), String> {
    if debug_enabled() {
        eprintln!("[zssh] pty_send pty_id={pty_id} len={}", data.len());
    }
    let ptys = state.ptys.lock().unwrap();
    let pty = ptys.get(&pty_id).ok_or_else(|| "PTY not found".to_string())?;
    pty_write(pty, data.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
fn pty_resize_cmd(state: State<'_, AppState>, pty_id: Uuid, cols: u16, rows: u16) -> Result<(), String> {
    if debug_enabled() {
        eprintln!("[zssh] pty_resize pty_id={pty_id} cols={cols} rows={rows}");
    }
    let ptys = state.ptys.lock().unwrap();
    let pty = ptys.get(&pty_id).ok_or_else(|| "PTY not found".to_string())?;
    pty_resize(pty, cols, rows).map_err(|e| e.to_string())
}

#[tauri::command]
fn pty_kill_cmd(state: State<'_, AppState>, pty_id: Uuid) -> Result<(), String> {
    if debug_enabled() {
        eprintln!("[zssh] pty_kill pty_id={pty_id}");
    }
    let mut ptys = state.ptys.lock().unwrap();
    if let Some(pty) = ptys.remove(&pty_id) {
        return pty_kill(&pty).map_err(|e| e.to_string());
    }
    Ok(())
}

#[tauri::command]
fn pty_respond_hostkey(state: State<'_, AppState>, pty_id: Uuid, accept: bool) -> Result<(), String> {
    if debug_enabled() {
        eprintln!("[zssh] pty_respond_hostkey pty_id={pty_id} accept={accept}");
    }
    let ptys = state.ptys.lock().unwrap();
    let pty = ptys.get(&pty_id).ok_or_else(|| "PTY not found".to_string())?;
    let s = if accept { "yes\n" } else { "no\n" };
    pty_write(pty, s.as_bytes()).map_err(|e| e.to_string())
}

#[tauri::command]
fn pty_provide_auth(state: State<'_, AppState>, pty_id: Uuid, value: String) -> Result<(), String> {
    if debug_enabled() {
        eprintln!("[zssh] pty_provide_auth pty_id={pty_id} len={}", value.len());
    }
    let ptys = state.ptys.lock().unwrap();
    let pty = ptys.get(&pty_id).ok_or_else(|| "PTY not found".to_string())?;
    let r = pty_write(pty, format!("{value}\n").as_bytes()).map_err(|e| e.to_string());
    crate::pty::pty_clear_prompt_state(pty);
    r
}

fn require_sftp<'a>(state: &'a AppState, pty_id: Uuid) -> Result<crate::pty::PtySession> {
    let ptys = state.ptys.lock().unwrap();
    let pty = ptys.get(&pty_id).ok_or_else(|| anyhow!("PTY not found"))?;
    if !matches!(pty.kind, PtyKind::Sftp) {
        return Err(anyhow!("PTY is not SFTP"));
    }
    Ok(pty.clone())
}

fn require_ssh<'a>(state: &'a AppState, pty_id: Uuid) -> Result<crate::pty::PtySession> {
    let ptys = state.ptys.lock().unwrap();
    let pty = ptys.get(&pty_id).ok_or_else(|| anyhow!("PTY not found"))?;
    if !matches!(pty.kind, PtyKind::Ssh) {
        return Err(anyhow!("PTY is not SSH"));
    }
    Ok(pty.clone())
}

#[tauri::command]
fn ssh_pwd_cmd(state: State<'_, AppState>, pty_id: Uuid) -> Result<String, String> {
    let pty = require_ssh(&state, pty_id).map_err(|e| e.to_string())?;
    ssh_pwd(&pty, Duration::from_secs(5)).map_err(|e| e.to_string())
}

#[tauri::command]
fn sftp_wait_ready_cmd(state: State<'_, AppState>, pty_id: Uuid, timeout_ms: Option<u64>) -> Result<(), String> {
    let pty = require_sftp(&state, pty_id).map_err(|e| e.to_string())?;
    let timeout = Duration::from_millis(timeout_ms.unwrap_or(30_000));
    let start = std::time::Instant::now();
    loop {
        let tail = {
            let ps = pty.prompt_state.lock().unwrap();
            ps.tail_text.clone()
        };
        let clean = strip_ansi_and_osc(&tail);
        if clean.contains("sftp> ") || clean.contains("sftp>") {
            return Ok(());
        }
        if start.elapsed() > timeout {
            return Err("SFTP not ready (timeout)".to_string());
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

#[tauri::command]
fn sftp_pwd_cmd(state: State<'_, AppState>, pty_id: Uuid) -> Result<String, String> {
    let pty = require_sftp(&state, pty_id).map_err(|e| e.to_string())?;
    sftp_pwd(&pty).map_err(|e| e.to_string())
}

#[tauri::command]
fn sftp_ls_cmd(state: State<'_, AppState>, pty_id: Uuid, path: Option<String>) -> Result<Vec<RemoteEntry>, String> {
    let pty = require_sftp(&state, pty_id).map_err(|e| e.to_string())?;
    sftp_ls(&pty, path.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
fn sftp_cd_cmd(state: State<'_, AppState>, pty_id: Uuid, path: String) -> Result<(), String> {
    let pty = require_sftp(&state, pty_id).map_err(|e| e.to_string())?;
    sftp_cd(&pty, &path).map_err(|e| e.to_string())
}

#[tauri::command]
fn sftp_mkdir_cmd(state: State<'_, AppState>, pty_id: Uuid, path: String) -> Result<(), String> {
    let pty = require_sftp(&state, pty_id).map_err(|e| e.to_string())?;
    sftp_mkdir(&pty, &path).map_err(|e| e.to_string())
}

#[tauri::command]
fn sftp_rm_cmd(state: State<'_, AppState>, pty_id: Uuid, path: String, recursive: bool) -> Result<(), String> {
    let pty = require_sftp(&state, pty_id).map_err(|e| e.to_string())?;
    sftp_rm(&pty, &path, recursive).map_err(|e| e.to_string())
}

#[tauri::command]
fn sftp_rename_cmd(state: State<'_, AppState>, pty_id: Uuid, from: String, to: String) -> Result<(), String> {
    let pty = require_sftp(&state, pty_id).map_err(|e| e.to_string())?;
    sftp_rename(&pty, &from, &to).map_err(|e| e.to_string())
}

#[tauri::command]
fn sftp_get_cmd(state: State<'_, AppState>, pty_id: Uuid, remote: String, local: String) -> Result<(), String> {
    let pty = require_sftp(&state, pty_id).map_err(|e| e.to_string())?;
    sftp_get(&pty, &remote, &local).map_err(|e| e.to_string())
}

#[tauri::command]
fn sftp_put_cmd(state: State<'_, AppState>, pty_id: Uuid, local: String, remote: String) -> Result<(), String> {
    let pty = require_sftp(&state, pty_id).map_err(|e| e.to_string())?;
    sftp_put(&pty, &local, &remote).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(debug_assertions)]
    {
        if std::env::var_os("WEBVIEW2_USER_DATA_FOLDER").is_none() {
            if let Ok(cwd) = std::env::current_dir() {
                let dir = cwd.join(".webview2");
                let _ = std::fs::create_dir_all(&dir);
                std::env::set_var("WEBVIEW2_USER_DATA_FOLDER", dir.as_os_str());
            }
        }
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            let cfg = load_config(app.handle()).map_err(|e| anyhow!(e))?;
            app.manage(AppState::new(cfg));

            let menu = MenuBuilder::new(app).build()?;
            app.set_menu(menu)?;

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            groups_list,
            group_upsert,
            group_delete,
            sessions_list,
            session_get,
            session_upsert,
            session_delete,
            settings_get,
            settings_set,
            config_export_cmd,
            config_export_to_path_cmd,
            config_import_from_path_cmd,
            pty_start_ssh,
            pty_start_ssh_inline,
            pty_start_sftp,
            pty_start_sftp_inline,
            pty_send,
            pty_resize_cmd,
            pty_kill_cmd,
            pty_respond_hostkey,
            pty_provide_auth,
            ssh_pwd_cmd,
            sftp_wait_ready_cmd,
            sftp_pwd_cmd,
            sftp_ls_cmd,
            sftp_cd_cmd,
            sftp_mkdir_cmd,
            sftp_rm_cmd,
            sftp_rename_cmd,
            sftp_get_cmd,
            sftp_put_cmd
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
