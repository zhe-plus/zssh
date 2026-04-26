use anyhow::{anyhow, Result};
use portable_pty::{native_pty_system, Child, CommandBuilder, MasterPty, PtySize};
use std::{
    io::{Read, Write},
    sync::{Arc, Mutex},
    time::{Duration, Instant},
};
use zssh_lib::strip_ansi_and_osc;

#[derive(Clone)]
struct PtyHarness {
    _master: Arc<Mutex<Box<dyn MasterPty + Send>>>,
    writer: Arc<Mutex<Box<dyn Write + Send>>>,
    child: Arc<Mutex<Box<dyn Child + Send + Sync>>>,
    buf: Arc<Mutex<Vec<u8>>>,
}

fn env(name: &str) -> Option<String> {
    std::env::var(name).ok().map(|v| v.trim().to_string()).filter(|v| !v.is_empty())
}

fn now_ts() -> String {
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs_f64();
    format!("{ts:.3}")
}

fn log(event: &str, data: &str) {
    println!("[zssh-func-test {}] {} {}", now_ts(), event, data);
    let _ = std::io::stdout().flush();
}

fn tail_str(s: &str, max: usize) -> String {
    if s.len() <= max {
        return s.replace('\r', "\\r").replace('\n', "\\n");
    }
    let mut start = s.len().saturating_sub(max);
    while !s.is_char_boundary(start) && start < s.len() {
        start += 1;
    }
    s[start..].replace('\r', "\\r").replace('\n', "\\n")
}

fn temp_known_hosts_path() -> std::path::PathBuf {
    let pid = std::process::id();
    std::env::temp_dir().join(format!("zssh_known_hosts_{pid}.txt"))
}

fn open_pty(cmd: CommandBuilder, cols: u16, rows: u16) -> Result<PtyHarness> {
    let pty_system = native_pty_system();
    let pair = pty_system.openpty(PtySize {
        rows,
        cols,
        pixel_width: 0,
        pixel_height: 0,
    })?;

    let child = pair.slave.spawn_command(cmd)?;
    let mut reader = pair.master.try_clone_reader()?;
    let writer = pair.master.take_writer()?;
    let master: Box<dyn MasterPty + Send> = pair.master;

    let buf = Arc::new(Mutex::new(Vec::<u8>::with_capacity(65536)));
    let buf_clone = buf.clone();
    std::thread::spawn(move || {
        let mut raw = [0u8; 4096];
        loop {
            match reader.read(&mut raw) {
                Ok(0) => break,
                Ok(n) => {
                    let mut b = buf_clone.lock().unwrap();
                    b.extend_from_slice(&raw[..n]);
                    if b.len() > 65536 {
                        let keep = 65536usize;
                        let start = b.len().saturating_sub(keep);
                        b.drain(0..start);
                    }
                }
                Err(_) => std::thread::sleep(Duration::from_millis(10)),
            }
        }
    });

    Ok(PtyHarness {
        _master: Arc::new(Mutex::new(master)),
        writer: Arc::new(Mutex::new(writer)),
        child: Arc::new(Mutex::new(child)),
        buf,
    })
}

fn write_line(pty: &PtyHarness, s: &str) -> Result<()> {
    let mut w = pty.writer.lock().unwrap();
    w.write_all(s.as_bytes())?;
    w.write_all(b"\n")?;
    w.flush()?;
    Ok(())
}

fn write_line_crlf(pty: &PtyHarness, s: &str) -> Result<()> {
    let mut w = pty.writer.lock().unwrap();
    w.write_all(s.as_bytes())?;
    w.write_all(b"\r\n")?;
    w.flush()?;
    Ok(())
}

fn read_clean(pty: &PtyHarness) -> String {
    let b = pty.buf.lock().unwrap().clone();
    let s = String::from_utf8_lossy(&b).to_string();
    strip_ansi_and_osc(&s)
}

fn read_delta_clean(pty: &PtyHarness, last_pos: &mut usize) -> String {
    let b = pty.buf.lock().unwrap();
    if *last_pos >= b.len() {
        return String::new();
    }
    let delta = &b[*last_pos..];
    *last_pos = b.len();
    let s = String::from_utf8_lossy(delta).to_string();
    strip_ansi_and_osc(&s)
}

fn buf_len(pty: &PtyHarness) -> usize {
    pty.buf.lock().unwrap().len()
}

