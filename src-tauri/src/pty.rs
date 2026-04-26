use anyhow::{anyhow, Result};
use encoding_rs::{Encoding, GB18030, UTF_8};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::{
    collections::VecDeque,
    io::{Read, Write},
    sync::{
        atomic::{AtomicU64, Ordering},
        Arc, Mutex,
    },
    thread,
    time::Duration,
};
use tauri::Emitter;
use uuid::Uuid;

fn debug_enabled() -> bool {
    cfg!(debug_assertions) && std::env::var_os("ZSSH_DEBUG").is_some()
}

#[derive(Debug, Clone, Copy)]
pub enum PtyKind {
    Ssh,
    Sftp,
}

#[derive(Clone)]
pub struct PtySession {
    pub id: Uuid,
    pub kind: PtyKind,
    pub master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    pub writer: Arc<Mutex<Box<dyn Write + Send>>>,
    pub child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
    pub seq: Arc<AtomicU64>,
    pub chunks: Arc<Mutex<VecDeque<(u64, String)>>>,
    pub prompt_state: Arc<Mutex<PromptState>>,
}

#[derive(Debug, Default, Clone)]
pub struct PromptState {
    pub last_lines: VecDeque<String>,
    pub tail_text: String,
    pub pending_auth_kind: Option<u8>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyOutputEvent {
    pub pty_id: Uuid,
    pub data: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PtyExitEvent {
    pub pty_id: Uuid,
    pub exit_code: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HostKeyPromptEvent {
    pub pty_id: Uuid,
    pub message: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuthPromptEvent {
    pub pty_id: Uuid,
    pub kind: String,
}

fn encoding_from_name(name: &str) -> &'static Encoding {
    match name.to_ascii_lowercase().as_str() {
        "gb18030" => GB18030,
        "gbk" => GB18030,
        _ => UTF_8,
    }
}

fn last_non_empty_line(s: &str) -> Option<&str> {
    s.lines()
        .rev()
        .find(|l| !l.trim().is_empty())
        .map(|l| l.trim())
}

fn is_password_prompt(s: &str) -> bool {
    let Some(line) = last_non_empty_line(s) else {
        return false;
    };
    line.to_ascii_lowercase().ends_with("password:")
}

fn is_key_passphrase_prompt(s: &str) -> bool {
    let Some(line) = last_non_empty_line(s) else {
        return false;
    };
    let lc = line.to_ascii_lowercase();
    lc.contains("enter passphrase for key") && lc.ends_with(':')
}

pub fn strip_ansi_and_osc(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0usize;
    while i < bytes.len() {
        if bytes[i] != 0x1B {
            out.push(bytes[i]);
            i += 1;
            continue;
        }
        i += 1;
        if i >= bytes.len() {
            break;
        }
        match bytes[i] {
            b'[' => {
                i += 1;
                while i < bytes.len() {
                    let b = bytes[i];
                    i += 1;
                    if (0x40..=0x7E).contains(&b) {
                        break;
                    }
                }
            }
            b']' => {
                i += 1;
                while i < bytes.len() {
                    if bytes[i] == 0x07 {
                        i += 1;
                        break;
                    }
                    if bytes[i] == 0x1B && i + 1 < bytes.len() && bytes[i + 1] == b'\\' {
                        i += 2;
                        break;
                    }
                    i += 1;
                }
            }
            _ => {
                i += 1;
            }
        }
    }
    String::from_utf8_lossy(&out).to_string()
}

fn update_tail_text(ps: &mut PromptState, s: &str) {
    if s.is_empty() {
        return;
    }
    ps.tail_text.push_str(s);
    if ps.tail_text.len() > 2048 {
        let keep_bytes = 2048usize;
        let target = ps.tail_text.len().saturating_sub(keep_bytes);
        let mut start = 0usize;
        for (i, _) in ps.tail_text.char_indices() {
            if i >= target {
                start = i;
                break;
            }
        }
        ps.tail_text = ps.tail_text[start..].to_string();
    }
}

fn tail_last_non_empty_line(tail: &str) -> Option<&str> {
    tail.lines()
        .rev()
        .find(|l| !l.trim().is_empty())
        .map(|l| l.trim_end())
}

fn is_password_prompt_from_tail(tail: &str) -> bool {
    let Some(line) = tail_last_non_empty_line(tail) else {
        return false;
    };
    let clean = strip_ansi_and_osc(line);
    let lc = clean.trim_end().to_ascii_lowercase();
    lc.ends_with("password:")
}

fn is_key_passphrase_prompt_from_tail(tail: &str) -> bool {
    let Some(line) = tail_last_non_empty_line(tail) else {
        return false;
    };
    let clean = strip_ansi_and_osc(line);
    let lc = clean.trim_end().to_ascii_lowercase();
    lc.contains("enter passphrase for key") && lc.ends_with(':')
}

pub fn pty_clear_prompt_state(session: &PtySession) {
    let mut ps = session.prompt_state.lock().unwrap();
    ps.pending_auth_kind = None;
    ps.tail_text.clear();
}

pub fn spawn_pty(
    app: tauri::AppHandle,
    kind: PtyKind,
    cmd: CommandBuilder,
    cols: u16,
    rows: u16,
    encoding_name: String,
    password_to_auto_send: Option<String>,
    key_passphrase_to_auto_send: Option<String>,
) -> Result<PtySession> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    })?;

