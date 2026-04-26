import type { SessionPublic } from "../types";

/**
 * Supported variables for quick command templates
 * - ${host} - SSH host address
 * - ${user} - Username
 * - ${port} - Port number
 * - ${name} - Session name
 * - ${date} - Current date (YYYY-MM-DD)
 * - ${datetime} - Current datetime (YYYY-MM-DD HH:mm:ss)
 * - ${timestamp} - Unix timestamp
 */

export interface VariableContext {
  host?: string;
  user?: string;
  port?: number;
  name?: string;
}

export const SUPPORTED_VARIABLES: { key: string; label: Record<string, string>; description: Record<string, string> }[] = [
  {
    key: "host",
    label: { "zh-CN": "主机地址", "zh-TW": "主機地址", "en-US": "Host" },
    description: { "zh-CN": "SSH 连接的目标主机 IP 或域名", "zh-TW": "SSH連線的目標主機IP或域名", "en-US": "Target SSH host IP or domain" },
  },
  {
    key: "user",
    label: { "zh-CN": "用户名", "zh-TW": "使用者名稱", "en-US": "Username" },
    description: { "zh-CN": "当前会话的登录用户名", "zh-TW": "當前會話的登入使用者名稱", "en-US": "Session login username" },
  },
  {
    key: "port",
    label: { "zh-CN": "端口", "zh-TW": "端口", "en-US": "Port" },
    description: { "zh-CN": "SSH 端口号（默认22）", "zh-TW": "SSH端口號（預設22）", "en-US": "SSH port number (default 22)" },
  },
  {
    key: "name",
    label: { "zh-CN": "会话名称", "zh-TW": "會話名稱", "en-US": "Session Name" },
    description: { "zh-CN": "当前会话的显示名称", "zh-TW": "當前會話的顯示名稱", "en-US": "Current session display name" },
  },
  {
    key: "date",
    label: { "zh-CN": "日期", "zh-TW": "日期", "en-US": "Date" },
    description: { "zh-CN": "当前日期 YYYY-MM-DD", "zh-TW": "當前日期 YYYY-MM-DD", "en-US": "Current date in YYYY-MM-DD format" },
  },
  {
    key: "datetime",
    label: { "zh-CN": "时间", "zh-TW": "時間", "en-US": "DateTime" },
    description: { "zh-CN": "当前日期时间 YYYY-MM-DD HH:mm:ss", "zh-TW": "當前日期時間 YYYY-MM-DD HH:mm:ss", "en-US": "Current date time in YYYY-MM-DD HH:mm:ss" },
  },
  {
    key: "timestamp",
    label: { "zh-CN": "时间戳", "zh-TW": "時間戳", "en-US": "Timestamp" },
    description: { "zh-CN": "Unix 时间戳（秒）", "zh-TW": "Unix時間戳（秒）", "en-US": "Unix timestamp in seconds" },
  },
];

/**
 * Replace all variables in a command template with values from context
 */
export function replaceVariables(template: string, context: VariableContext): string {
  const now = new Date();

  // Build variable map
  const vars: Record<string, string> = {
    host: context.host ?? "",
    user: context.user ?? "",
    port: String(context.port ?? 22),
    name: context.name ?? "",
    date: formatDate(now),
    datetime: formatDateTime(now),
    timestamp: String(Math.floor(now.getTime() / 1000)),
  };

  let result = template;

  // Replace each variable
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\$\\{${key}\\}`, "g"), value);
    // Also support $key without braces
    if (!["date", "datetime", "timestamp"].includes(key)) {
      result = result.replace(new RegExp(`\\$\\{${key}\\}`, "g"), value);
    }
  }

  return result;
}

/**
 * Extract session context from SessionPublic for variable replacement
 */
export function getSessionContext(session: SessionPublic): VariableContext {
  return {
    host: session.host,
    user: session.username,
    port: session.port,
    name: session.name || `${session.username}@${session.host}`,
  };
}

/**
 * Get list of unresolved variable names in a template
 */
export function getUnresolvedVariables(template: string): string[] {
  const matches = template.matchAll(/\$\{(\w+)\}/g);
  const found = new Set<string>();
  for (const match of matches) {
    found.add(match[1]);
  }
  return [...found].filter(
    (v) => !SUPPORTED_VARIABLES.some((sv) => sv.key === v),
  );
}

/**
 * Check if a template contains any variables
 */
export function hasVariables(template: string): boolean {
  return /\$\{[\w]+\}/.test(template);
}

// Helper formatting functions
function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateTime(d: Date): string {
  return `${formatDate(d)} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
