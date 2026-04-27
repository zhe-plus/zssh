use crate::pty::{pty_write, strip_ansi_and_osc, PtySession};
use anyhow::{anyhow, Result};
use serde::{Deserialize, Serialize};
use std::{thread, time::{Duration, Instant}};

fn debug_enabled() -> bool {
    cfg!(debug_assertions) && std::env::var_os("ZSSH_DEBUG").is_some()
}

fn is_sftp_ready(session: &PtySession) -> bool {
    let ps = session.prompt_state.lock().unwrap();
    let clean = strip_ansi_and_osc(&ps.tail_text);
    clean.to_ascii_lowercase().contains("sftp>")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteEntry {
    pub name: String,
    pub kind: String,
    pub size: Option<u64>,
    pub raw: String,
}

fn collect_since(session: &PtySession, start_seq: u64) -> String {
    let chunks = session.chunks.lock().unwrap();
    chunks
        .iter()
        .filter(|(id, _)| *id > start_seq)
        .map(|(_, s)| s.clone())
        .collect::<Vec<_>>()
        .join("")
}

pub fn sftp_exec(session: &PtySession, cmd: &str, timeout: Duration) -> Result<String> {
    let ready_start = Instant::now();
    loop {
        if is_sftp_ready(session) {
            break;
        }
        if ready_start.elapsed() > Duration::from_secs(30) {
            if debug_enabled() {
                let ps = session.prompt_state.lock().unwrap();
                let tail = strip_ansi_and_osc(&ps.tail_text);
                let tail = tail.chars().rev().take(240).collect::<String>().chars().rev().collect::<String>();
                eprintln!("[zssh] sftp_ready timeout tail={tail:?}");
            }
            return Err(anyhow!("SFTP prompt timeout (ready)"));
        }
        thread::sleep(Duration::from_millis(30));
    }

    let start_seq = session.seq.load(std::sync::atomic::Ordering::SeqCst);
    pty_write(session, format!("{cmd}\r\n").as_bytes())?;

    let start = Instant::now();
    loop {
        let out = collect_since(session, start_seq);
        let clean = strip_ansi_and_osc(&out);
        let lc = clean.to_ascii_lowercase();
        if let Some(idx) = lc.rfind("sftp> ") {
            return Ok(clean[..idx].to_string());
        }
        if let Some(idx) = lc.rfind("sftp>") {
            return Ok(clean[..idx].to_string());
        }
        if start.elapsed() > timeout {
            if debug_enabled() {
                let tail = clean.chars().rev().take(240).collect::<String>().chars().rev().collect::<String>();
                eprintln!("[zssh] sftp_exec timeout cmd={cmd:?} tail={tail:?}");
            }
            return Err(anyhow!("SFTP command timeout: {cmd}"));
        }
        thread::sleep(Duration::from_millis(30));
    }
}

pub fn sftp_pwd(session: &PtySession) -> Result<String> {
    let out = sftp_exec(session, "pwd", Duration::from_secs(15))?;
    let s = out.replace("\r\n", "\n");
    for line in s.lines() {
        let l = line.trim();
        if l.is_empty() {
            continue;
        }
        let lc = l.to_ascii_lowercase();
        if lc == "pwd" {
            continue;
        }
        if let Some(rest) = l.strip_prefix("Remote working directory:") {
            let p = rest.trim();
            if !p.is_empty() {
                return Ok(p.to_string());
            }
        }
    }
    let last = s
        .lines()
        .rev()
        .map(|l| l.trim())
        .find(|l| !l.is_empty() && l.to_ascii_lowercase() != "pwd");
    Ok(last.unwrap_or("").to_string())
}

pub fn sftp_cd(session: &PtySession, path: &str) -> Result<()> {
    let _ = sftp_exec(session, &format!("cd {path}"), Duration::from_secs(15))?;
    Ok(())
}

pub fn sftp_mkdir(session: &PtySession, path: &str) -> Result<()> {
    let _ = sftp_exec(session, &format!("mkdir {path}"), Duration::from_secs(10))?;
    Ok(())
}

pub fn sftp_rm(session: &PtySession, path: &str, recursive: bool) -> Result<()> {
    let cmd = if recursive {
        format!("rm -r {path}")
    } else {
        format!("rm {path}")
    };
    let _ = sftp_exec(session, &cmd, Duration::from_secs(30))?;
    Ok(())
}

pub fn sftp_rename(session: &PtySession, from: &str, to: &str) -> Result<()> {
    let _ = sftp_exec(session, &format!("rename {from} {to}"), Duration::from_secs(10))?;
    Ok(())
}

pub fn sftp_get(session: &PtySession, remote: &str, local: &str) -> Result<()> {
    let _ = sftp_exec(session, &format!("get {remote} {local}"), Duration::from_secs(600))?;
    Ok(())
}

pub fn sftp_get_partial(session: &PtySession, remote: &str, local: &str) -> Result<u64> {
    let offset = std::fs::metadata(local).map(|m| m.len()).unwrap_or(0);
    let cmd = if offset > 0 {
        format!("get -a {remote} {local}")
    } else {
        format!("get {remote} {local}")
    };
    let _ = sftp_exec(session, &cmd, Duration::from_secs(600))?;
    let final_size = std::fs::metadata(local).map(|m| m.len()).unwrap_or(0);
    Ok(final_size)
}

pub fn sftp_put(session: &PtySession, local: &str, remote: &str) -> Result<()> {
    let out = sftp_exec(session, &format!("put \"{local}\" \"{remote}\""), Duration::from_secs(600))?;
    
    // 调试输出
    if debug_enabled() {
        eprintln!("[zssh] sftp_put output: local={}, remote={}", local, remote);
        eprintln!("[zssh] sftp_put output: {:?}", out);
    }
    
    // 忽略无害的提示信息
    let harmless_patterns = ["uploading to", "转移到", "fetching", "100%", "kbps", "mbps", "stat remote"];
    
    // 更精确的错误检测：只在非无害行中查找错误
    for line in out.lines() {
        let line_lower = line.to_ascii_lowercase();
        
        // 跳过空行和提示行
        if line_lower.trim().is_empty() ||
           line_lower.contains("sftp>") ||
           line_lower.starts_with("put ") ||
           harmless_patterns.iter().any(|h| line_lower.contains(h)) {
            continue;
        }
        
        // 检查真正的错误关键词
        let error_keywords = [
            "permission denied",
            "failure",
            "couldn't open",
            "not a regular file",
            "remote read",
        ];
        
        for keyword in &error_keywords {
            if line_lower.contains(keyword) {
                return Err(anyhow!("SFTP put failed: {}", line.trim()));
            }
        }
        
        // 对 "no such file" 特殊处理：只在确认是错误时才失败
        if line_lower.contains("no such file") && !line_lower.contains("stat remote") {
            return Err(anyhow!("SFTP put failed: {}", line.trim()));
        }
    }
    
    Ok(())
}

pub fn sftp_put_partial(session: &PtySession, local: &str, remote: &str) -> Result<u64> {
    let offset = std::fs::metadata(local).map(|m| m.len()).unwrap_or(0);
    let cmd = if offset > 0 {
        format!("put -a \"{local}\" \"{remote}\"")
    } else {
        format!("put \"{local}\" \"{remote}\"")
    };
    let out = sftp_exec(session, &cmd, Duration::from_secs(600))?;
    
    // 调试输出
    if debug_enabled() {
        eprintln!("[zssh] sftp_put_partial output: {:?}", out);
    }
    
    // 忽略无害的提示信息
    let harmless_patterns = ["uploading to", "转移到", "fetching", "100%", "kbps", "mbps", "stat remote"];
    
    // 检查真正的错误
    for line in out.lines() {
        let line_lower = line.to_ascii_lowercase();
        
        // 跳过空行和提示行
        if line_lower.trim().is_empty() ||
           line_lower.contains("sftp>") ||
           line_lower.starts_with("put ") ||
           harmless_patterns.iter().any(|h| line_lower.contains(h)) {
            continue;
        }
        
        // 检查真正的错误关键词
        let error_keywords = [
            "permission denied",
            "failure",
            "couldn't open",
            "not a regular file",
            "remote read",
        ];
        
        for keyword in &error_keywords {
            if line_lower.contains(keyword) {
                return Err(anyhow!("SFTP put partial failed: {}", line.trim()));
            }
        }
        
        // 对 "no such file" 特殊处理
        if line_lower.contains("no such file") && !line_lower.contains("stat remote") {
            return Err(anyhow!("SFTP put partial failed: {}", line.trim()));
        }
    }
    
    Ok(offset)
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalFileInfo {
    pub exists: bool,
    pub size: u64,
}

pub fn local_file_info(path: &str) -> LocalFileInfo {
    match std::fs::metadata(path) {
        Ok(m) => LocalFileInfo { exists: true, size: m.len() },
        Err(_) => LocalFileInfo { exists: false, size: 0 },
    }
}

pub fn sftp_ls(session: &PtySession, path: Option<&str>) -> Result<Vec<RemoteEntry>> {
    let cmd = match path {
        Some(p) => format!("ls -la {p}"),
        None => "ls -la".to_string(),
    };
    let out = sftp_exec(session, &cmd, Duration::from_secs(20))?;
    let mut entries = vec![];
    for line in out.replace("\r\n", "\n").split('\n') {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }
        if line.starts_with("sftp>") {
            continue;
        }
        if line.starts_with("ls ") {
            continue;
        }
        let mut kind = "unknown".to_string();
        if line.starts_with('d') {
            kind = "dir".to_string();
        } else if line.starts_with('-') {
            kind = "file".to_string();
        } else if line.starts_with('l') {
            kind = "link".to_string();
        }
        let parts: Vec<&str> = line.split_whitespace().collect();
        if parts.len() >= 9 {
            let size = parts.get(4).and_then(|v| v.parse::<u64>().ok());
            let name = parts[8..].join(" ");
            entries.push(RemoteEntry {
                name,
                kind,
                size,
                raw: line.to_string(),
            });
        } else {
            entries.push(RemoteEntry {
                name: line.to_string(),
                kind,
                size: None,
                raw: line.to_string(),
            });
        }
    }
    Ok(entries)
}