    if debug_enabled() {
        eprintln!("[zssh] spawn_pty kind={:?} cols={cols} rows={rows}", kind);
    }
    let child = pair.slave.spawn_command(cmd)?;
    let mut reader = pair.master.try_clone_reader()?;
    let writer = pair.master.take_writer()?;
    let master: Box<dyn MasterPty + Send> = pair.master;

    let id = Uuid::new_v4();
    let master = Arc::new(Mutex::new(master));
    let writer = Arc::new(Mutex::new(writer));
    let child = Arc::new(Mutex::new(child));
    let seq = Arc::new(AtomicU64::new(0));
    let chunks = Arc::new(Mutex::new(VecDeque::with_capacity(500)));
    let prompt_state = Arc::new(Mutex::new(PromptState::default()));

    let writer_clone = writer.clone();
    let child_clone = child.clone();
    let seq_clone = seq.clone();
    let chunks_clone = chunks.clone();
    let prompt_state_clone = prompt_state.clone();
    let encoding = encoding_from_name(&encoding_name);

    thread::spawn(move || {
        let mut buf = [0u8; 4096];
        let mut auto_pwd = password_to_auto_send;
        let mut auto_pp = key_passphrase_to_auto_send;
        loop {
            match reader.read(&mut buf) {
                Ok(0) => break,
                Ok(n) => {
                    let bytes = &buf[..n];
                    let (text, _, _) = encoding.decode(bytes);
                    let s = text.to_string();
                    let chunk_id = seq_clone.fetch_add(1, Ordering::SeqCst) + 1;
                    {
                        let mut chunks = chunks_clone.lock().unwrap();
                        chunks.push_back((chunk_id, s.clone()));
                        while chunks.len() > 500 {
                            chunks.pop_front();
                        }
                    }

                    {
                        let mut ps = prompt_state_clone.lock().unwrap();
                        for line in s.replace("\r\n", "\n").split('\n') {
                            if line.is_empty() {
                                continue;
                            }
                            ps.last_lines.push_back(line.to_string());
                            while ps.last_lines.len() > 20 {
                                ps.last_lines.pop_front();
                            }
                        }
                        update_tail_text(&mut ps, &s);
                    }

                    let _ = app.emit("zssh://pty-output", PtyOutputEvent { pty_id: id, data: s.clone() });

                    let (hostkey, hostkey_msg, want_pwd, want_pp) = {
                        let mut ps = prompt_state_clone.lock().unwrap();
                        let tail_snapshot = ps.tail_text.clone();

                        let pwd_prompt = is_password_prompt_from_tail(&tail_snapshot) || is_password_prompt(&s);
                        let pp_prompt = is_key_passphrase_prompt_from_tail(&tail_snapshot) || is_key_passphrase_prompt(&s);

                        if ps.pending_auth_kind == Some(1) && !pwd_prompt {
                            ps.pending_auth_kind = None;
                        }
                        if ps.pending_auth_kind == Some(2) && !pp_prompt {
                            ps.pending_auth_kind = None;
                        }

                        let hostkey = tail_snapshot.contains("Are you sure you want to continue connecting");
                        let hostkey_msg = if hostkey {
                            ps.last_lines.iter().cloned().collect::<Vec<_>>().join("\n")
                        } else {
                            String::new()
                        };

                        let want_pwd = pwd_prompt && ps.pending_auth_kind != Some(1);
                        let want_pp = pp_prompt && ps.pending_auth_kind != Some(2);
                        if want_pwd {
                            ps.pending_auth_kind = Some(1);
                        }
                        if want_pp {
                            ps.pending_auth_kind = Some(2);
                        }

                        (hostkey, hostkey_msg, want_pwd, want_pp)
                    };

                    if hostkey {
                        if debug_enabled() {
                            eprintln!("[zssh] hostkey_prompt pty_id={id}");
                        }
                        let _ = app.emit(
                            "zssh://hostkey-prompt",
                            HostKeyPromptEvent {
                                pty_id: id,
                                message: hostkey_msg,
                            },
                        );
                    }

                    if want_pwd {
                        if debug_enabled() {
                            eprintln!("[zssh] auth_prompt password pty_id={id} auto_send={}", auto_pwd.is_some());
                        }
                        if let Some(pwd) = auto_pwd.take() {
                            let mut w = writer_clone.lock().unwrap();
                            let _ = w.write_all(pwd.as_bytes());
                            let _ = w.write_all(b"\n");
                            let _ = w.flush();
                            let mut ps = prompt_state_clone.lock().unwrap();
                            ps.pending_auth_kind = None;
                            ps.tail_text.clear();
                        } else {
                            let _ = app.emit(
                                "zssh://auth-prompt",
                                AuthPromptEvent {
                                    pty_id: id,
                                    kind: "password".to_string(),
                                },
                            );
                        }
                    }

                    if want_pp {
                        if debug_enabled() {
                            eprintln!("[zssh] auth_prompt keyPassphrase pty_id={id} auto_send={}", auto_pp.is_some());
                        }
                        if let Some(pp) = auto_pp.take() {
                            let mut w = writer_clone.lock().unwrap();
                            let _ = w.write_all(pp.as_bytes());
                            let _ = w.write_all(b"\n");
                            let _ = w.flush();
                            let mut ps = prompt_state_clone.lock().unwrap();
                            ps.pending_auth_kind = None;
                            ps.tail_text.clear();
                        } else {
                            let _ = app.emit(
                                "zssh://auth-prompt",
                                AuthPromptEvent {
                                    pty_id: id,
                                    kind: "keyPassphrase".to_string(),
                                },
                            );
                        }
                    }
                }
                Err(_) => {
                    thread::sleep(Duration::from_millis(10));
                }
            }
        }

        let exit_code = child_clone.lock().unwrap().wait().ok().map(|s| s.exit_code() as i32);
        let _ = app.emit("zssh://pty-exit", PtyExitEvent { pty_id: id, exit_code });
    });

    Ok(PtySession {
        id,
        kind,
        master,
        writer,
        child,
        seq,
        chunks,
        prompt_state,
    })
}

pub fn pty_write(session: &PtySession, data: &[u8]) -> Result<()> {
    let mut w = session.writer.lock().unwrap();
    w.write_all(data)?;
    w.flush()?;
    Ok(())
}

pub fn pty_resize(session: &PtySession, cols: u16, rows: u16) -> Result<()> {
    let size = PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    };
    session.master.lock().unwrap().resize(size)?;
    Ok(())
}

pub fn pty_kill(session: &PtySession) -> Result<()> {
    session.child.lock().unwrap().kill().map_err(|e| anyhow!(e))?;
    Ok(())
}
