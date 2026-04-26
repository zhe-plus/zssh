use crate::config::AppConfig;
use anyhow::{anyhow, Result};
use std::io::ErrorKind;
use std::path::{Path, PathBuf};
use tauri::Manager;

pub fn app_data_dir(app: &tauri::AppHandle) -> Result<PathBuf> {
    let primary = app
        .path()
        .app_data_dir()
        .map_err(|e| anyhow!(e))?;
    match std::fs::create_dir_all(&primary) {
        Ok(_) => return Ok(primary),
        Err(e) if e.kind() == ErrorKind::PermissionDenied => {}
        Err(e) => return Err(e.into()),
    }

    let secondary = app
        .path()
        .app_local_data_dir()
        .map_err(|e| anyhow!(e))?;
    match std::fs::create_dir_all(&secondary) {
        Ok(_) => return Ok(secondary),
        Err(e) if e.kind() == ErrorKind::PermissionDenied => {}
        Err(e) => return Err(e.into()),
    }

    let fallback = std::env::current_dir()?.join(".zssh-data");
    std::fs::create_dir_all(&fallback)?;
    Ok(fallback)
}

pub fn config_path(app: &tauri::AppHandle) -> Result<PathBuf> {
    Ok(app_data_dir(app)?.join("config.json"))
}

pub fn known_hosts_path(app: &tauri::AppHandle) -> Result<PathBuf> {
    Ok(app_data_dir(app)?.join("known_hosts"))
}

pub fn load_config(app: &tauri::AppHandle) -> Result<AppConfig> {
    let path = config_path(app)?;
    if !path.exists() {
        let cfg = AppConfig::default();
        save_config_to_path(&cfg, &path)?;
        return Ok(cfg);
    }
    let bytes = std::fs::read(&path)?;
    let cfg: AppConfig = serde_json::from_slice(&bytes)?;
    Ok(cfg)
}

pub fn save_config(app: &tauri::AppHandle, cfg: &AppConfig) -> Result<()> {
    let path = config_path(app)?;
    save_config_to_path(cfg, &path)
}

fn save_config_to_path(cfg: &AppConfig, path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let bytes = serde_json::to_vec_pretty(cfg)?;
    std::fs::write(path, bytes)?;
    Ok(())
}
