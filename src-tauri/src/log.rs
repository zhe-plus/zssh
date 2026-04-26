/// ZSSH Logging Module
/// Provides structured, level-filtered logging with dynamic runtime control.
///
/// Usage:
///   crate::info!(session_id = %id, "session_start");
///
/// Runtime control via environment variables:
///   ZSSH_LOG=debug     -> show all levels (trace, debug, info, warn, error)
///   ZSSH_LOG=info      -> show info and above (default)
///   ZSSH_LOG=warn      -> show warn and above
///   ZSSH_LOG=error     -> show only errors
///   ZSSH_LOG=off       -> disable all logging
///
/// Also respects the legacy ZSSH_DEBUG flag for backward compatibility.

use std::fmt;
use std::sync::atomic::{AtomicU8, Ordering};

// ========================
// Log Levels
// ========================

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Level {
    Trace = 0,
    Debug = 1,
    Info = 2,
    Warn = 3,
    Error = 4,
}

impl Level {
    pub fn from_str(s: &str) -> Option<Self> {
        match s.to_lowercase().as_str() {
            "trace" | "t" => Some(Level::Trace),
            "debug" | "d" => Some(Level::Debug),
            "info" | "i" => Some(Level::Info),
            "warn" | "w" => Some(Level::Warn),
            "error" | "e" => Some(Level::Error),
            "off" | "none" => None, // Special: disable all
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Level::Trace => "TRACE",
            Level::Debug => "DEBUG",
            Level::Info => "INFO ",
            Level::Warn => "WARN ",
            Level::Error => "ERROR",
        }
    }
}

impl fmt::Display for Level {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.as_str())
    }
}

// ========================
// Global Log Level (atomic for thread safety)
// ========================

static LOG_LEVEL: AtomicU8 = AtomicU8::new(Level::Info as u8);

/// Initialize logging from environment variable.
/// Call once at app startup (in setup).
pub fn init() {
    if let Ok(level_str) = std::env::var("ZSSH_LOG") {
        if level_str.to_lowercase() == "off" || level_str.to_lowercase() == "none" {
            LOG_LEVEL.store(u8::MAX, Ordering::Relaxed);
            return;
        }
        
        if let Some(level) = Level::from_str(&level_str) {
            set_level(level);
            eprintln!("[zssh] log level set to {}", level.as_str().trim());
        } else {
            eprintln!("[zssh] unknown ZSSH_LOG value '{}', using default (info)", level_str);
        }
    } else if std::env::var_os("ZSSH_DEBUG").is_some() {
        set_level(Level::Debug);
        eprintln!("[zssh] ZSSH_DEBUG detected, log level = DEBUG");
    }
}

/// Set the minimum log level at runtime.
pub fn set_level(level: Level) {
    LOG_LEVEL.store(level as u8, Ordering::Relaxed);
}

/// Get the current minimum log level.
pub fn get_level() -> Level {
    match LOG_LEVEL.load(Ordering::Relaxed) {
        u8::MAX => Level::Error, // Off sentinel
        v => match v {
            0 => Level::Trace,
            1 => Level::Debug,
            2 => Level::Info,
            3 => Level::Warn,
            4 => Level::Error,
            _ => Level::Info,
        },
    }
}

/// Check if a given level would be logged at current settings.
fn should_log(level: Level) -> bool {
    let current = LOG_LEVEL.load(Ordering::Relaxed);
    if current == u8::MAX { return false; } // off
    level as u8 >= current
}

/// Format timestamp in ISO-like format using time crate
fn format_timestamp() -> String {
    use std::time::{SystemTime, UNIX_EPOCH};
    let duration = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default();
    let secs = duration.as_secs();
    
    // Try to use time crate for nice formatting, fall back to epoch seconds
    match time::OffsetDateTime::from_unix_timestamp(secs as i64) {
        Ok(dt) => dt.format(&time::format_description::well_known::Rfc3339)
            .unwrap_or_else(|_| secs.to_string()),
        Err(_) => secs.to_string(),
    }
}

