use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct AppConfig {
    pub schema_version: u32,
    pub settings: Settings,
    pub groups: Vec<Group>,
    pub sessions: Vec<Session>,
}

impl Default for AppConfig {
    fn default() -> Self {
        Self {
            schema_version: 1,
            settings: Settings::default(),
            groups: vec![Group {
                id: Uuid::new_v4(),
                name: "默认".to_string(),
                sort_index: 0,
            }],
            sessions: vec![],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", default)]
pub struct Settings {
    pub theme: String,
    pub font_family: String,
    pub font_size: u32,
    pub line_height: f32,
    pub language: String,
    pub layout_mode: String,
    pub shortcuts: BTreeMap<String, String>,
    pub common_commands: Vec<CommonCommand>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommonCommand {
    pub id: String,
    pub name: String,
    pub command: String,
}

impl Default for Settings {
    fn default() -> Self {
        let mut shortcuts = BTreeMap::new();
        shortcuts.insert("newSession".to_string(), "Ctrl+T".to_string());
        shortcuts.insert("closeTab".to_string(), "Ctrl+W".to_string());
        shortcuts.insert("nextTab".to_string(), "Ctrl+Tab".to_string());
        shortcuts.insert("prevTab".to_string(), "Ctrl+Shift+Tab".to_string());
        shortcuts.insert("toggleSidebar".to_string(), "Ctrl+Alt+B".to_string());
        shortcuts.insert("openSettings".to_string(), "Ctrl+Alt+,".to_string());
        shortcuts.insert("commandPalette".to_string(), "Ctrl+Shift+P".to_string());
        shortcuts.insert("newTab".to_string(), "Ctrl+N".to_string());
        shortcuts.insert("copy".to_string(), "Ctrl+Shift+C".to_string());
        Self {
            theme: "github-dark".to_string(),
            font_family: "Consolas".to_string(),
            font_size: 14,
            line_height: 1.2,
            language: "zh-CN".to_string(),
            layout_mode: "compact".to_string(),
            shortcuts,
            common_commands: vec![
                CommonCommand {
                    id: "pwd".to_string(),
                    name: "pwd（当前目录）".to_string(),
                    command: "pwd".to_string(),
                },
                CommonCommand {
                    id: "ls-la".to_string(),
                    name: "ls -la（列表）".to_string(),
                    command: "ls -la".to_string(),
                },
                CommonCommand {
                    id: "whoami".to_string(),
                    name: "whoami（当前用户）".to_string(),
                    command: "whoami".to_string(),
                },
                CommonCommand {
                    id: "uname-a".to_string(),
                    name: "uname -a（系统信息）".to_string(),
                    command: "uname -a".to_string(),
                },
            ],
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Group {
    pub id: Uuid,
    pub name: String,
    pub sort_index: i32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Session {
    pub id: Uuid,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub protocol: Protocol,
    pub auth: Auth,
    pub appearance: Appearance,
    pub connection: ConnectionOptions,
    pub group_id: Option<Uuid>,
    pub favorite: bool,
    pub sort_index: i32,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Appearance {
    pub theme: Option<String>,
    pub font_family: Option<String>,
    pub font_size: Option<u32>,
    pub line_height: Option<f32>,
    pub encoding: String,
}

impl Default for Appearance {
    fn default() -> Self {
        Self {
            theme: None,
            font_family: None,
            font_size: None,
            line_height: None,
            encoding: "utf-8".to_string(),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionOptions {
    pub connect_timeout_seconds: Option<u32>,
    pub keep_alive_interval_seconds: Option<u32>,
}

impl Default for ConnectionOptions {
    fn default() -> Self {
        Self {
            connect_timeout_seconds: Some(15),
            keep_alive_interval_seconds: Some(30),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum Protocol {
    Ssh,
    Telnet,
    Rlogin,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum Auth {
    Password {
        password_dpapi: Option<String>,
    },
    Key {
        private_key_path: String,
        passphrase_dpapi: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SessionPublic {
    pub id: Uuid,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub protocol: Protocol,
    pub auth_type: String,
    pub has_password: bool,
    pub has_key_passphrase: bool,
    pub private_key_path: Option<String>,
    pub appearance: Appearance,
    pub connection: ConnectionOptions,
    pub group_id: Option<Uuid>,
    pub favorite: bool,
    pub sort_index: i32,
    pub created_at: i64,
    pub updated_at: i64,
}

impl From<&Session> for SessionPublic {
    fn from(s: &Session) -> Self {
        match &s.auth {
            Auth::Password { password_dpapi } => Self {
                id: s.id,
                name: s.name.clone(),
                host: s.host.clone(),
                port: s.port,
                username: s.username.clone(),
                protocol: s.protocol.clone(),
                auth_type: "password".to_string(),
                has_password: password_dpapi.is_some(),
                has_key_passphrase: false,
                private_key_path: None,
                appearance: s.appearance.clone(),
                connection: s.connection.clone(),
                group_id: s.group_id,
                favorite: s.favorite,
                sort_index: s.sort_index,
                created_at: s.created_at,
                updated_at: s.updated_at,
            },
            Auth::Key {
                private_key_path,
                passphrase_dpapi,
            } => Self {
                id: s.id,
                name: s.name.clone(),
                host: s.host.clone(),
                port: s.port,
                username: s.username.clone(),
                protocol: s.protocol.clone(),
                auth_type: "key".to_string(),
                has_password: false,
                has_key_passphrase: passphrase_dpapi.is_some(),
                private_key_path: Some(private_key_path.clone()),
                appearance: s.appearance.clone(),
                connection: s.connection.clone(),
                group_id: s.group_id,
                favorite: s.favorite,
                sort_index: s.sort_index,
                created_at: s.created_at,
                updated_at: s.updated_at,
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertSessionInput {
    pub id: Option<Uuid>,
    pub name: String,
    pub host: String,
    pub port: u16,
    pub username: String,
    pub protocol: Protocol,
    pub auth: UpsertAuthInput,
    pub appearance: Option<Appearance>,
    pub connection: Option<ConnectionOptions>,
    pub group_id: Option<Uuid>,
    pub favorite: bool,
    pub sort_index: Option<i32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase", tag = "type")]
pub enum UpsertAuthInput {
    Password {
        password: Option<String>,
    },
    Key {
        private_key_path: String,
        passphrase: Option<String>,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpsertGroupInput {
    pub id: Option<Uuid>,
    pub name: String,
    pub sort_index: Option<i32>,
}
