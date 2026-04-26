mod config;
mod dpapi;
mod log;
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
    sftp::{sftp_cd, sftp_get, sftp_get_partial, local_file_info as sftp_local_file_info_fn, sftp_ls, sftp_mkdir, sftp_pwd, sftp_put, sftp_put_partial, sftp_rename, sftp_rm, LocalFileInfo, RemoteEntry},
    ssh::ssh_pwd,
    state::AppState,
    store::{known_hosts_path, load_config, save_config},
};
use anyhow::{anyhow, Result};
use portable_pty::CommandBuilder;
use std::time::Duration;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::menu::{MenuBuilder, SubmenuBuilder};
use tauri::{AppHandle, Manager, State};
use uuid::Uuid;

pub use crate::pty::strip_ansi_and_osc;

// Legacy helper for backward compatibility during migration
fn debug_enabled() -> bool {
    crate::log::get_level() <= crate::log::Level::Debug
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

/// Execute a command silently via SSH (no PTY) for monitoring purposes
/// The command output is captured and returned, without displaying in terminal
#[tauri::command]
fn monitor_exec(state: State<'_, AppState>, session_id: Uuid, command: String) -> Result<String, String> {
    use std::process::Command;

    // Get the session info
    let s = state.get_session(session_id).ok_or_else(|| "Session not found".to_string())?;
    
    let host = s.host.clone();
    let port = s.port;
    let username = s.username.clone();
    
    let password = match &s.auth {
        config::Auth::Password { password_dpapi } => {
            password_dpapi.as_ref().and_then(|v| unprotect_string(v).ok())
        }
        _ => None,
    };
    
    let private_key_path = match &s.auth {
        config::Auth::Key { private_key_path, .. } => Some(private_key_path.clone()),
        _ => None,
    };

    // Check if running on Windows
    #[cfg(target_os = "windows")]
    let is_windows = true;
    #[cfg(not(target_os = "windows"))]
    let is_windows = false;

    // For password auth on Windows, we need to use a different approach
    // Windows SSH doesn't support inline passwords like sshpass
    // So we require key-based auth on Windows
    if password.is_some() && is_windows {
        return Err("Password authentication for monitoring requires SSH keys on Windows. Please configure your session to use key authentication, or run this app on Linux/macOS.".to_string());
    }

    // Build SSH command for silent execution (no PTY allocation)
    let mut ssh_cmd: Command;
    
    // Use sshpass for password authentication (Unix/Linux only), otherwise use ssh directly
    if let Some(ref pwd) = password {
        if is_windows {
            // This should not happen due to check above, but for safety
            return Err("Password auth not supported on Windows for monitoring".to_string());
        }
        ssh_cmd = Command::new("sshpass");
        ssh_cmd.arg("-p").arg(pwd);
        ssh_cmd.arg("ssh");
    } else {
        ssh_cmd = Command::new("ssh");
    }
    
    ssh_cmd.arg("-p").arg(port.to_string());
    ssh_cmd.arg("-T"); // Disable pseudo-terminal allocation
    ssh_cmd.arg("-o").arg("StrictHostKeyChecking=no");
    ssh_cmd.arg("-o").arg("ConnectTimeout=5");
    ssh_cmd.arg("-o").arg("LogLevel=ERROR"); // Reduce verbosity but still show errors
    
    #[cfg(target_os = "windows")]
    {
        // Windows SSH uses a different path for known hosts
        let known_hosts = std::env::var("USERPROFILE")
            .map(|p| format!("{}\\AppData\\Roaming\\ssh\\known_hosts", p))
            .unwrap_or_else(|_| "~/.ssh/known_hosts".to_string());
        ssh_cmd.arg("-o").arg(format!("UserKnownHostsFile={}", known_hosts));
    }
    
    #[cfg(not(target_os = "windows"))]
    {
        ssh_cmd.arg("-o").arg("UserKnownHostsFile=/dev/null"); // Ignore host key for monitoring
    }
    
    // Use key authentication if available
    if let Some(ref key_path) = private_key_path {
        ssh_cmd.arg("-i").arg(key_path);
        ssh_cmd.arg("-o").arg("IdentitiesOnly=yes");
    }
    
    ssh_cmd.arg(format!("{}@{}", username, host));
    ssh_cmd.arg(command);
    
    // Capture stdout and stderr
    ssh_cmd.stdout(std::process::Stdio::piped());
    ssh_cmd.stderr(std::process::Stdio::piped());

    let output = ssh_cmd.output().map_err(|e| {
        if is_windows {
            "Failed to execute SSH command. Please ensure OpenSSH is installed and your session uses key authentication.".to_string()
        } else {
            format!("Failed to execute SSH: {}. Make sure sshpass is installed for password authentication.", e)
        }
    })?;
    
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    
    // Log errors for debugging (only in debug builds)
    if debug_enabled() && !stderr.is_empty() {
        eprintln!("[zssh] monitor_exec stderr: {}", stderr);
    }
    
    // Return stdout, or stderr if stdout is empty
    let result = if stdout.is_empty() { stderr } else { stdout };
    
    Ok(result)
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
fn sftp_get_partial_cmd(state: State<'_, AppState>, pty_id: Uuid, remote: String, local: String) -> Result<u64, String> {
    let pty = require_sftp(&state, pty_id).map_err(|e| e.to_string())?;
    sftp_get_partial(&pty, &remote, &local).map_err(|e| e.to_string())
}

#[tauri::command]
fn sftp_put_cmd(state: State<'_, AppState>, pty_id: Uuid, local: String, remote: String) -> Result<(), String> {
    let pty = require_sftp(&state, pty_id).map_err(|e| e.to_string())?;
    sftp_put(&pty, &local, &remote).map_err(|e| e.to_string())
}

#[tauri::command]
fn sftp_put_partial_cmd(state: State<'_, AppState>, pty_id: Uuid, local: String, remote: String) -> Result<u64, String> {
    let pty = require_sftp(&state, pty_id).map_err(|e| e.to_string())?
;
    sftp_put_partial(&pty, &local, &remote).map_err(|e| e.to_string())
}

#[tauri::command]
fn sftp_local_file_info_cmd(path: String) -> LocalFileInfo {
    sftp_local_file_info_fn(&path)
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnoseInfo {
    pub app_version: String,
    pub os: String,
    pub arch: String,
    pub tauri_version: String,
    pub rust_version: String,
    pub config_summary: DiagnoseConfigSummary,
    pub collected_at: String,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DiagnoseConfigSummary {
    pub theme: String,
    pub language: String,
    pub session_count: usize,
    pub group_count: usize,
    pub has_passwords_saved: bool,
}

#[tauri::command]
fn diagnose_export_cmd(state: State<'_, AppState>) -> Result<DiagnoseInfo, String> {
    let cfg = state.config.read().map_err(|e| e.to_string())?;
    Ok(DiagnoseInfo {
        app_version: env!("CARGO_PKG_VERSION").to_string(),
        os: std::env::consts::OS.to_string(),
        arch: std::env::consts::ARCH.to_string(),
        tauri_version: option_env!("TAURI_ENV_VERSION").unwrap_or("unknown").to_string(),
        rust_version: option_env!("RUSTC_VERSION").unwrap_or("unknown").to_string(),
        config_summary: DiagnoseConfigSummary {
            theme: cfg.settings.theme.clone(),
            language: (&cfg.settings as &dyn std::any::Any)
                .downcast_ref::<serde_json::Value>()
                .and_then(|v| v.get("language").and_then(|l| l.as_str()).map(String::from))
                .unwrap_or_else(|| "zh-CN".to_string()),
            session_count: cfg.sessions.len(),
            group_count: cfg.groups.len(),
            has_passwords_saved: cfg.sessions.iter().any(|s| matches!(s.auth, Auth::Password { password_dpapi: Some(..) })),
        },
        collected_at: chrono_lite()?,
    })
}

fn chrono_lite() -> Result<String, String> {
    // Simple timestamp without depending on chrono crate
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now().duration_since(UNIX_EPOCH).map_err(|e| e.to_string())?;
    Ok(format!("{}", duration.as_secs()))
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
            // Initialize logging system (reads ZSSH_LOG env var)
            crate::log::init();
            crate::info!("app_start version={}", env!("CARGO_PKG_VERSION"));

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
            monitor_exec,
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
            sftp_get_partial_cmd,
            sftp_put_cmd,
            sftp_put_partial_cmd,
            sftp_local_file_info_cmd,
            diagnose_export_cmd,
            crate::log::log_get_level_cmd,
            crate::log::log_set_level_cmd,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