// ========================
// Internal log implementation function
// ========================

#[doc(hidden)]
pub fn __log_impl(level: Level, msg: fmt::Arguments<'_>) {
    if should_log(level) {
        let ts = format_timestamp();
        eprintln!("[zssh] [{}] {} - {}", ts, level.as_str(), msg);
    }
}

// ========================
// Public log macros
// ========================

/// Log at TRACE level (most verbose)
#[macro_export]
macro_rules! trace {
    ($($arg:tt)+) => { $crate::log::__log_impl($crate::log::Level::Trace, format_args!($($arg)+)) };
}

/// Log at DEBUG level
#[macro_export]
macro_rules! debug_log {
    ($($arg:tt)+) => { $crate::log::__log_impl($crate::log::Level::Debug, format_args!($($arg)+)) };
}

/// Log at INFO level (default)
#[macro_export]
macro_rules! info {
    ($($arg:tt)+) => { $crate::log::__log_impl($crate::log::Level::Info, format_args!($($arg)+)) };
}

/// Log at WARN level
#[macro_export]
macro_rules! warn {
    ($($arg:tt)+) => { $crate::log::__log_impl($crate::log::Level::Warn, format_args!($($arg)+)) };
}

/// Log at ERROR level
#[macro_export]
macro_rules! error {
    ($($arg:tt)+) => { $crate::log::__log_impl($crate::log::Level::Error, format_args!($($arg)+)) };
}

// ========================
// Tauri command to get/set log level from frontend
// ========================

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct LogLevelInfo {
    pub current_level: String,
    pub available_levels: Vec<String>,
}

/// Get current log level (for frontend display)
#[tauri::command]
pub fn log_get_level_cmd() -> LogLevelInfo {
    let level = get_level();
    LogLevelInfo {
        current_level: level.as_str().trim().to_string(),
        available_levels: vec![
            "off".to_string(),
            "error".to_string(), 
            "warn".to_string(),
            "info".to_string(),
            "debug".to_string(),
            "trace".to_string(),
        ],
    }
}

/// Set log level from frontend
#[tauri::command]
pub fn log_set_level_cmd(level: String) -> Result<String, String> {
    match Level::from_str(&level) {
        Some(l) => {
            set_level(l);
            Ok(format!("Log level set to {}", l.as_str().trim()))
        },
        None if level.to_lowercase() == "off" || level.to_lowercase() == "none" => {
            LOG_LEVEL.store(u8::MAX, Ordering::Relaxed);
            Ok("Logging disabled".to_string())
        },
        None => Err(format!("Unknown log level: {}. Valid: off, error, warn, info, debug, trace", level)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_level_ordering() {
        assert!(Level::Error > Level::Warn);
        assert!(Level::Warn > Level::Info);
        assert!(Level::Info > Level::Debug);
        assert!(Level::Debug > Level::Trace);
    }

    #[test]
    fn test_level_from_str() {
        assert_eq!(Level::from_str("debug"), Some(Level::Debug));
        assert_eq!(Level::from_str("DEBUG"), Some(Level::Debug));
        assert_eq!(Level::from_str("D"), Some(Level::Debug));
        assert_eq!(Level::from_str("off"), None);
        assert_eq!(Level::from_str("invalid"), None);
    }

    #[test]
    fn test_set_and_get_level() {
        let original = get_level();
        set_level(Level::Debug);
        assert_eq!(get_level(), Level::Debug);
        set_level(original); // Restore
    }

    #[test]
    fn test_should_log() {
        set_level(Level::Info);
        assert!(should_log(Level::Warn));
        assert!(should_log(Level::Info));
        assert!(!should_log(Level::Debug));
        assert!(!should_log(Level::Trace));
        set_level(Level::Info); // Restore default
    }

    #[test]
    fn test_off_mode() {
        LOG_LEVEL.store(u8::MAX, Ordering::Relaxed);
        assert!(!should_log(Level::Error));
        set_level(Level::Info); // Restore
    }
}