fn wait_until<F: Fn(&str) -> bool>(pty: &PtyHarness, timeout: Duration, desc: &str, pred: F) -> Result<String> {
    let start = Instant::now();
    let mut last_pos = 0usize;
    let mut last_report = Instant::now();
    loop {
        let delta = read_delta_clean(pty, &mut last_pos);
        if !delta.trim().is_empty() {
            log("wait:out", &format!("{desc} delta_tail={:?}", tail_str(&delta, 240)));
        }
        let clean = read_clean(pty);
        if pred(&clean) {
            return Ok(clean);
        }
        if last_report.elapsed() > Duration::from_secs(2) {
            last_report = Instant::now();
            let tail = clean.chars().rev().take(240).collect::<String>().chars().rev().collect::<String>();
            log("wait", &format!("{desc} tail={tail:?}"));
        }
        if start.elapsed() > timeout {
            let tail = clean.chars().rev().take(800).collect::<String>().chars().rev().collect::<String>();
            return Err(anyhow!("timeout waiting for {desc}. tail={tail:?}"));
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

fn wait_sftp_cmd<F: Fn(&str) -> bool>(pty: &PtyHarness, last_pos: &mut usize, timeout: Duration, desc: &str, expect: F) -> Result<()> {
    let start = Instant::now();
    let mut last_report = Instant::now();
    let mut acc = String::new();
    loop {
        let delta = read_delta_clean(pty, last_pos);
        if !delta.is_empty() {
            acc.push_str(&delta);
            if !delta.trim().is_empty() {
                log("sftp:out", &format!("{desc} delta_tail={:?}", tail_str(&delta, 240)));
            }
        }

        let lc = acc.to_ascii_lowercase();
        if lc.contains("sftp>") {
            if !expect(&acc) {
                let tail = tail_str(&acc, 800);
                return Err(anyhow!("unexpected sftp output for {desc}. tail={tail:?}"));
            }
            return Ok(());
        }

        if last_report.elapsed() > Duration::from_secs(2) {
            last_report = Instant::now();
            log("sftp:wait", &format!("{desc} tail={:?}", tail_str(&acc, 240)));
        }

        if start.elapsed() > timeout {
            let tail = tail_str(&acc, 800);
            return Err(anyhow!("timeout waiting for {desc}. tail={tail:?}"));
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

fn handshake_password(
    pty: &PtyHarness,
    password: &str,
    timeout: Duration,
    allow_hostkey: bool,
    prompt_hint: &str,
) -> Result<()> {
    let start = Instant::now();
    let mut sent_pwd = false;
    let mut sent_yes = false;
    loop {
        let clean = read_clean(pty);
        let lc = clean.to_ascii_lowercase();
        if allow_hostkey && !sent_yes && lc.contains("are you sure you want to continue connecting") {
            log(prompt_hint, "hostkey -> yes");
            write_line(pty, "yes")?;
            sent_yes = true;
        }
        if !sent_pwd && lc.contains("password:") {
            log(prompt_hint, &format!("password -> send(len={})", password.len()));
            write_line(pty, password)?;
            sent_pwd = true;
        }
        if sent_pwd && (!allow_hostkey || sent_yes) {
            return Ok(());
        }
        if start.elapsed() > timeout {
            return Err(anyhow!("timeout during auth handshake ({prompt_hint})"));
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

fn wait_sftp_prompt_with_handshake(pty: &PtyHarness, password: &str, timeout: Duration) -> Result<()> {
    let start = Instant::now();
    let mut last_pos = 0usize;
    let mut sent_yes = false;
    let mut pwd_tries = 0u8;
    let mut last_report = Instant::now();
    loop {
        let delta = read_delta_clean(pty, &mut last_pos);
        let all = read_clean(pty);
        let lc_delta = delta.to_ascii_lowercase();
        let lc_all = all.to_ascii_lowercase();

        if !delta.trim().is_empty() {
            log("sftp:out", &format!("delta_tail={:?}", tail_str(&delta, 240)));
        }

        if lc_all.contains("sftp>") {
            return Ok(());
        }
        if !sent_yes && (lc_delta.contains("are you sure you want to continue connecting") || lc_all.contains("are you sure you want to continue connecting")) {
            log("sftp:handshake", "hostkey -> yes");
            write_line(pty, "yes")?;
            sent_yes = true;
        }
        if lc_delta.contains("password:") && pwd_tries < 3 {
            pwd_tries += 1;
            log("sftp:handshake", &format!("password -> send(try={pwd_tries}, len={})", password.len()));
            write_line_crlf(pty, password)?;
        }
        if lc_delta.contains("permission denied") || lc_all.contains("permission denied") {
            let tail = all.chars().rev().take(800).collect::<String>().chars().rev().collect::<String>();
            return Err(anyhow!("permission denied. tail={tail:?}"));
        }
        if lc_delta.contains("subsystem request failed") || lc_all.contains("subsystem request failed") {
            let tail = all.chars().rev().take(800).collect::<String>().chars().rev().collect::<String>();
            return Err(anyhow!("sftp subsystem request failed. tail={tail:?}"));
        }
        if last_report.elapsed() > Duration::from_secs(2) {
            last_report = Instant::now();
            let tail = all.chars().rev().take(240).collect::<String>().chars().rev().collect::<String>();
            log("sftp:wait", &format!("waiting for prompt... tail={tail:?}"));
        }
        if start.elapsed() > timeout {
            let tail = all.chars().rev().take(800).collect::<String>().chars().rev().collect::<String>();
            return Err(anyhow!("timeout waiting for sftp prompt. tail={tail:?}"));
        }
        std::thread::sleep(Duration::from_millis(50));
    }
}

fn run_ssh(host: &str, port: u16, user: &str, password: &str) -> Result<()> {
    log("ssh:start", &format!("{user}@{host}:{port}"));
    let mut cmd = CommandBuilder::new("ssh");
    cmd.arg("-tt");
    cmd.arg("-p");
    cmd.arg(port.to_string());
    cmd.arg("-o");
    cmd.arg("StrictHostKeyChecking=accept-new");
    cmd.arg("-o");
    cmd.arg(format!("UserKnownHostsFile={}", temp_known_hosts_path().display()));
    cmd.arg("-o");
    cmd.arg("PreferredAuthentications=password");
    cmd.arg("-o");
    cmd.arg("PubkeyAuthentication=no");
    cmd.arg(format!("{user}@{host}"));
    let marker = format!("__ZSSH_FUNC_TEST_SSH_OK__{}", std::process::id());
    cmd.arg(format!("echo {marker}"));

    let pty = open_pty(cmd, 120, 30)?;

    let _ = handshake_password(&pty, password, Duration::from_secs(30), true, "ssh:auth");
    let _ = wait_until(&pty, Duration::from_secs(30), "ssh marker", |s| s.contains(&marker))?;
    let _ = pty.child.lock().unwrap().wait();
    log("ssh:ok", "marker received");
    Ok(())
}

fn run_sftp(host: &str, port: u16, user: &str, password: &str) -> Result<()> {
    log("sftp:start", &format!("{user}@{host}:{port}"));
    let mut cmd = CommandBuilder::new("sftp");
    cmd.arg("-P");
    cmd.arg(port.to_string());
    cmd.arg("-o");
    cmd.arg("StrictHostKeyChecking=accept-new");
    cmd.arg("-o");
    cmd.arg(format!("UserKnownHostsFile={}", temp_known_hosts_path().display()));
    cmd.arg("-o");
    cmd.arg("PreferredAuthentications=password");
    cmd.arg("-o");
    cmd.arg("PubkeyAuthentication=no");
    cmd.arg(format!("{user}@{host}"));

    let pty = open_pty(cmd, 120, 30)?;
    wait_sftp_prompt_with_handshake(&pty, password, Duration::from_secs(60))?;
    let mut pos = buf_len(&pty);
    log("sftp:cmd", "pwd");
    write_line_crlf(&pty, "pwd")?;
    wait_sftp_cmd(&pty, &mut pos, Duration::from_secs(20), "pwd", |s| s.to_ascii_lowercase().contains("remote working directory"))?;
    log("sftp:cmd", "ls -la");
    write_line_crlf(&pty, "ls -la")?;
    wait_sftp_cmd(&pty, &mut pos, Duration::from_secs(30), "ls -la", |s| s.to_ascii_lowercase().contains("sftp>"))?;
    log("sftp:cmd", "bye");
    write_line_crlf(&pty, "bye")?;

    let start = Instant::now();
    loop {
        if let Some(_s) = pty.child.lock().unwrap().try_wait()? {
            break;
        }
        if start.elapsed() > Duration::from_secs(10) {
            return Err(anyhow!("timeout waiting for sftp exit"));
        }
        std::thread::sleep(Duration::from_millis(50));
    }
    log("sftp:ok", "prompt and commands completed");
    Ok(())
}

fn main() -> Result<()> {
    let host = env("ZSSH_TEST_HOST").ok_or_else(|| anyhow!("missing env: ZSSH_TEST_HOST"))?;
    let user = env("ZSSH_TEST_USER").ok_or_else(|| anyhow!("missing env: ZSSH_TEST_USER"))?;
    let password = env("ZSSH_TEST_PASSWORD").ok_or_else(|| anyhow!("missing env: ZSSH_TEST_PASSWORD"))?;
    let port = env("ZSSH_TEST_PORT").and_then(|v| v.parse::<u16>().ok()).unwrap_or(22);
    let mode = env("ZSSH_TEST_MODE").unwrap_or_else(|| "all".to_string());

    if mode == "ssh" || mode == "all" {
        run_ssh(&host, port, &user, &password)?;
    }
    if mode == "sftp" || mode == "all" {
        run_sftp(&host, port, &user, &password)?;
    }
    Ok(())
}
