use crate::pty::{pty_write, strip_ansi_and_osc, PtySession};
use anyhow::{anyhow, Result};
use std::{
    thread,
    time::{Duration, Instant},
};

fn debug_enabled() -> bool {
    cfg!(debug_assertions) && std::env::var_os("ZSSH_DEBUG").is_some()
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

pub fn ssh_pwd(session: &PtySession, timeout: Duration) -> Result<String> {
    let marker = "__ZSSH_CWD__";
    let cmd = "printf '%s\\n' \"__ZSSH_CWD__${PWD:-$(pwd)}\"";

    let start_seq = session.seq.load(std::sync::atomic::Ordering::SeqCst);
    pty_write(session, format!("{cmd}\r\n").as_bytes())?;

    let start = Instant::now();
    loop {
        let out = collect_since(session, start_seq);
        let clean = strip_ansi_and_osc(&out).replace("\r\n", "\n");
        for line in clean.lines() {
            let l = line.trim();
            if !l.starts_with(marker) {
                continue;
            }
            let v = l[marker.len()..].trim();
                if !v.is_empty() {
                    return Ok(v.to_string());
                }
        }
        if start.elapsed() > timeout {
            if debug_enabled() {
                let tail = clean
                    .chars()
                    .rev()
                    .take(240)
                    .collect::<String>()
                    .chars()
                    .rev()
                    .collect::<String>();
                eprintln!("[zssh] ssh_pwd timeout tail={tail:?}");
            }
            return Err(anyhow!("SSH cwd timeout"));
        }
        thread::sleep(Duration::from_millis(30));
    }
}
