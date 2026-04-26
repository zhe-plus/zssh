export type DebugLevel = "debug" | "info" | "warn" | "error";

function enabled(): boolean {
  if (import.meta.env.DEV) return true;
  try {
    return localStorage.getItem("zssh.debug") === "1";
  } catch {
    return false;
  }
}

export function dbg(level: DebugLevel, event: string, data?: unknown) {
  if (!enabled()) return;
  const ts = new Date().toISOString();
  const payload = data === undefined ? "" : data;
  const fn = level === "error" ? console.error : level === "warn" ? console.warn : level === "info" ? console.info : console.log;
  fn(`[zssh ${ts}] ${event}`, payload);
}

export function dbgEnabled(): boolean {
  return enabled();
}

export function safeStr(s: string, maxLen = 80): string {
  const t = s.replace(/\r/g, "\\r").replace(/\n/g, "\\n");
  if (t.length <= maxLen) return t;
  return `${t.slice(0, maxLen)}…(+${t.length - maxLen})`;
}
